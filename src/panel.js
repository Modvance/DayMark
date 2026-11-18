'use strict';
const $=id=>document.getElementById(id),U=window.DaymarkUI;
const api=window.desktop||U.previewBridge();
let state={tasks:[],goals:[],settings:{}},tab='today',showDone=false,undoId=null,toastTimer;
function toast(text){$('toast').textContent=text;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,5500);}
function hydrateIcons(){document.querySelectorAll('[data-icon]').forEach(el=>el.innerHTML=U.icon(el.dataset.icon));}
async function call(action,payload){try{const result=await api.call(action,payload);if(result?.tasks){state=result;render();}$('status').textContent='已保存';return result;}catch(e){$('status').textContent='未能保存';toast(e.message);throw e;}}
function row(t){const category=t.category==='科研'?'research':t.category==='课程'?'course':'personal';return `<article class="item"><button class="check ${t.done?'done':''}" data-action="toggle" data-id="${U.esc(t.id)}" aria-label="${t.done?'重新打开':'完成'} ${U.esc(t.title)}">${t.done?U.icon('check'):''}</button><div class="item-content"><button class="item-title ${t.done?'done':''}" data-action="edit" data-id="${U.esc(t.id)}" title="编辑任务">${U.esc(t.title)}</button><div class="item-meta"><span class="category ${category}"><i></i>${U.esc(t.category)}</span>${t.goalId?`<span class="widget-task-goal" title="${U.esc(state.goals.find(g=>g.id===t.goalId)?.title||'目标')}">${U.icon('target')}${U.esc(state.goals.find(g=>g.id===t.goalId)?.title||'目标')}</span>`:''}${t.priority==='high'?`<span class="priority" title="重要">${U.icon('flag')}</span>`:''}${t.due&&!t.done?`<span class="countdown ${U.isOverdue(t)?'urgent':''}" title="${U.esc(new Date(t.due).toLocaleString('zh-CN'))}">${U.esc(U.countdown(t))}</span>`:''}</div></div></article>`;}
function render(){
 U.applyTheme(state.settings);const s=state.settings,todayTasks=state.tasks.filter(t=>t.plan===U.day()),done=todayTasks.filter(t=>t.done).length,remaining=todayTasks.length-done;
 document.body.classList.toggle('collapsed',!!s.panelCollapsed);
 $('date').textContent=new Date().toLocaleDateString('zh-CN',{month:'long',day:'numeric',weekday:'long'});
 $('compact-count').textContent=`${remaining} 项待办`;$('remaining').textContent=remaining;
 $('progress-text').textContent=todayTasks.length?remaining?`已完成 ${done} 项，还有 ${remaining} 项待办。`:'今天的计划，都完成了。':'从一件重要的事开始。';
 $('progress').max=Math.max(1,todayTasks.length);$('progress').value=done;
 $('widget-ring').setAttribute('stroke-dashoffset',String(157.08*(1-(todayTasks.length?done/todayTasks.length:0))));
 const deadlines=state.tasks.filter(t=>!t.done&&t.due).sort((a,b)=>Date.parse(a.due)-Date.parse(b.due)),overdue=deadlines.filter(t=>U.isOverdue(t)).length;
 $('overdue-count').hidden=!overdue||tab==='deadline';$('overdue-count').textContent=`${overdue} 项任务已逾期 · 查看`;
 $('panel-pin').classList.toggle('active',!!s.panelPinned);$('panel-pin').setAttribute('aria-pressed',String(!!s.panelPinned));$('panel-pin').title=s.panelPinned?'已置顶 · 点击固定到桌面':'桌面模式 · 点击置顶';
 $('collapse').innerHTML=U.icon(s.panelCollapsed?'plus':'minus');$('collapse').title=s.panelCollapsed?'展开组件':'折叠组件';$('collapse').setAttribute('aria-label',$('collapse').title);
 $('appearance').value=s.appearance||'system';$('panel-size').value=s.panelSize||'normal';
 if(document.activeElement!==$('default-width'))$('default-width').value=s.panelDefaultSize?.width||360;
 if(document.activeElement!==$('default-height'))$('default-height').value=s.panelDefaultSize?.height||600;
 if(document.activeElement!==$('opacity')){$('opacity').value=Math.round((s.panelOpacity||1)*100);$('opacity-value').textContent=$('opacity').value+'%';}
 for(const name of ['today','deadline']){$('tab-'+name).classList.toggle('selected',tab===name);$('tab-'+name).setAttribute('aria-pressed',String(tab===name));}
 const tasks=tab==='today'?U.sort(todayTasks.filter(t=>showDone||!t.done)):deadlines;
 let html='';if(!tasks.length)html=`<div class="empty">${U.icon(tab==='today'?'sun':'calendar')}<strong>${tab==='today'?'给今天，留一点空间。':'近期没有截止事项。'}</strong>${tab==='today'?'在下方写下第一件要做的事。':'添加任务时可以设置截止时间。'}</div>`;
 else{let previous='';for(const t of tasks){if(tab==='deadline'){const group=U.isOverdue(t)?'已逾期':'即将截止';if(group!==previous){html+=`<div class="section-label">${group}</div>`;previous=group;}}html+=row(t);}}
 if($('list').innerHTML!==html){const current=document.activeElement?.closest('[data-action]'),focus=current&&{id:current.dataset.id,action:current.dataset.action};const scroll=$('list').scrollTop;$('list').innerHTML=html;$('list').scrollTop=scroll;if(focus)[...$('list').querySelectorAll('[data-action]')].find(b=>b.dataset.id===focus.id&&b.dataset.action===focus.action)?.focus({preventScroll:true});}
 renderGoalZone();
 $('completed-filter').hidden=tab!=='today'||!done;$('completed-filter').textContent=`${done} 项已完成 · ${showDone?'隐藏':'显示'}`;
 if(undoId&&!state.tasks.find(t=>t.id===undoId)?.done)undoId=null;$('undo-bar').hidden=!undoId;
}

