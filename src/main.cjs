const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, globalShortcut, Notification, dialog, powerMonitor, screen, nativeTheme } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { Store, pendingReminders, pendingStartReminders, pendingGoalReminders, goalStats } = require('./model.cjs');
const { panelBounds, dimensions, dragBounds } = require('./panel-bounds.cjs');
const { WindowsPanel } = require('./windows-panel.cjs');
const windowsPanel = process.platform === 'win32' ? new WindowsPanel() : null;
let logicalPanelBounds = null, gesture = null;
let win, panel, tray, store, quitting = false, timer, positionTimer, panelReady = false;
let savedPanelPosition = null;
let panelLoadError = '';
let panelNativeError = '';
const notices = new Set();
const page = pathToFileURL(path.join(__dirname, 'index.html')).href;
const panelPage = pathToFileURL(path.join(__dirname, 'panel.html')).href;
const icon = path.join(__dirname, 'icon.png');
function show(add = false) {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show(); win.focus();
  if (add) win.webContents.send('quick-add');
}
function syncAppearance() {
  const appearance=store.state.settings.appearance;
  if(nativeTheme && nativeTheme.themeSource!==appearance)nativeTheme.themeSource=appearance;
  const dark=appearance==='dark'||(appearance==='system'&&nativeTheme?.shouldUseDarkColors);
  win?.setBackgroundColor?.(dark?'#1d1f25':'#ffffff');
  panel?.setBackgroundColor?.(dark?'#252a34':'#fdfdff');
}
function send() { syncAppearance(); for (const w of [win, panel]) if (w && !w.isDestroyed()) w.webContents.send('state', store.state); }
function message(text) { for (const w of [win, panel]) if (w && !w.isDestroyed()) w.webContents.send('message', text); }
function persistPanelPosition() {
  clearTimeout(positionTimer);
  if (!panel || panel.isDestroyed()) return;
  const { x, y } = logicalPanelBounds || panel.getBounds();
  savedPanelPosition = { x, y };
  const file = path.join(app.getPath('userData'), 'panel-position.json');
  try { fs.writeFileSync(file + '.tmp', JSON.stringify(savedPanelPosition)); fs.renameSync(file + '.tmp', file); }
  catch (e) { message('面板位置未保存：' + e.message); }
}
async function panelMode(reset = false) {
  if (quitting || !panel || panel.isDestroyed()) return;
  const s = store.state.settings;
  const primary = screen.getPrimaryDisplay();
  const displays = [primary, ...screen.getAllDisplays().filter(d => d.id !== primary.id)].map(d => d.workArea);
  const position = reset ? null : logicalPanelBounds || savedPanelPosition;
  const size = gesture && gesture.edge !== 'move' ? logicalPanelBounds : s.panelCurrentSize;
  logicalPanelBounds = panelBounds(position, displays, size, s.panelCollapsed);
  if (!windowsPanel) { panel.setBounds(logicalPanelBounds); panel.setAlwaysOnTop(s.panelPinned); }
  if (['win32', 'darwin'].includes(process.platform)) panel.setOpacity(s.panelOpacity);
  if (windowsPanel) {
    const nativeHandle=panel.getNativeWindowHandle();
    const hwnd=nativeHandle.length===8?nativeHandle.readBigUInt64LE().toString():nativeHandle.readUInt32LE().toString();
    const physical=screen.dipToScreenRect(null,logicalPanelBounds);
    try {
      await windowsPanel.apply({hwnd,pinned:s.panelPinned,visible:s.panelEnabled,...physical});
      panelNativeError='';
    } catch(e) {
      if(quitting)return false;
      panelNativeError=e.message;
      message('固定到桌面失败：'+e.message+'。面板将恢复为置顶显示。');
      store.settings({panelPinned:true}); send();
      try {await windowsPanel.apply({hwnd,pinned:true,visible:s.panelEnabled,...physical});} catch {}
      panel.setAlwaysOnTop(true);
      if(s.panelEnabled)panel.show();
      return false;
    }
  } else if (s.panelEnabled) {
    if (panel.isMinimized()) panel.restore();
    panel.showInactive();
  } else panel.hide();
  return true;
}
async function recoverPanel() {
  store.settings({ panelEnabled: true, panelPinned: true, panelCollapsed: false, panelOpacity: 1 });
  if (!panel || panel.isDestroyed()) createPanel();
  await panelMode(true);
  panel.show(); panel.moveTop(); panel.focus();
  persistPanelPosition(); send(); refreshTray();
  if (panelLoadError) throw Error('面板页面加载失败：' + panelLoadError + '。请确认解压后的 src/panel.html 文件存在。');
  return store.state;
}
function togglePanel(enabled) {
  store.settings({ panelEnabled: enabled }); panelMode(); send(); refreshTray();
}
function refreshTray() {
  if (!tray) return;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '打开日程', click: () => show() },
    { label: '快速添加', click: () => show(true) },
    { type: 'separator' },
    { label: '显示桌面面板', type: 'checkbox', checked: store.state.settings.panelEnabled, click: item => { try { togglePanel(item.checked); } catch(e) { message(e.message); } } },
    { label: '找回桌面面板', click: async () => { try { await recoverPanel(); } catch(e) { dialog.showErrorBox('面板显示失败', e.message); } } },
    { type: 'separator' }, { label: '完全退出', click: () => app.quit() }
  ]));
}
function createPanel() {
  panelReady = false; panelLoadError = '';
  try { savedPanelPosition = JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), 'panel-position.json'), 'utf8')); } catch { savedPanelPosition = null; }
  panel = new BrowserWindow({ width: 360, height: 600, title: 'Daymark · 桌面面板', icon,
    frame: false, transparent: false, backgroundColor: '#fdfdff', show: store.state.settings.panelEnabled,
    resizable: false, maximizable: false, fullscreenable: false, skipTaskbar: true, hasShadow: false,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  panel.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  panel.webContents.on('will-navigate', event => event.preventDefault());
  panel.on('close', event => {
    if (!quitting) { event.preventDefault(); try { togglePanel(false); } catch(e) { message(e.message); } }
  });
  panel.webContents.on('did-finish-load', () => { panelReady = true; panelLoadError = ''; panelMode(); send(); });
  panel.webContents.on('did-fail-load', (_event, code, description, _url, mainFrame) => {
    if (mainFrame === false || code === -3) return;
    panelReady = false; panelLoadError = `${description} (${code})`;
    dialog.showErrorBox('桌面面板加载失败', '请检查 src/panel.html 是否完整。\n' + panelLoadError);
  });
  panel.webContents.on('render-process-gone', (_event, details) => {
    panelReady = false; panelLoadError = '渲染进程退出：' + details.reason;
    message(panelLoadError + '，请完全退出应用后重新启动。');
  });
  panelMode();
  const loading = panel.loadFile(path.join(__dirname, 'panel.html'));
  loading?.catch(e => { panelLoadError = e.message; message('面板加载失败：' + e.message); });
}
function windowMode() {
  const compact = store.state.settings.compact;
  win.setAlwaysOnTop(store.state.settings.pinned);
  win.setMinimumSize(compact ? 380 : 860, 480);
  const area = screen.getDisplayMatching(win.getBounds()).workArea;
  const width = Math.min(compact ? 420 : 1140, area.width);
  const height = Math.min(compact ? 640 : 790, area.height);
  const old = win.getBounds();
  win.setBounds({ width, height, x: Math.max(area.x, Math.min(old.x, area.x + area.width - width)), y: Math.max(area.y, Math.min(old.y, area.y + area.height - height)) });
}
function checkReminders() {
  try {
    const before=store.state;store.change('ensure-recurring');if(before!==store.state)send();
    const pending = pendingReminders(store.state);
    const goals=pendingGoalReminders(store.state);
    const starts=pendingStartReminders(store.state);
    if (!pending.length && !goals.length && !starts.length) return;
    // Group overdue reminders after a restart / sleep, so the desktop is not flooded.
    const descriptions=[...starts.map(t=>'计划开始：'+t.title),...pending.map(t=>'截止提醒：'+t.title),...goals.map(g=>{const days=goalStats(g).days;return `${g.title}（${days>0?'剩余 '+days+' 天':days===0?'今天到期':'已到期 '+Math.abs(days)+' 天'}）`;} )];
    const text=descriptions.slice(0,3).join('；')+(descriptions.length>3?` 等 ${descriptions.length} 项事项`:'');
    message('日程提醒：' + text);
    if (Notification.isSupported()) {
      const n = new Notification({ title: 'Daymark · 日程提醒', body: text, icon });
      notices.add(n);
      n.on('click', () => show());
      n.on('close', () => notices.delete(n));
      n.on('failed', () => { notices.delete(n); message('系统通知未送达，请检查 Windows 通知设置；到期任务仍保留在面板中。'); });
      n.show();
    }
    if(pending.length)store.mark(pending.map(t => t.id));
    if(starts.length)store.change('mark-starts',starts.map(t=>t.id));
    if(goals.length)store.change('mark-goals',goals.map(g=>g.id));
    send();
  } catch (e) { message('提醒处理失败：' + e.message); }
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.setAppUserModelId('com.daymark.desktop');
  app.on('second-instance', () => show());
  app.on('before-quit', () => { quitting = true; clearInterval(timer); persistPanelPosition(); });
  app.on('will-quit', () => { globalShortcut.unregisterAll(); windowsPanel?.stop(); });
  app.whenReady().then(() => {
    try {
      store = new Store(path.join(app.getPath('userData'), 'tasks.json'));
      if (app.isPackaged && process.platform === 'win32') {
        const autoStart = app.getLoginItemSettings({ name: 'Daymark', path: process.execPath }).openAtLogin;
        if (store.state.settings.autoStart !== autoStart) store.settings({ autoStart });
      }
    }
    catch (e) {
      dialog.showErrorBox('无法读取任务数据', `为保护原始数据，应用已停止。可从 tasks.json.bak 恢复。\n目录：${app.getPath('userData')}\n${e.message}`);
      app.quit(); return;
    }
    win = new BrowserWindow({ width: 1140, height: 790, minWidth: 860, minHeight: 480, title: 'Daymark · 日程', icon, backgroundColor: '#f6f5f0', autoHideMenuBar: true,
      webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', event => event.preventDefault());
    win.on('close', event => {
      if (!quitting && (tray || (panel && panel.isVisible()))) { event.preventDefault(); win.hide(); }
      else if (!quitting) { event.preventDefault(); app.quit(); }
    });
    win.loadFile(path.join(__dirname, 'index.html'));
    windowMode();
    createPanel();
    syncAppearance();
    nativeTheme?.on('updated',syncAppearance);
    try {
      tray = new Tray(nativeImage.createFromPath(icon));
      tray.setToolTip('Daymark · 日程与截止提醒');
      refreshTray();
      tray.on('double-click', () => show());
    } catch { tray = null; }
    screen.on('display-removed', () => panelMode());
    screen.on('display-metrics-changed', () => panelMode());
    const registered = globalShortcut.register('CommandOrControl+Shift+Space', () => show(true));
    win.webContents.once('did-finish-load', () => {
      if (!registered) message('快捷键已被其他程序占用，请使用面板中的添加按钮。');
      checkReminders();
    });
    timer = setInterval(checkReminders, 15000);
    powerMonitor.on('resume', checkReminders);
    app.on('activate', () => show());
  }).catch(e => { dialog.showErrorBox('启动失败', e.message); app.quit(); });
}
ipcMain.handle('daymark', async (event, action, payload) => {
  const fromMain = event.sender === win?.webContents && event.senderFrame?.url === page;
  const fromPanel = event.sender === panel?.webContents && event.senderFrame?.url === panelPage;
  if (!fromMain && !fromPanel) throw Error('来源无效');
  if (action === 'app-info') return { version: app.getVersion(), packaged: app.isPackaged === true };
  if (action === 'get') return store.state;
  if (['save-goal','delete-goal','toggle-milestone','plan-milestone'].includes(action)) {
    const state=store.change(action,payload);send();return state;
  }
  if (action === 'open-goal') {
    if(payload&&!store.state.goals.some(g=>g.id===payload))throw Error('目标不存在');
    show();win.webContents.send('open-goal',payload||'');return;
  }
  if (action === 'panel-gesture-start') {
    if(!fromPanel || !['move','n','s','e','w','ne','nw','se','sw'].includes(payload?.edge) || !Number.isFinite(payload?.x) || !Number.isFinite(payload?.y)) throw Error('拖动参数无效');
    if(store.state.settings.panelCollapsed && payload.edge!=='move') return false;
    gesture={edge:payload.edge,x:payload.x,y:payload.y,original:{...logicalPanelBounds}};
    return true;
  }
  if (action === 'panel-gesture') {
    if(!fromPanel || !gesture || !Number.isFinite(payload?.x) || !Number.isFinite(payload?.y)) throw Error('拖动状态无效');
    logicalPanelBounds=dragBounds(gesture.original,payload.x-gesture.x,payload.y-gesture.y,gesture.edge);
    await panelMode();return logicalPanelBounds;
  }
  if (action === 'panel-gesture-end') {
    if(!fromPanel)throw Error('来源无效');
    if(gesture && gesture.edge!=='move')store.settings({panelCurrentSize:dimensions(logicalPanelBounds)});
    gesture=null;persistPanelPosition();send();return store.state;
  }
  if (action === 'panel-default-size') {
    store.settings({panelCurrentSize:store.state.settings.panelDefaultSize,panelCollapsed:false});
    await panelMode();send();return store.state;
  }
  if (action === 'open-main') { show(); return; }
  if (action === 'open-add') { show(true); return; }
  if (action === 'open-task') {
    if (!store.state.tasks.some(t => t.id === payload)) throw Error('任务不存在');
    show(); win.webContents.send('edit-task', payload); return;
  }
  if (action === 'panel-hide') {
    // Never leave the app inaccessible if the OS did not create a tray icon.
    if (!tray && !win.isVisible()) show();
    togglePanel(false); return store.state;
  }
  if (action === 'panel-reset') return recoverPanel();
  if (action === 'toggle-task') {
    const current = store.state.tasks.find(t => t.id === payload);
    if (!current) throw Error('任务不存在');
    const state = store.save({ ...current, done: !current.done }); send(); return state;
  }
  if (action === 'save') { const state = store.save(payload); send(); return state; }
  if (action === 'delete') { const state = store.remove(payload); send(); return state; }
  if (action === 'settings') {
    const allowed = {};
    if(['system','light','dark'].includes(payload?.appearance))allowed.appearance=payload.appearance;
    for (const k of ['pinned', 'compact', 'autoStart', 'panelEnabled', 'panelPinned', 'panelCollapsed']) if (typeof payload?.[k] === 'boolean') allowed[k] = payload[k];
    if (Number.isFinite(payload?.panelOpacity)) allowed.panelOpacity = Math.max(0.7, Math.min(1, payload.panelOpacity));
    if (['small', 'normal', 'large'].includes(payload?.panelSize)) allowed.panelSize = payload.panelSize;
    if(payload?.panelDefaultSize)allowed.panelDefaultSize=dimensions(payload.panelDefaultSize);
    if(payload?.panelCurrentSize)allowed.panelCurrentSize=dimensions(payload.panelCurrentSize);
    if(allowed.panelSize)allowed.panelCurrentSize=dimensions({width:allowed.panelSize==='small'?320:allowed.panelSize==='large'?400:360,height:allowed.panelSize==='small'?460:allowed.panelSize==='large'?740:600});
    if ('autoStart' in allowed) {
      if (!app.isPackaged || process.platform !== 'win32') throw Error('开机启动需在 Windows 安装版中设置');
      app.setLoginItemSettings({ openAtLogin: allowed.autoStart, name: 'Daymark', path: process.execPath });
      allowed.autoStart = app.getLoginItemSettings({ name: 'Daymark', path: process.execPath }).openAtLogin;
    }
    store.settings(allowed);
    if ('pinned' in allowed || 'compact' in allowed) windowMode();
    if (!tray && allowed.panelEnabled === false && !win.isVisible()) show();
    const applied=await panelMode(); refreshTray(); send();
    if(applied===false)throw Error('桌面模式未启用，已恢复置顶：'+panelNativeError);
    return store.state;
  }
  if (action === 'export') {
    const result = await dialog.showSaveDialog(win, { defaultPath: `Daymark-${new Date().toISOString().slice(0,10)}.json`, filters: [{ name: 'JSON 备份', extensions: ['json'] }] });
    if (!result.canceled) fs.writeFileSync(result.filePath, JSON.stringify(store.state, null, 2), 'utf8');
    return !result.canceled;
  }
  if (action === 'import') {
    const result = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: [{ name: 'JSON 备份', extensions: ['json'] }] });
    if (result.canceled) return null;
    const file = result.filePaths[0];
    if (fs.statSync(file).size > 20 * 1024 * 1024) throw Error('备份文件超过 20 MB');
    const state = store.merge(JSON.parse(fs.readFileSync(file, 'utf8'))); send(); return state;
  }
  if (action === 'quit') { app.quit(); return; }
  throw Error('未知操作');
});
