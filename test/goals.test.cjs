const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const D=require('../src/domain.js'),{Store}=require('../src/model.cjs');
const at=(year,month,date,hour=12)=>new Date(year,month-1,date,hour).getTime();
const sample=()=>({title:'英语准备',deadline:'2026-12-20',weeklyTarget:3,milestones:[{title:'基础阶段'},{title:'专项练习'}]});
function setup(){return D.validateState(D.change(D.defaults(),'save-goal',sample(),at(2026,11,11)));}
test('goal to daily task is idempotent, completion updates records, undo removes record',()=>{
 let state=setup(),g=state.goals[0],input={goalId:g.id,milestoneId:g.milestones[0].id,plan:'2026-11-11'};
 state=D.change(state,'plan-milestone',input,at(2026,11,11));state=D.change(state,'plan-milestone',input,at(2026,11,11));assert.equal(state.tasks.length,1);assert.equal(state.tasks[0].due,null);
 state=D.change(state,'toggle-task',state.tasks[0].id,at(2026,11,11));assert.equal(D.goalStats(state.goals[0],at(2026,11,11)).weekCount,1);assert.equal(state.goals[0].milestones[0].done,false);
 state=D.change(state,'toggle-task',state.tasks[0].id,at(2026,11,11));assert.equal(state.goals[0].activity.length,0);
 state=D.change(state,'toggle-milestone',input);assert.equal(D.goalStats(state.goals[0]).stageDone,1);assert.equal(state.goals[0].status,'active');
});
test('deadline countdown is calendar-day based and does not auto-complete goals',()=>{
 const state=setup(),g=state.goals[0];g.deadline='2026-11-12';
 assert.equal(D.goalStats(g,at(2026,11,11,23)).days,1);assert.equal(D.goalStats(g,at(2026,11,12,0)).days,0);assert.equal(D.goalStats(g,at(2026,11,13)).days,-1);assert.equal(g.status,'active');
 g.deadline='2026-11-02';assert.equal(D.goalStats(g,at(2026,10,31)).days,2);
});
test('goal reminder catch-up coalesces crossed thresholds and survives restart normalization',()=>{
 let state=setup(),g=state.goals[0];g.deadline='2026-11-24';
 const now=at(2026,11,11);assert.equal(D.pendingGoalReminders(state,now).length,1);
 state=D.change(state,'mark-goals',[g.id],now);state=D.validateState(state);assert.equal(D.pendingGoalReminders(state,now).length,0);
 assert.equal(D.pendingGoalReminders(state,at(2026,11,17)).length,1);
 state=D.change(state,'save-goal',{...state.goals[0],deadline:'2026-11-25'},now);assert.equal(state.goals[0].notified.length,0);
 state.goals[0].status='paused';assert.equal(D.pendingGoalReminders(state,now).length,0);
});
test('deleting a task retains history; deleting its goal keeps tasks and removes links',()=>{
 let state=setup(),g=state.goals[0];state=D.change(state,'save',{title:'练习',goalId:g.id,done:true},at(2026,11,11));
 const id=state.tasks[0].id;state=D.change(state,'delete',id);assert.equal(state.goals[0].activity.length,1);
 state=D.change(state,'save',{title:'新练习',goalId:g.id},at(2026,11,11));state=D.change(state,'delete-goal',g.id);assert.equal(state.tasks.length,1);assert.equal(state.tasks[0].goalId,'');
});
test('daily recurrence generates only the current day, once; stopping does not reactivate from history',()=>{
 let state=D.defaults();state=D.change(state,'save',{title:'背单词',plan:'2026-11-09',repeat:'daily'},at(2026,11,9));
 state=D.change(state,'ensure-recurring',null,at(2026,11,11));assert.deepEqual(state.tasks.map(t=>t.plan),['2026-11-09','2026-11-11']);
 state=D.change(state,'ensure-recurring',null,at(2026,11,11));assert.equal(state.tasks.length,2);
 state=D.change(state,'save',{...state.tasks[1],repeat:'none'},at(2026,11,11));state=D.change(state,'toggle-task',state.tasks[0].id,at(2026,11,11));
 state=D.change(state,'ensure-recurring',null,at(2026,11,12));assert.equal(state.tasks.length,2);
});
test('weekdays skip weekend and paused goals stop generating linked routines',()=>{
 let state=setup();state=D.change(state,'save',{title:'练习',goalId:state.goals[0].id,plan:'2026-11-13',repeat:'weekdays'},at(2026,11,13));
 state=D.change(state,'ensure-recurring',null,at(2026,11,14));assert.equal(state.tasks.length,1);
 state=D.change(state,'save-goal',{...state.goals[0],status:'paused'},at(2026,11,14));state=D.change(state,'ensure-recurring',null,at(2026,11,16));assert.equal(state.tasks.length,1);
 state=D.change(state,'save-goal',{...state.goals[0],status:'active'},at(2026,11,16));state=D.change(state,'ensure-recurring',null,at(2026,11,16));assert.equal(state.tasks.length,2);
});
test('v1 migration retains original bytes and backup import merges goals/routines without duplicates',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'daymark-migration-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const file=path.join(dir,'tasks.json'),raw=JSON.stringify({version:1,tasks:[{id:'old',title:'旧任务',done:true}],settings:{appearance:'dark'}});fs.writeFileSync(file,raw);
 const store=new Store(file);assert.equal(store.state.version,2);assert.equal(store.state.tasks[0].completedAt,null);
 store.change('save-goal',sample());assert.equal(fs.readFileSync(file+'.pre-v0.5.bak','utf8'),raw);
 const backup=JSON.parse(JSON.stringify(store.state));backup.goals[0].title='旧标题';store.change('save-goal',{...store.state.goals[0],title:'本机新标题'});store.merge(backup);store.merge(backup);assert.equal(store.state.goals.length,1);assert.equal(store.state.goals[0].title,'本机新标题');
});
test('invalid goal or time data never overwrites valid state; schedules detect only explicit overlaps',()=>{
 const state=setup();assert.throws(()=>D.change(state,'save-goal',{title:'不合法',deadline:'2026-02-31'}));
 assert.throws(()=>D.change(state,'save',{title:'无日期的时段',planTime:'09:00'}));assert.throws(()=>D.change(state,'save',{title:'无效用时',duration:2}));
 assert.equal(state.goals.length,1);
 const U=require('../src/ui.js');assert.equal(U.conflicts([{id:'a',plan:'2026-11-11',planTime:'09:00',duration:60},{id:'b',plan:'2026-11-11',planTime:'09:30',duration:30}]).size,2);
});
test('complete backup round-trip preserves goals, stage IDs, activity and repeating plans',()=>{
 let state=setup(),g=state.goals[0];
 state=D.change(state,'save',{title:'背单词',plan:'2026-11-11',goalId:g.id,milestoneId:g.milestones[0].id,repeat:'daily',done:true},at(2026,11,11));
 const imported=D.validateState(D.change(D.defaults(),'import',JSON.parse(JSON.stringify(state))));
 assert.equal(imported.tasks[0].goalId,g.id);assert.equal(imported.tasks[0].milestoneId,g.milestones[0].id);assert.equal(imported.goals[0].activity.length,1);assert.equal(imported.routines.length,1);
 const again=D.change(imported,'import',state);assert.equal(again.tasks.length,1);assert.equal(again.goals.length,1);
});
test('deferring a recurring instance does not move it back to today or stop future instances',()=>{
 let state=D.change(D.defaults(),'save',{title:'练习',plan:'2026-11-09',repeat:'daily'},at(2026,11,9));
 state=D.change(state,'save',{...state.tasks[0],plan:'',planTime:''},at(2026,11,11));assert.equal(state.tasks[0].plan,'');
 state=D.change(state,'ensure-recurring',null,at(2026,11,12));assert.equal(state.tasks.length,2);assert.equal(state.tasks[1].plan,'2026-11-12');
});
test('planned start reminders fire once on the planned day and reset after rescheduling',()=>{
 let state=D.change(D.defaults(),'save',{title:'按计划练习',plan:'2026-11-11',planTime:'09:00',duration:30},at(2026,11,11,8));
 assert.equal(D.pendingStartReminders(state,at(2026,11,11,8)).length,0);assert.equal(D.pendingStartReminders(state,at(2026,11,11,9)).length,1);
 state=D.change(state,'mark-starts',[state.tasks[0].id]);state=D.validateState(state);assert.equal(D.pendingStartReminders(state,at(2026,11,11,10)).length,0);
 state=D.change(state,'save',{...state.tasks[0],planTime:'10:00'},at(2026,11,11));assert.equal(D.pendingStartReminders(state,at(2026,11,11,10)).length,1);
 assert.equal(D.pendingStartReminders(state,at(2026,11,12)).length,0);
});
test('malformed new-schema data is rejected instead of silently discarding goals',()=>{
 assert.throws(()=>D.validateState({version:2,tasks:[],settings:{}}),/格式无效/);
 const state=setup();state.goals[0].milestones[0].id='';assert.throws(()=>D.validateState(state),/编号无效/);
});
test('completing a historical instance cannot overwrite an edited series template',()=>{
 let state=D.change(D.defaults(),'save',{title:'旧练习',plan:'2026-11-09',repeat:'daily',planTime:'09:00'},at(2026,11,9));
 state=D.change(state,'ensure-recurring',null,at(2026,11,11));
 state=D.change(state,'save',{...state.tasks[1],title:'新的每周练习',repeat:'weekly',planTime:'19:00',updateSeries:true},at(2026,11,11));
 state=D.change(state,'toggle-task',state.tasks[0].id,at(2026,11,11));
 assert.equal(state.routines[0].title,'新的每周练习');assert.equal(state.routines[0].rule,'weekly');assert.equal(state.routines[0].planTime,'19:00');
});