function renderGoalZone(){
 const active=(state.goals||[]).filter(g=>g.status==='active'),pinned=active.filter(g=>g.pinned).sort((a,b)=>(a.deadline||'9999').localeCompare(b.deadline||'9999')).slice(0,3);
 $('compact-goal').hidden=!pinned.length;$('compact-goal').textContent=pinned.length?pinned[0].title+' · '+U.goalCountdown(pinned[0]):'';
 $('widget-goal-list').innerHTML=pinned.length?pinned.map(g=>{const s=U.goalStats(g);return `<button class="widget-goal ${U.esc(g.color)}" data-widget-goal="${U.esc(g.id)}"><span class="widget-goal-name">${U.esc(g.title)}<small>${s.inactiveDays>=7?'已 '+s.inactiveDays+' 天未推进':g.weeklyTarget?'本周 '+s.weekCount+' / '+g.weeklyTarget+' 项':'阶段 '+s.stageDone+' / '+s.stageTotal}</small></span><span class="widget-goal-days ${s.days!==null&&s.days<=7?'urgent':''}">${s.days===null?'—':Math.abs(s.days)}<small>${s.days===null?'未设日期':s.days>0?'天后截止':s.days===0?'今天到期':'天前到期'}</small></span></button>`;}).join(''):`<button data-widget-goal="" class="widget-goals-empty">${U.icon('target')} ${active.length?'到目标页选择要固定的目标':'添加一个长期目标，记住它的期限。'}</button>`;
 const value=$('quick-goal').value;$('quick-goal').innerHTML='<option value="">不关联目标</option>'+active.map(g=>`<option value="${U.esc(g.id)}">${U.esc(g.title)}</option>`).join('');$('quick-goal').value=active.some(g=>g.id===value)?value:'';
}

