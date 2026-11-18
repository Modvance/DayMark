const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {JSDOM}=require('jsdom');
const {Store}=require('../src/model.cjs');
const U=require('../src/ui.js');
const settle=()=>new Promise(resolve=>setImmediate(resolve));
async function fixture(t,file='index.html',provided){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'daymark-dom-'));
 const store=provided||new Store(path.join(dir,'tasks.json'));
 const dom=new JSDOM(fs.readFileSync(path.join(__dirname,'../src',file),'utf8'),{url:'http://localhost',runScripts:'outside-only'}),w=dom.window;
 const listeners=[],actions=[];
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
 w.desktop={onState:callback=>listeners.push(callback),onMessage:()=>{},onAdd:()=>{},onEdit:callback=>w.editTask=callback,call:async(action,payload)=>{
   actions.push([action,payload]);let result;
   if(action==='get')return structuredClone(store.state);
   if(action==='app-info')return {version:require('../package.json').version,packaged:true};
   if(action==='save')result=store.save(payload);
   else if(action==='delete')result=store.remove(payload);
   else if(action==='toggle-task'){const task=store.state.tasks.find(t=>t.id===payload);result=store.save({...task,done:!task.done});}
   else if(action==='settings')result=store.settings(payload);
   else if(['save-goal','delete-goal','toggle-milestone','plan-milestone'].includes(action))result=store.change(action,payload);
   else if(action==='panel-default-size')result=store.settings({panelCurrentSize:store.state.settings.panelDefaultSize});
   else return null;
   for(const callback of listeners)callback(structuredClone(result));return structuredClone(result);
 }};
 w.eval(fs.readFileSync(path.join(__dirname,'../src/domain.js'),'utf8'));
 w.eval(fs.readFileSync(path.join(__dirname,'../src/ui.js'),'utf8'));
 if(file==='index.html')w.eval(fs.readFileSync(path.join(__dirname,'../src/goals.js'),'utf8'));
 w.eval(fs.readFileSync(path.join(__dirname,'../src',file==='index.html'?'renderer.js':'panel.js'),'utf8'));
 await settle();
 t.after(()=>{w.close();fs.rmSync(dir,{recursive:true,force:true});});
 return {w,d:w.document,store,actions,listeners};
}
test('main quick entry, completion undo, global search and task editing use real model',async t=>{
 const {w,d,store}=await fixture(t);
 assert.equal(d.getElementById('app-version').textContent,require('../package.json').version+' · 桌面版');
 d.getElementById('quick-title').value='完成实验报告';
 d.getElementById('quick-form').dispatchEvent(new w.Event('submit',{cancelable:true}));await settle();
 assert.equal(store.state.tasks[0].plan,U.day());assert.equal(d.querySelectorAll('.task').length,1);
 d.querySelector('[data-action=toggle]').click();await settle();assert.equal(store.state.tasks[0].done,true);
 d.getElementById('undo').click();await settle();assert.equal(store.state.tasks[0].done,false);
 d.querySelector('[data-action=edit]').click();d.getElementById('title').value='<img src=x onerror=alert(1)> 安全标题';
 d.getElementById('task-form').dispatchEvent(new w.SubmitEvent('submit',{cancelable:true,submitter:d.querySelector('#task-form [type=submit]')}));await settle();
 assert.equal(d.querySelectorAll('.task img').length,0);assert.match(d.querySelector('.task-title').textContent,/<img/);
 d.getElementById('search').value='安全标题';d.getElementById('search').dispatchEvent(new w.Event('input'));assert.equal(d.querySelectorAll('.task').length,1);
 d.getElementById('search').value='没有此任务';d.getElementById('search').dispatchEvent(new w.Event('input'));assert.equal(d.querySelectorAll('.task').length,0);
});
test('calendar-selected plans, inbox, flags, deletion and appearance settings',async t=>{
 const {w,d,store}=await fixture(t);
 d.querySelector('[data-view=inbox]').click();
 d.getElementById('quick-title').value='随手记下想法';d.getElementById('quick-form').dispatchEvent(new w.Event('submit',{cancelable:true}));await settle();
 assert.equal(store.state.tasks[0].plan,'');
 d.querySelector('[data-action=flag]').click();await settle();assert.equal(store.state.tasks[0].priority,'high');
 const date=d.querySelector('.calendar-days [data-date]');const key=date.dataset.date;date.click();
 d.getElementById('quick-title').value='为选定日期安排';d.getElementById('quick-form').dispatchEvent(new w.Event('submit',{cancelable:true}));await settle();assert.equal(store.state.tasks[1].plan,key);
 d.querySelector('[data-action=edit]').click();d.getElementById('editor-delete').click();d.getElementById('confirm-delete').click();await settle();assert.equal(store.state.tasks.length,1);
 d.getElementById('appearance').value='dark';d.getElementById('appearance').dispatchEvent(new w.Event('change'));await settle();assert.equal(store.state.settings.appearance,'dark');assert.equal(d.documentElement.dataset.theme,'dark');
});
test('widget completion undo, theme, default size and deadline navigation',async t=>{
 const {w,d,store,listeners}=await fixture(t,'panel.html');
 d.getElementById('quick-title').value='组件里的今日任务';d.getElementById('quick-form').dispatchEvent(new w.Event('submit',{cancelable:true}));await settle();assert.equal(d.querySelectorAll('.item').length,1);
 d.querySelector('[data-action=toggle]').click();await settle();assert.equal(d.getElementById('undo-bar').hidden,false);assert.equal(d.getElementById('progress').value,1);
 d.getElementById('undo').click();await settle();assert.equal(store.state.tasks[0].done,false);
 d.getElementById('default-width').value='430';d.getElementById('default-height').value='650';d.getElementById('save-default').click();await settle();assert.equal(store.state.settings.panelDefaultSize.width,430);
 d.getElementById('restore-size').click();await settle();assert.equal(store.state.settings.panelCurrentSize.height,650);
 store.save({title:'已过截止时间',plan:'',due:new Date(Date.now()-60000).toISOString(),category:'课程'});
 listeners[0](structuredClone(store.state));assert.equal(d.getElementById('overdue-count').hidden,false);
 d.getElementById('overdue-count').click();assert.match(d.getElementById('list').textContent,/已过截止时间/);
 d.getElementById('appearance').value='dark';d.getElementById('appearance').dispatchEvent(new w.Event('change'));await settle();assert.equal(d.documentElement.dataset.theme,'dark');
});
test('goal editor → milestone → today → completion → history → undo is connected',async t=>{
 const {w,d,store}=await fixture(t);
 d.querySelector('[data-view=goals]').click();d.getElementById('new-goal').click();
 d.getElementById('goal-title').value='CSP 考试准备';d.getElementById('goal-deadline').value='2027-01-10';
 d.getElementById('add-milestone').click();d.querySelector('.stage-title').value='巩固图论基础';
 d.getElementById('goal-form').dispatchEvent(new w.SubmitEvent('submit',{cancelable:true,submitter:d.querySelector('#goal-form [type=submit]')}));await settle();
 assert.equal(store.state.goals.length,1);assert.match(d.querySelector('.goal-card').textContent,/CSP/);
 d.querySelector('[data-goal-action=today]').click();await settle();d.querySelector('[data-goal-action=today]').click();await settle();assert.equal(store.state.tasks.length,1);
 d.querySelector('[data-view=today]').click();d.querySelector('[data-action=toggle]').click();await settle();assert.equal(store.state.goals[0].activity.length,1);
 d.getElementById('undo').click();await settle();assert.equal(store.state.goals[0].activity.length,0);
 d.querySelector('[data-action=goal]').click();assert.equal(d.body.classList.contains('view-goals'),true);
 d.querySelector('[data-goal-action=toggle-stage]').click();await settle();assert.equal(store.state.goals[0].milestones[0].done,true);
});
test('task planning fields, recurring plan and carryover actions preserve the selected goal',async t=>{
 const {w,d,store}=await fixture(t);
 d.getElementById('add').click();d.getElementById('title').value='每天练习英语';d.getElementById('plan').value=U.day();d.getElementById('plan-time').value='19:00';d.getElementById('duration').value='30';d.getElementById('repeat').value='daily';
 d.getElementById('task-form').dispatchEvent(new w.SubmitEvent('submit',{cancelable:true,submitter:d.querySelector('#task-form [type=submit]')}));await settle();
 assert.equal(store.state.routines.length,1);assert.equal(store.state.tasks[0].planTime,'19:00');
 d.getElementById('mode-timeline').click();assert.match(d.querySelector('.timeline-row>time').textContent,/19:00/);
});
test('widget shows daily tasks and pinned goal countdown together',async t=>{
 const {w,d,store,listeners}=await fixture(t,'panel.html');
 store.change('save-goal',{title:'英语准备',deadline:'2027-01-01',pinned:true});
 const g=store.state.goals[0];store.save({title:'听力练习',plan:U.day(),goalId:g.id});listeners[0](structuredClone(store.state));
 assert.equal(d.querySelectorAll('.item').length,1);assert.equal(d.querySelectorAll('.widget-goal').length,1);
 assert.match(d.querySelector('.widget-goal').textContent,/英语准备/);assert.equal(d.getElementById('quick-goal').options.length,2);
 d.querySelector('[data-action=toggle]').click();await settle();assert.equal(store.state.goals[0].activity.length,1);
 assert.match(d.querySelector('.widget-goal-name').textContent,/本周 1/);
});
