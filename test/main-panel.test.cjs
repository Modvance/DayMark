const {test}=require('node:test');
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const vm=require('node:vm');
const {pathToFileURL}=require('node:url');
for(const variant of ['linux','win32','win32-packaged'])test('panel lifecycle and geometry: '+variant,async t=>{
  const platform=variant.startsWith('win32')?'win32':'linux',packaged=variant==='win32-packaged';
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'daymark-windows-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const windows=[], handlers={}, nativeCommands=[];let failNative=false;
  class NativeBridge { async apply(command) {nativeCommands.push(command);if(failNative && !command.pinned)throw Error("mock attachment failure"); const panel=windows[1];panel.bounds={x:command.x,y:command.y,width:command.width,height:command.height};panel.visible=command.visible;panel.pinned=command.pinned;return command.pinned?"pinned":"desktop";} stop(){} }
  class Window extends EventEmitter {
    constructor(options){super();this.options=options;this.visible=options.show!==false;this.bounds={x:100,y:100,width:options.width,height:options.height};this.sent=[];this.webContents=new EventEmitter();this.webContents.send=(...args)=>this.sent.push(args);this.webContents.setWindowOpenHandler=()=>{};windows.push(this);}
    isDestroyed(){return false;} isMinimized(){return false;} isVisible(){return this.visible;}
    show(){this.visible=true;} showInactive(){this.visible=true;} hide(){this.visible=false;} focus(){this.focused=true;} restore(){} moveTop(){this.raised=true;}
    setMinimumSize(){} setAlwaysOnTop(value){this.pinned=value;} setOpacity(value){this.opacity=value;}
    getNativeWindowHandle(){const handle=Buffer.alloc(8);handle.writeBigUInt64LE(123n);return handle;} getBounds(){return this.bounds;} setBounds(value){this.bounds={...value};}
    loadFile(file){this.url=pathToFileURL(file).href;}
  }
  let loginEnabled=packaged;const loginChanges=[];
  const app=new EventEmitter();Object.assign(app,{isPackaged:packaged,getVersion:()=>require('../package.json').version,getLoginItemSettings:()=>({openAtLogin:loginEnabled}),setLoginItemSettings:options=>{loginChanges.push(options);loginEnabled=options.openAtLogin;},requestSingleInstanceLock:()=>true,setAppUserModelId:()=>{},getPath:()=>dir,whenReady:()=>Promise.resolve(),quit:()=>app.emit('before-quit')});
  class Tray extends EventEmitter {setToolTip(){} setContextMenu(menu){this.menu=menu;}}
  const screen=new EventEmitter();Object.assign(screen,{getPrimaryDisplay:()=>({id:1,workArea:{x:0,y:0,width:1920,height:1040}}),getAllDisplays:()=>[screen.getPrimaryDisplay()],dipToScreenRect:(_window,rect)=>rect,getDisplayMatching:()=>screen.getPrimaryDisplay()});
  const electron={app,BrowserWindow:Window,Tray,Menu:{buildFromTemplate:items=>items},nativeImage:{createFromPath:()=>({})},globalShortcut:{register:()=>true,unregisterAll:()=>{}},Notification:{isSupported:()=>false},dialog:{showErrorBox:(_title,message)=>{throw Error(message)}},powerMonitor:new EventEmitter(),screen,ipcMain:{handle:(name,callback)=>handlers[name]=callback}};
  const root=path.resolve(__dirname,'../src');
  vm.runInNewContext(fs.readFileSync(path.join(root,'main.cjs'),'utf8'),{require:name=>name==='electron'?electron:name==='./windows-panel.cjs'?{WindowsPanel:NativeBridge}:name.startsWith('./')?require(path.join(root,name)):require(name),__dirname:root,process:{platform,env:process.env,execPath:'C:\\Users\\User\\Apps\\Daymark\\Daymark.exe'},setTimeout:()=>1,clearTimeout:()=>{},setInterval:()=>1,clearInterval:()=>{}});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(windows.length,2);
  const [main,panel]=windows;
  // No ready-to-show event: startup and recovery must still make the panel visible.
  assert.equal(panel.visible,true);
  assert.equal(panel.options.frame,false);assert.equal(panel.options.transparent,false);assert.equal(panel.options.skipTaskbar,true);
  assert.equal(panel.options.parent,undefined);assert.equal(panel.visible,true);
  const invoke=(w,action,payload)=>handlers.daymark({sender:w.webContents,senderFrame:{url:w.url}},action,payload);
  const info=await invoke(main,'app-info');assert.equal(info.version,require('../package.json').version);assert.equal(info.packaged,packaged);
  if(packaged){
    assert.equal((await invoke(main,'get')).settings.autoStart,true,'startup reads the actual Windows login setting');
    await invoke(main,'settings',{autoStart:false});
    assert.equal((await invoke(main,'get')).settings.autoStart,false);
    await invoke(main,'settings',{autoStart:true});
    assert.equal((await invoke(main,'get')).settings.autoStart,true);
    assert.equal(loginChanges.at(-1).name,'Daymark');
    assert.equal(loginChanges.at(-1).path,'C:\\Users\\User\\Apps\\Daymark\\Daymark.exe');
  }else await assert.rejects(()=>invoke(main,'settings',{autoStart:true}),/Windows 安装版/);
  await assert.rejects(()=>handlers.daymark({sender:panel.webContents,senderFrame:{url:'https://example.com'}},'get'),/来源无效/);
  const saved=await invoke(panel,'save',{title:'从面板添加',plan:'2026-09-24'});
  assert.equal((await invoke(main,'get')).tasks[0].id,saved.tasks[0].id);
  assert(main.sent.some(([channel])=>channel==='state'));assert(panel.sent.some(([channel])=>channel==='state'));
  await invoke(panel,'toggle-task',saved.tasks[0].id);
  assert.equal((await invoke(main,'get')).tasks[0].done,true);
  const mainBounds=JSON.stringify(main.bounds);
  await invoke(panel,'settings',{panelSize:'large',panelPinned:false,panelCollapsed:true});
  assert.equal(panel.bounds.height,112);assert.equal(panel.pinned,false);assert.equal(JSON.stringify(main.bounds),mainBounds);
  let prevented=false;main.emit('close',{preventDefault:()=>prevented=true});
  assert.equal(prevented,true);assert.equal(main.visible,false);assert.equal(panel.visible,true);
  await invoke(panel,'open-task',saved.tasks[0].id);assert.equal(main.visible,true);assert(main.sent.some(([channel])=>channel==='edit-task'));
  await invoke(panel,'panel-hide');assert.equal(panel.visible,false);
  await invoke(main,'settings',{panelEnabled:true});assert.equal(panel.visible,true);
  await invoke(panel,'settings',{panelCollapsed:false});
  await invoke(main,'panel-reset');assert.equal(panel.bounds.x,1496);
  assert.equal(panel.visible,true);assert.equal(panel.raised,true);assert.equal(panel.focused,true);
  assert.equal((await invoke(main,'get')).settings.panelPinned,true);
  assert.equal((await invoke(main,'get')).settings.panelOpacity,1);
  assert.equal((await invoke(main,'get')).settings.panelCollapsed,false);
  panel.webContents.emit('did-finish-load');assert.equal(panel.visible,true);
  const originalWidth=panel.bounds.width,originalHeight=panel.bounds.height;
  await invoke(panel,'panel-gesture-start',{edge:'se',x:10,y:10});
  await invoke(panel,'panel-gesture',{x:90,y:70});
  await invoke(panel,'panel-gesture-end');
  assert.equal((await invoke(main,'get')).settings.panelCurrentSize.width,originalWidth+80);
  assert.equal((await invoke(main,'get')).settings.panelCurrentSize.height,originalHeight+60);
  await invoke(main,'settings',{panelDefaultSize:{width:440,height:660}});
  assert.equal((await invoke(main,'get')).settings.panelCurrentSize.width,originalWidth+80);
  await invoke(panel,'panel-default-size');
  assert.equal(panel.bounds.width,440);assert.equal(panel.bounds.height,660);
  const goalState=await invoke(main,'save-goal',{title:'英语准备',deadline:'2027-01-10',milestones:[{title:'词汇复习'}]});
  const goal=goalState.goals[0];
  await invoke(panel,'plan-milestone',{goalId:goal.id,milestoneId:goal.milestones[0].id});
  const linked=(await invoke(main,'get')).tasks.find(t=>t.goalId===goal.id);
  await invoke(panel,'toggle-task',linked.id);assert.equal((await invoke(main,'get')).goals[0].activity.length,1);
  await invoke(panel,'open-goal',goal.id);assert(main.sent.some(([channel,id])=>channel==='open-goal'&&id===goal.id));
  if(platform==='win32') {
    await invoke(main,'settings',{panelPinned:false});
    assert.equal(nativeCommands.at(-1).pinned,false);
    assert.equal(nativeCommands.at(-1).hwnd,'123');
    await invoke(main,'settings',{panelPinned:true});
    assert.equal(nativeCommands.at(-1).pinned,true);
    failNative=true;
    await assert.rejects(()=>invoke(main,'settings',{panelPinned:false}),/桌面模式未启用/);
    assert.equal((await invoke(main,'get')).settings.panelPinned,true);
    assert.equal(panel.visible,true);
  }
  app.emit('before-quit');
  assert(fs.existsSync(path.join(dir,'panel-position.json')));
});