function safe(id,fn){$(id).onclick=async()=>{const b=$(id);b.disabled=true;try{await fn();}catch{}finally{b.disabled=false;}};}
safe('open-main',()=>call('open-main'));safe('preferences-main',()=>call('open-main'));safe('open-add',()=>call('open-add'));safe('hide',()=>call('panel-hide'));safe('panel-pin',()=>call('settings',{panelPinned:!state.settings.panelPinned}));safe('collapse',()=>call('settings',{panelCollapsed:!state.settings.panelCollapsed}));safe('reset-position',()=>call('panel-reset'));safe('restore-size',()=>call('panel-default-size'));safe('current-default',()=>call('settings',{panelDefaultSize:state.settings.panelCurrentSize||{width:360,height:600}}));safe('save-default',async()=>{if(!$('default-width').reportValidity()||!$('default-height').reportValidity())return;await call('settings',{panelDefaultSize:{width:Number($('default-width').value),height:Number($('default-height').value)}});toast('默认尺寸已保存，点击“恢复默认尺寸”应用。');});
$('panel-settings').onclick=()=>$('preferences').showModal();$('tab-today').onclick=()=>{tab='today';render();};$('tab-deadline').onclick=$('overdue-count').onclick=()=>{tab='deadline';render();};$('completed-filter').onclick=()=>{showDone=!showDone;render();};
$('appearance').onchange=async()=>{try{await call('settings',{appearance:$('appearance').value});}catch{render();}};
$('panel-size').onchange=async()=>{try{await call('settings',{panelSize:$('panel-size').value});}catch{render();}};
$('opacity').oninput=()=>$('opacity-value').textContent=$('opacity').value+'%';$('opacity').onchange=async()=>{try{await call('settings',{panelOpacity:Number($('opacity').value)/100});}catch{}};
$('quick-title').oninput=()=>$('quick-title').setCustomValidity('');
$('quick-form').onsubmit=async event=>{event.preventDefault();const title=$('quick-title').value.trim();if(!title){$('quick-title').setCustomValidity('请输入任务标题');$('quick-title').reportValidity();return;}const b=$('quick-form').querySelector('button');b.disabled=true;try{await call('save',{title,plan:U.day(),due:null,priority:'normal',category:'个人',lead:60,note:'',done:false,goalId:$('quick-goal').value});$('quick-title').value='';tab='today';render();$('quick-title').focus();}catch{}finally{b.disabled=false;}};
$('list').onclick=async event=>{const b=event.target.closest('[data-action]');if(!b)return;const t=state.tasks.find(t=>t.id===b.dataset.id);if(!t)return;b.disabled=true;try{if(b.dataset.action==='edit')await call('open-task',t.id);else{const wasDone=t.done;await call('toggle-task',t.id);undoId=wasDone?null:t.id;render();}}catch{}finally{b.disabled=false;}};
safe('undo',async()=>{const t=state.tasks.find(t=>t.id===undoId);if(t?.done)await call('toggle-task',t.id);undoId=null;render();});
safe('load-demo',()=>call('demo'));safe('open-goals',()=>call('open-goal',''));
 $('widget-goal-list').onclick=async event=>{const b=event.target.closest('[data-widget-goal]');if(b){try{await call('open-goal',b.dataset.widgetGoal);}catch{}}};
api.onState?.(data=>{state=data;render();});api.onMessage?.(toast);
// Custom gestures work for both top-level windows and desktop child windows.
// Capture the pointer and send only the newest position after each native update.
let dragging=null;
async function pumpDrag(g) {
  if(g.busy)return;g.busy=true;
  try {
    await g.start;
    while(g.latest) { const point=g.latest;g.latest=null;await api.call('panel-gesture',point); }
    if(g.ended) { const next=await api.call('panel-gesture-end');state=next;render();if(dragging===g)dragging=null; }
  } catch(e) { toast(e.message);try{await api.call('panel-gesture-end');}catch{}if(dragging===g)dragging=null; }
  finally { g.busy=false;if(g.latest || (g.ended && dragging===g))pumpDrag(g); }
}
document.addEventListener('pointerdown',event=>{
  if(!window.desktop || event.button!==0 || dragging)return;
  const handle=event.target.closest('[data-edge]');
  const header=event.target.closest('.drag-bar');
  if(!handle && (!header || event.target.closest('button,input,select,a')))return;
  const edge=handle?.dataset.edge || 'move';
  if(edge!=='move' && state.settings.panelCollapsed)return;
  event.preventDefault();event.target.setPointerCapture?.(event.pointerId);
  const start=api.call('panel-gesture-start',{edge,x:event.screenX,y:event.screenY});
  dragging={start,latest:null,ended:false,busy:false,pointer:event.pointerId};
  // Observe start immediately, even if the pointer remains still.
  pumpDrag(dragging);
});
document.addEventListener('pointermove',event=>{
  if(!dragging || event.pointerId!==dragging.pointer || dragging.ended)return;
  dragging.latest={x:event.screenX,y:event.screenY};pumpDrag(dragging);
});
for(const type of ['pointerup','pointercancel'])document.addEventListener(type,event=>{
  if(!dragging || event.pointerId!==dragging.pointer)return;
  dragging.latest={x:event.screenX,y:event.screenY};dragging.ended=true;pumpDrag(dragging);
});
(async()=>{hydrateIcons();try{state=await api.call('get');$('preview-note').hidden=!!window.desktop;render();setInterval(()=>{if(!$('preferences').open)render();},30000);}catch(e){toast('无法读取数据：'+e.message);}})();
