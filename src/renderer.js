'use strict';
const $=id=>document.getElementById(id);
const U=window.DaymarkUI;
const api=window.desktop||U.previewBridge();
let listMode='list';
let state={tasks:[],goals:[],settings:{}},view='today',categoryFilter='',selectedDate=U.day(),calendarMonth=new Date(new Date().getFullYear(),new Date().getMonth(),1),deleting='',toastTimer,undoState=null;
const labels={today:'今天',scheduled:'已安排',all:'全部任务',flagged:'重要',inbox:'收件箱',done:'已完成',overdue:'已逾期',upcoming:'未来七天',date:'日程',goals:'长期目标'};
function hydrateIcons(root=document){root.querySelectorAll('[data-icon]').forEach(el=>el.innerHTML=U.icon(el.dataset.icon));}
function toast(text,undo=null){$('toast-text').textContent=text;undoState=undo;$('undo').hidden=!undo;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,6500);}
function setView(next,category=''){view=next;categoryFilter=category;$('search').value='';render();}
function renderCalendar(){
 const year=calendarMonth.getFullYear(),month=calendarMonth.getMonth();$('calendar-title').textContent=`${year} 年 ${month+1} 月`;
 const first=new Date(year,month,1),offset=(first.getDay()+6)%7;
 const planned=new Set(state.tasks.filter(t=>!t.done&&t.plan).map(t=>t.plan));
 let html='';for(let i=0;i<42;i++){const d=new Date(year,month,1-offset+i),key=U.day(d);html+=`<button data-date="${key}" class="${d.getMonth()!==month?'other ':''}${key===U.day()?'today ':''}${key===selectedDate&&view==='date'?'selected ':''}${planned.has(key)?'has-task':''}" aria-label="${key} 的计划" ${key===U.day()?'aria-current="date"':''}>${d.getDate()}</button>`;}
 $('calendar-days').innerHTML=html;
}
function row(t){
 const due=t.due?new Date(t.due).toLocaleString('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}):'';
 const categoryClass=t.category==='科研'?'purple':t.category==='课程'?'blue':'green';
 return `<article class="task ${t.done?'done':''}" data-task="${U.esc(t.id)}"><button class="check" data-action="toggle" data-id="${U.esc(t.id)}" aria-label="${t.done?'重新打开':'完成'} ${U.esc(t.title)}">${t.done?U.icon('check'):''}</button><div class="task-info"><button class="task-title" data-action="edit" data-id="${U.esc(t.id)}">${U.esc(t.title)}</button>${t.note?`<p class="task-note">${U.esc(t.note)}</p>`:''}<div class="task-meta"><span class="category-label ${categoryClass}"><i></i>${U.esc(t.category)}</span>${t.due?`<span class="due-label ${U.isOverdue(t)?'urgent':''}" title="${U.esc(due)}">${U.icon('clock')}${U.esc(t.done?due:U.countdown(t))}</span>`:''}${t.planTime?`<span>${U.esc(t.planTime)}${t.duration?' · '+t.duration+' 分钟':''}</span>`:''}${t.repeat&&t.repeat!=='none'?`<span title="重复任务">${U.icon('repeat')}</span>`:''}${t.goalId?`<button class="task-goal-link" data-action="goal" data-id="${U.esc(t.id)}">${U.icon('target')}${U.esc(state.goals.find(g=>g.id===t.goalId)?.title||'目标')}</button>`:''}${t.plan&&t.plan!==U.day()?`<span>计划 ${U.esc(t.plan.slice(5).replace('-','/'))}</span>`:''}</div></div><div class="task-actions"><button class="plan ${t.plan===U.day()?'selected':''}" data-action="plan" data-id="${U.esc(t.id)}" title="${t.plan===U.day()?'移出今天':'加入今天'}" aria-label="${t.plan===U.day()?'移出今天':'加入今天'}">${U.icon('sun')}</button><button class="${t.priority==='high'?'selected':''}" data-action="flag" data-id="${U.esc(t.id)}" title="${t.priority==='high'?'取消重要标记':'标记为重要'}" aria-label="${t.priority==='high'?'取消重要标记':'标记为重要'}">${U.icon('flag')}</button></div></article>`;
}
function render(){
 U.applyTheme(state.settings);document.body.classList.toggle('compact',!!state.settings.compact);document.body.classList.toggle('view-goals',view==='goals');$('goals-workspace').hidden=view!=='goals';
 const active=state.tasks.filter(t=>!t.done),todayTasks=state.tasks.filter(t=>t.plan===U.day()),doneToday=todayTasks.filter(t=>t.done).length;
 const counts={goals:(state.goals||[]).filter(g=>g.status==='active').length,today:active.filter(t=>t.plan===U.day()).length,scheduled:active.filter(t=>t.plan||t.due).length,all:active.length,flagged:active.filter(t=>t.priority==='high').length,inbox:active.filter(t=>!t.plan&&!t.due).length,done:state.tasks.filter(t=>t.done).length,research:active.filter(t=>t.category==='科研').length,course:active.filter(t=>t.category==='课程').length,personal:active.filter(t=>t.category==='个人').length};
 for(const [key,value]of Object.entries(counts))$('count-'+key).textContent=value;
 document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===view&&!categoryFilter));
 document.querySelectorAll('[data-category]').forEach(b=>b.classList.toggle('active',b.dataset.category===categoryFilter));
 const query=$('search').value.trim(),actualView=query?'all':view;
 let tasks=U.sort(U.filter(state.tasks,{view:actualView,category:query?'':categoryFilter,date:selectedDate,query,showDone:$('show-completed').checked||view==='done'}),$('sort').value);
 const title=query?'搜索结果':categoryFilter||(view==='date'?new Date(selectedDate+'T12:00:00').toLocaleDateString('zh-CN',{month:'long',day:'numeric'}):labels[view]);
 if(listMode==='timeline'&&['today','date'].includes(view)&&!query)tasks=U.timeline(tasks);
 $('add').innerHTML=U.icon('plus')+(view==='goals'?'新建目标':'新建任务');
 $('view-title').textContent=title;$('crumb').textContent=title;
 $('date-label').textContent=new Date().toLocaleDateString('zh-CN',{month:'long',day:'numeric',weekday:'long'});
 $('heading-count').textContent=tasks.filter(t=>!t.done).length;
 $('view-subtitle').textContent=query?`“${query}” · ${tasks.length} 项结果`:view==='done'?'每一项完成，都值得被看见。':tasks.length?`${tasks.filter(t=>!t.done).length} 项待办，按自己的节奏来。`:'从一件重要的事开始。';
 $('list-summary').textContent=`${tasks.length} 项任务`;
 const overdue=active.filter(t=>U.isOverdue(t)).length;
 $('overdue-banner').hidden=!overdue||view==='overdue'||view==='goals'||!!query;
 $('overdue-text').textContent=`${overdue} 项任务已超过截止时间`;
 const previousFocus=document.activeElement?.closest('[data-action]'),focus=previousFocus&&{id:previousFocus.dataset.id,action:previousFocus.dataset.action};
 let html='';
 if(!tasks.length)html=`<div class="empty">${U.icon(query?'search':view==='done'?'check':view==='inbox'?'inbox':'sun')}<strong>${query?'没有找到相关任务':view==='done'?'还没有完成的任务':'这里留给下一件重要的事。'}</strong>${query?'试试其他关键词。':'在下方直接输入，或点击右上角新建。'}</div>`;
 else{let group='';for(const t of tasks){let next=t.done?'已完成':U.isOverdue(t)?'需要关注':t.priority==='high'?'优先处理':'待办事项';if($('sort').value==='due'&&!t.done)next=U.isOverdue(t)?'需要关注':t.due?'按截止时间':'没有截止时间';if(listMode==='timeline'&&['today','date'].includes(view)&&!query)next=t.planTime?'已安排时段':'未设时段';if(next!==group){group=next;html+=`<div class="task-group-heading"><b>${next}</b></div>`;}html+=listMode==='timeline'&&['today','date'].includes(view)&&!query?`<div class="timeline-row"><time>${t.planTime||'待安排'}</time><div>${row(t)}</div></div>`:row(t);}}
 if(listMode==='timeline'&&['today','date'].includes(view)&&!query){const conflicts=U.conflicts(tasks);if(conflicts.size)html=`<div class="schedule-conflict">${conflicts.size} 项任务的计划时段有重叠，请适当调整。</div>`+html;}
 if($('task-list').innerHTML!==html){$('task-list').innerHTML=html;if(focus)[...$('task-list').querySelectorAll('[data-action]')].find(b=>b.dataset.id===focus.id&&b.dataset.action===focus.action)?.focus({preventScroll:true});}
 const percent=todayTasks.length?Math.round(doneToday/todayTasks.length*100):0;
 $('progress-fraction').textContent=`${doneToday} / ${todayTasks.length}`;$('progress-percent').innerHTML=`${percent}<span>%</span>`;$('ring-value').setAttribute('stroke-dashoffset',String(270.18*(1-percent/100)));
 $('progress-message').innerHTML=percent===100&&todayTasks.length?'今天的计划，<br>都完成了。':'留一点时间<br>给重要的事。';
 $('progress-caption').textContent=doneToday?`已经完成 ${doneToday} 项任务。`:'完成一项，就是前进。';
 const deadlines=active.filter(t=>t.due).sort((a,b)=>Date.parse(a.due)-Date.parse(b.due)).slice(0,3);
 $('deadlines').innerHTML=deadlines.length?deadlines.map(t=>`<button class="deadline-item ${U.isOverdue(t)?'urgent':''}" data-edit="${U.esc(t.id)}"><strong>${U.esc(t.title)}</strong><span>${U.esc(U.countdown(t))} · ${new Date(t.due).toLocaleDateString('zh-CN',{month:'short',day:'numeric'})}</span></button>`).join(''):'<div class="empty compact-empty">近期没有截止事项。</div>';
 $('main-pin').classList.toggle('selected',!!state.settings.pinned);$('main-pin').setAttribute('aria-pressed',String(!!state.settings.pinned));
 $('appearance').value=state.settings.appearance||'system';$('panel-enabled').checked=state.settings.panelEnabled!==false;$('panel-pinned').checked=!!state.settings.panelPinned;$('autostart').checked=!!state.settings.autoStart;
 renderCalendar();
 $('view-mode').hidden=!['today','date'].includes(view)||!!query;$('mode-list').classList.toggle('active',listMode==='list');$('mode-timeline').classList.toggle('active',listMode==='timeline');
 renderCarryover();
 if(view==='goals'){$('view-title').textContent=$('crumb').textContent='长期目标';$('view-subtitle').textContent=`${counts.goals} 个进行中的目标。把长期准备，落实到今天的一小步。`;$('heading-count').textContent=counts.goals;window.DaymarkGoals.render();}
}
async function mutate(action,payload){try{const result=await api.call(action,payload);if(result?.tasks){state=result;render();}$('save-status').textContent='所有更改已保存';return result;}catch(e){$('save-status').textContent='未能保存更改';toast(e.message);throw e;}}
function openEditor(t,options={}){
 $('task-form').reset();$('title').setCustomValidity('');$('task-id').value=t?.id||'';$('editor-title').textContent=t?'任务详情':'新建任务';$('editor-delete').hidden=!t;
 for(const key of ['title','note','category','priority','lead'])if(t)$(key).value=t[key];
 $('plan').value=t?t.plan:options.plan??(view==='today'?U.day():view==='date'?selectedDate:'');
 $('plan-time').value=t?.planTime||'';$('duration').value=t?.duration||'';const series=state.routines?.find(r=>r.id===t?.seriesId);$('repeat').value=series?(series.active?series.rule:'none'):t?.repeat||'none';$('start-reminder').checked=t?.startReminder!==false;$('start-reminder-field').hidden=!$('plan-time').value;
 $('task-goal').innerHTML='<option value="">不关联目标</option>'+state.goals.map(g=>`<option value="${U.esc(g.id)}">${U.esc(g.title)}${g.status==='active'?'':'（非进行中）'}</option>`).join('');$('task-goal').value=t?.goalId||options.goalId||'';updateMilestones(t?.milestoneId||options.milestoneId||'');
 if(!t&&categoryFilter)$('category').value=categoryFilter;
 if(!t&&view==='flagged')$('priority').value='high';
 if(t?.due){const d=new Date(t.due);$('due').value=`${U.day(d)}T${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;}
 $('editor').showModal();$('title').focus();
}
function askDelete(t){deleting=t.id;$('editor').close();$('delete-title').textContent=t.title;$('delete-dialog').showModal();}
function safe(id,fn){$(id).onclick=async()=>{const button=$(id);button.disabled=true;try{await fn();}catch{}finally{button.disabled=false;}};}
function bindView(){document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>setView(b.dataset.view));document.querySelectorAll('[data-category]').forEach(b=>b.onclick=()=>setView('all',b.dataset.category));}
$('add').onclick=()=>view==='goals'?window.DaymarkGoals.editor():openEditor();$('search').oninput=render;$('sort').onchange=$('show-completed').onchange=render;
$('quick-form').onsubmit=async event=>{event.preventDefault();const title=$('quick-title').value.trim();if(!title){$('quick-title').setCustomValidity('请输入任务标题');$('quick-title').reportValidity();return;}$('quick-title').disabled=true;try{await mutate('save',{title,plan:view==='today'?U.day():view==='date'?selectedDate:'',due:null,category:categoryFilter||'个人',priority:view==='flagged'?'high':'normal',note:'',lead:60,done:false});$('quick-title').value='';if(view==='done'||view==='overdue'||view==='scheduled')setView('all');}catch{}finally{$('quick-title').disabled=false;$('quick-title').focus();}};
$('quick-title').oninput=()=>$('quick-title').setCustomValidity('');
$('task-form').onsubmit=async event=>{event.preventDefault();const title=$('title').value.trim();if(!title){$('title').setCustomValidity('请输入任务标题');$('title').reportValidity();return;}const old=state.tasks.find(t=>t.id===$('task-id').value),button=event.submitter;button.disabled=true;try{await mutate('save',{id:old?.id,title,note:$('note').value,category:$('category').value,priority:$('priority').value,plan:$('plan').value,due:$('due').value?new Date($('due').value).toISOString():null,lead:Number($('lead').value),done:old?.done||false,planTime:$('plan-time').value,duration:$('duration').value,goalId:$('task-goal').value,milestoneId:$('task-milestone').value,repeat:$('repeat').value,seriesId:old?.seriesId||'',startReminder:$('start-reminder').checked,updateSeries:true});$('editor').close();toast('任务已保存');}catch{}finally{button.disabled=false;}};
$('title').oninput=()=>$('title').setCustomValidity('');
$('task-list').onclick=async event=>{const b=event.target.closest('[data-action]');if(!b)return;const t=state.tasks.find(t=>t.id===b.dataset.id);if(!t)return;b.disabled=true;try{if(b.dataset.action==='edit')openEditor(t);if(b.dataset.action==='goal')showGoals(t.goalId);if(b.dataset.action==='toggle'){const wasDone=t.done;await mutate('toggle-task',t.id);toast(wasDone?'任务已重新打开':'已完成一项任务',{id:t.id,targetDone:wasDone});}if(b.dataset.action==='flag')await mutate('save',{...t,priority:t.priority==='high'?'normal':'high'});if(b.dataset.action==='plan'){await mutate('save',{...t,plan:t.plan===U.day()?'':U.day(),planTime:t.plan===U.day()?'':t.planTime});toast(t.plan===U.day()?'已移出今天':'已加入今天');}}catch{}finally{b.disabled=false;}};
$('deadlines').onclick=event=>{const b=event.target.closest('[data-edit]');const t=state.tasks.find(t=>t.id===b?.dataset.edit);if(t)openEditor(t);};
$('calendar-days').onclick=event=>{const b=event.target.closest('[data-date]');if(b){selectedDate=b.dataset.date;setView(selectedDate===U.day()?'today':'date');}};
$('month-prev').onclick=()=>{calendarMonth=new Date(calendarMonth.getFullYear(),calendarMonth.getMonth()-1,1);renderCalendar();};$('month-next').onclick=()=>{calendarMonth=new Date(calendarMonth.getFullYear(),calendarMonth.getMonth()+1,1);renderCalendar();};$('month-today').onclick=()=>{calendarMonth=new Date(new Date().getFullYear(),new Date().getMonth(),1);setView('today');};
$('show-scheduled').onclick=()=>setView('scheduled');$('overdue-banner').onclick=()=>setView('overdue');
$('settings-button').onclick=$('compact-settings').onclick=()=>$('settings').showModal();
$('editor-delete').onclick=()=>{const t=state.tasks.find(t=>t.id===$('task-id').value);if(t)askDelete(t);};
$('undo').onclick=async()=>{const undo=undoState;if(!undo)return;try{const t=state.tasks.find(t=>t.id===undo.id);if(t&&t.done!==undo.targetDone)await mutate('toggle-task',t.id);toast('已撤销');}catch{}};
for(const [id,key]of [['appearance','appearance'],['panel-enabled','panelEnabled'],['panel-pinned','panelPinned'],['autostart','autoStart']])$(id).onchange=async()=>{try{await mutate('settings',{[key]:id==='appearance'?$(id).value:$(id).checked});}catch{render();}};
safe('main-pin',()=>mutate('settings',{pinned:!state.settings.pinned}));safe('compact',()=>mutate('settings',{compact:!state.settings.compact}));safe('show-panel',()=>mutate('settings',{panelEnabled:true}));safe('widget-link',()=>mutate('settings',{panelEnabled:true}));safe('reset-panel',()=>mutate('panel-reset'));safe('confirm-delete',async()=>{await mutate('delete',deleting);$('delete-dialog').close();toast('任务已删除');});safe('export',async()=>{if(await mutate('export'))toast('备份已导出');});safe('import',async()=>{if(await mutate('import'))toast('备份已合并');});safe('quit',()=>mutate('quit'));safe('load-demo',()=>mutate('demo'));
document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>$(b.dataset.close).close());
document.addEventListener('keydown',event=>{if(!event.ctrlKey&&!event.metaKey)return;const key=event.key.toLowerCase();if(key==='n'){event.preventDefault();if(!document.querySelector('dialog[open]'))view==='goals'?window.DaymarkGoals.editor():openEditor();}if(key==='k'||key==='f'){event.preventDefault();$('search').focus();$('search').select();}if(key===','){event.preventDefault();if(!document.querySelector('dialog[open]'))$('settings').showModal();}});
api.onState?.(data=>{state=data;render();});api.onAdd?.(()=>{document.querySelectorAll('dialog[open]').forEach(d=>d.close());openEditor();});api.onEdit?.(id=>{const t=state.tasks.find(t=>t.id===id);if(t){document.querySelectorAll('dialog[open]').forEach(d=>d.close());openEditor(t);}});api.onMessage?.(toast);api.onGoal?.(id=>showGoals(id));

function showGoals(id){window.DaymarkGoals.select(id);setView('goals');}
function updateMilestones(value=''){
 const goal=state.goals.find(g=>g.id===$('task-goal').value);$('milestone-field').hidden=!goal;
 $('task-milestone').innerHTML='<option value="">不指定阶段</option>'+(goal?.milestones||[]).map(m=>`<option value="${U.esc(m.id)}">${U.esc(m.title)}</option>`).join('');$('task-milestone').value=value;
}
function renderCarryover(){
 const tasks=state.tasks.filter(t=>!t.done&&t.plan&&t.plan<U.day()).sort((a,b)=>b.plan.localeCompare(a.plan));
 $('carryover').hidden=view!=='today'||!!$('search').value.trim()||!tasks.length;
 $('carryover-title').textContent=`之前未完成 · ${tasks.length} 项`;
 $('carryover-list').innerHTML=tasks.slice(0,10).map(t=>`<div class="carryover-row"><button data-carry="edit" data-id="${U.esc(t.id)}">${U.esc(t.title)}<small>原计划 ${U.esc(t.plan)}</small></button><button data-carry="today" data-id="${U.esc(t.id)}">移至今天</button><button data-carry="defer" data-id="${U.esc(t.id)}">暂不安排</button></div>`).join('')+(tasks.length>10?'<p class="form-hint">这里只展示最近 10 项，其余可在全部任务中调整。</p>':'');
}
$('task-goal').onchange=()=>updateMilestones();$('plan-time').oninput=()=>$('start-reminder-field').hidden=!$('plan-time').value;
$('mode-list').onclick=()=>{listMode='list';render();};$('mode-timeline').onclick=()=>{listMode='timeline';render();};
$('carryover-list').onclick=async event=>{const b=event.target.closest('[data-carry]');const t=state.tasks.find(t=>t.id===b?.dataset.id);if(!t)return;try{if(b.dataset.carry==='edit')openEditor(t);else await mutate('save',{...t,plan:b.dataset.carry==='today'?U.day():'',planTime:''});}catch{}};

(async()=>{window.DaymarkGoals.init({getState:()=>state,mutate,openTask:openEditor,toast,showGoals});hydrateIcons();bindView();try{state=await api.call('get');$('preview-banner').hidden=!!window.desktop;render();setInterval(()=>{if(!document.querySelector('dialog[open]'))render();},30000);}catch(e){toast('无法读取数据：'+e.message);}})();

if(window.desktop)api.call('app-info').then(info=>{ $('app-version').textContent=`${info.version} · ${info.packaged?'桌面版':'开发版'}`; }).catch(()=>{});
