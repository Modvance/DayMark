(function(root){
 'use strict';
 const uid=()=>root.crypto.randomUUID();
 const iso=now=>new Date(now??Date.now()).toISOString();
 const day=(d=new Date())=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
 function date(value,label='日期'){
  if(!value)return '';
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||new Date(value+'T12:00:00Z').toISOString().slice(0,10)!==value)throw Error(label+'无效');
  return value;
 }
 function stamp(value){if(!value)return null;if(typeof value!=='string'||!Number.isFinite(Date.parse(value)))throw Error('记录时间无效');return value;}
 const ordinal=value=>Math.floor(Date.parse(value+'T00:00:00Z')/86400000);
 function size(raw,fallback={width:360,height:600}){return {width:Number.isFinite(raw?.width)?Math.round(Math.max(280,Math.min(1000,raw.width))):fallback.width,height:Number.isFinite(raw?.height)?Math.round(Math.max(360,Math.min(1400,raw.height))):fallback.height};}
 function settings(raw={}){
  if(!raw||typeof raw!=='object')raw={};
  return {appearance:['system','light','dark'].includes(raw.appearance)?raw.appearance:'system',pinned:raw.pinned===true,compact:raw.compact===true,autoStart:raw.autoStart===true,panelEnabled:raw.panelEnabled!==false,panelPinned:raw.panelPinned===true,panelOpacity:Number.isFinite(raw.panelOpacity)?Math.max(.7,Math.min(1,raw.panelOpacity)):.96,panelSize:['small','normal','large'].includes(raw.panelSize)?raw.panelSize:'normal',panelCollapsed:raw.panelCollapsed===true,panelDefaultSize:size(raw.panelDefaultSize),panelCurrentSize:size(raw.panelCurrentSize,{width:raw.panelSize==='small'?320:raw.panelSize==='large'?400:360,height:raw.panelSize==='small'?460:raw.panelSize==='large'?740:600})};
 }
 const defaults=()=>({version:2,tasks:[],goals:[],routines:[],settings:settings()});
 function task(input,old={},now){
  if(!input||typeof input!=='object')throw Error('任务格式无效');
  const title=typeof input.title==='string'?input.title.trim():'';
  if(!title||title.length>200)throw Error('任务标题需为 1–200 个字符');
  const due=input.due||null;if(due)stamp(due);
  const plan=date(input.plan,'计划日期');
  const planTime=input.planTime||'';if(planTime&&(!/^([01]\d|2[0-3]):[0-5]\d$/.test(planTime)||!plan))throw Error('计划时段需要有效的计划日期与时间');
  const duration=input.duration==null||input.duration===''?null:Number(input.duration);if(duration!==null&&(!Number.isInteger(duration)||duration<5||duration>720))throw Error('预计用时需为 5–720 分钟');
  const priority=['high','normal','low'].includes(input.priority)?input.priority:'normal';
  const category=['科研','课程','个人'].includes(input.category)?input.category:'个人';
  const lead=[0,15,60,1440].includes(Number(input.lead))?Number(input.lead):60;
  const changed=old.due!==due||old.lead!==lead||(old.done&&!input.done);
  const startChanged=old.plan!==plan||old.planTime!==planTime||(old.done&&!input.done)||(old.startReminder===false&&input.startReminder!==false);
  return {id:old.id||uid(),title,due,plan,planTime,duration,priority,category,lead,startReminder:input.startReminder!==false,startNotified:startChanged?'':old.startNotified||'',note:typeof input.note==='string'?input.note.slice(0,3000):'',done:input.done===true,createdAt:stamp(old.createdAt)||iso(now),completedAt:input.done===true?(old.done?stamp(old.completedAt):iso(now)):null,notified:changed?'':old.notified||'',goalId:typeof input.goalId==='string'?input.goalId:'',milestoneId:typeof input.milestoneId==='string'?input.milestoneId:'',repeat:['daily','weekdays','weekly'].includes(input.repeat)?input.repeat:'none',seriesId:typeof input.seriesId==='string'?input.seriesId:''};
 }
 function goal(input,old={},now){
  if(!input||typeof input!=='object')throw Error('目标格式无效');
  const title=typeof input.title==='string'?input.title.trim():'';if(!title||title.length>200)throw Error('目标名称需为 1–200 个字符');
  const deadline=date(input.deadline,'目标截止日期');
  const milestones=input.milestones||[];if(!Array.isArray(milestones)||milestones.length>100)throw Error('阶段数量不能超过 100');
  const seen=new Set();const stages=milestones.map(m=>{
   const name=typeof m.title==='string'?m.title.trim():'';if(!name||name.length>200)throw Error('阶段名称需为 1–200 个字符');
   const id=m.id||uid();if(typeof id!=='string'||seen.has(id))throw Error('阶段编号无效或重复');seen.add(id);
   return {id,title:name,targetDate:date(m.targetDate,'阶段日期'),done:m.done===true};
  });
  const thresholds=input.thresholds||[30,14,7,3,1,0];if(!Array.isArray(thresholds)||thresholds.length>20||thresholds.some(x=>!Number.isInteger(x)||x<0||x>365))throw Error('提醒节点需为 0–365 天的整数');
  const activity=old.activity||[];if(!Array.isArray(activity)||activity.length>20000)throw Error('推进记录格式无效');
  const records=activity.map(a=>{if(typeof a.taskId!=='string'||!a.taskId||typeof a.title!=='string'||!stamp(a.at))throw Error('推进记录无效');return {taskId:a.taskId,title:a.title.slice(0,200),at:a.at};});
  const uniqueRecords=new Map();for(const r of records)if(!uniqueRecords.has(r.taskId)||Date.parse(uniqueRecords.get(r.taskId).at)<Date.parse(r.at))uniqueRecords.set(r.taskId,r);
  return {id:old.id||uid(),title,deadline,note:typeof input.note==='string'?input.note.slice(0,3000):'',status:['active','paused','completed'].includes(input.status)?input.status:'active',color:['blue','purple','green','orange'].includes(input.color)?input.color:'blue',pinned:input.pinned!==false,weeklyTarget:Number.isInteger(Number(input.weeklyTarget))?Math.max(0,Math.min(50,Number(input.weeklyTarget))):3,milestones:stages,activity:[...uniqueRecords.values()],createdAt:stamp(old.createdAt)||iso(now),remind:input.remind!==false,thresholds:[...new Set(thresholds)].sort((a,b)=>b-a),notified:old.deadline===deadline&&Array.isArray(old.notified)?old.notified.filter(x=>typeof x==='string').slice(0,40):[]};
 }
 function routine(raw){
  if(!raw||typeof raw.id!=='string'||!raw.id||!['daily','weekdays','weekly'].includes(raw.rule))throw Error('重复计划无效');
  if(!raw.startDate)throw Error('重复计划起始日期无效');
  const base=task({...raw,plan:raw.startDate,repeat:raw.rule},raw);
  return {id:raw.id,title:base.title,note:base.note,category:base.category,priority:base.priority,goalId:base.goalId,milestoneId:base.milestoneId,planTime:base.planTime,duration:base.duration,startReminder:base.startReminder,rule:raw.rule,startDate:date(raw.startDate),active:raw.active!==false,lastGeneratedDate:date(raw.lastGeneratedDate)};
 }
 function validateState(raw){
  if(!raw||![1,2].includes(raw.version)||!Array.isArray(raw.tasks)||raw.tasks.length>20000)throw Error('备份格式无效或任务数量过多');
  const goals=raw.goals===undefined&&raw.version===1?[]:raw.goals,routines=raw.routines===undefined&&raw.version===1?[]:raw.routines;if(!Array.isArray(goals)||goals.length>500||!Array.isArray(routines)||routines.length>1000)throw Error('目标或重复计划格式无效');
  function ids(items,label){const set=new Set();for(const item of items){if(!item||typeof item.id!=='string'||!item.id||set.has(item.id))throw Error(label+'编号无效或重复');set.add(item.id);}return set;}
  ids(raw.tasks,'任务');const goalIds=ids(goals,'目标'),seriesIds=ids(routines,'重复计划');
  for(const g of goals){if(g.milestones!==undefined&&!Array.isArray(g.milestones))throw Error('阶段格式无效');ids(g.milestones||[],'阶段');}
  const normalizedGoals=goals.map(g=>goal(g,g));
  const tasks=raw.tasks.map(t=>task(t,t));
  const normalizedRoutines=routines.map(routine);
  for(const t of [...tasks,...normalizedRoutines]){
   if(!goalIds.has(t.goalId)){t.goalId='';t.milestoneId='';}
   if(t.milestoneId&&!normalizedGoals.find(g=>g.id===t.goalId)?.milestones.some(m=>m.id===t.milestoneId))t.milestoneId='';
  }
  for(const t of tasks)if(t.seriesId&&!seriesIds.has(t.seriesId)){t.seriesId='';t.repeat='none';}
  return {version:2,tasks,goals:normalizedGoals,routines:normalizedRoutines,settings:settings(raw.settings)};
 }
 function goalStats(g,now=Date.now()){
  const today=day(new Date(now)),todayN=ordinal(today),weekday=(new Date(today+'T12:00:00').getDay()+6)%7,week=todayN-weekday;
  const records=g.activity||[],recent=records.filter(a=>{const n=ordinal(day(new Date(a.at)));return n>=week&&n<=todayN;});
  const latest=[...records].sort((a,b)=>Date.parse(b.at)-Date.parse(a.at))[0];
  const inactive=Math.max(0,todayN-ordinal(day(new Date(latest?.at||g.createdAt))));
  return {days:g.deadline?ordinal(g.deadline)-todayN:null,stageDone:g.milestones.filter(m=>m.done).length,stageTotal:g.milestones.length,stage:g.milestones.find(m=>!m.done)?.title||(g.milestones.length?'全部阶段已完成':'还未设置阶段'),weekCount:recent.length,lastAt:latest?.at||null,inactiveDays:inactive};
 }
 const reminderKey=t=>`${t.due}|${t.lead}`;
 const pendingReminders=(state,now=Date.now())=>state.tasks.filter(t=>!t.done&&t.due&&t.notified!==reminderKey(t)&&now>=Date.parse(t.due)-t.lead*60000);
 const pendingStartReminders=(state,now=Date.now())=>state.tasks.filter(t=>!t.done&&t.startReminder&&t.plan===day(new Date(now))&&t.planTime&&t.startNotified!==`${t.plan}|${t.planTime}`&&now>=new Date(t.plan+'T'+t.planTime+':00').getTime());
 function crossed(g,now){const days=goalStats(g,now).days;return days===null?[]:g.thresholds.filter(n=>days<=n);}
 const pendingGoalReminders=(state,now=Date.now())=>state.goals.filter(g=>g.status==='active'&&g.remind&&crossed(g,now).some(n=>!g.notified.includes(`${g.deadline}|${n}`)));
 function change(state,action,input,now=Date.now()){
  if(action==='settings')return {...state,settings:{...state.settings,...input}};
  if(action==='save'){
   const old=state.tasks.find(t=>t.id===input.id);if(input.id&&!old)throw Error('任务不存在，请重新打开');
   let next=task(input,old,now),routines=state.routines;
   if(next.goalId&&!state.goals.some(g=>g.id===next.goalId))throw Error('关联目标不存在');
   if(next.milestoneId&&!state.goals.find(g=>g.id===next.goalId)?.milestones.some(m=>m.id===next.milestoneId))throw Error('关联阶段不存在');
   const existing=routines.find(r=>r.id===old?.seriesId),seriesEdit=input.updateSeries===true||(!!old&&next.repeat!==old.repeat);
   if(existing&&!seriesEdit){next.seriesId=existing.id;next.repeat=existing.active?existing.rule:'none';}
   else if(next.repeat!=='none'){
    if(!next.plan&&(!existing||existing.rule!==next.repeat))next.plan=day(new Date(now));
    const seriesId=existing?.id||uid();
    const template={...next,id:seriesId,rule:next.repeat,startDate:existing&&existing.rule===next.repeat?existing.startDate:next.plan,active:true,lastGeneratedDate:existing?.lastGeneratedDate||next.plan};
    routines=existing?routines.map(r=>r.id===seriesId?routine(template):r):[...routines,routine(template)];next.seriesId=seriesId;
   }else if(existing&&seriesEdit){routines=routines.map(r=>r.id===existing.id?{...r,active:false}:r);next.seriesId='';}
   const goals=state.goals.map(g=>{
    let activity=g.activity;
    if(old?.goalId===g.id&&(!next.done||next.goalId!==g.id))activity=activity.filter(a=>a.taskId!==next.id);
    if(next.goalId===g.id&&next.done&&next.completedAt){activity=[...activity.filter(a=>a.taskId!==next.id),{taskId:next.id,title:next.title,at:next.completedAt}];}
    return {...g,activity};
   });
   return {...state,goals,routines,tasks:old?state.tasks.map(t=>t.id===old.id?next:t):[...state.tasks,next]};
  }
  if(action==='toggle-task'){const t=state.tasks.find(t=>t.id===input);if(!t)throw Error('任务不存在');return change(state,'save',{...t,done:!t.done},now);}
  if(action==='delete')return {...state,tasks:state.tasks.filter(t=>t.id!==input)};
  if(action==='save-goal'){
   const old=state.goals.find(g=>g.id===input.id);if(input.id&&!old)throw Error('目标不存在');const next=goal(input,old,now);
   return {...state,goals:old?state.goals.map(g=>g.id===old.id?next:g):[...state.goals,next]};
  }
  if(action==='delete-goal')return {...state,goals:state.goals.filter(g=>g.id!==input),tasks:state.tasks.map(t=>t.goalId===input?{...t,goalId:'',milestoneId:''}:t),routines:state.routines.map(r=>r.goalId===input?{...r,goalId:'',milestoneId:''}:r)};
  if(action==='toggle-milestone'){
   const g=state.goals.find(g=>g.id===input.goalId);if(!g?.milestones.some(m=>m.id===input.milestoneId))throw Error('阶段不存在');
   return {...state,goals:state.goals.map(x=>x.id===g.id?{...x,milestones:x.milestones.map(m=>m.id===input.milestoneId?{...m,done:!m.done}:m)}:x)};
  }
  if(action==='plan-milestone'){
   const g=state.goals.find(g=>g.id===input.goalId),m=g?.milestones.find(m=>m.id===input.milestoneId);if(!m)throw Error('阶段不存在');if(g.status!=='active'||m.done)throw Error('这个阶段已结束或目标未在进行中');
   const plan=date(input.plan)||day(new Date(now));
   if(state.tasks.some(t=>!t.done&&t.goalId===g.id&&t.milestoneId===m.id&&t.plan===plan))return state;
   return change(state,'save',{title:m.title,plan,goalId:g.id,milestoneId:m.id,category:'个人',priority:'normal',lead:60,note:'',done:false},now);
  }
  if(action==='mark')return {...state,tasks:state.tasks.map(t=>input.includes(t.id)?{...t,notified:reminderKey(t)}:t)};
  if(action==='mark-starts')return {...state,tasks:state.tasks.map(t=>input.includes(t.id)?{...t,startNotified:`${t.plan}|${t.planTime}`}:t)};
  if(action==='mark-goals')return {...state,goals:state.goals.map(g=>input.includes(g.id)?{...g,notified:[...new Set([...g.notified,...crossed(g,now).map(n=>`${g.deadline}|${n}`)])]}:g)};
  if(action==='ensure-recurring'){
   const today=day(new Date(now)),n=ordinal(today),weekday=new Date(today+'T12:00:00').getDay();let tasks=state.tasks,changed=false;
   const routines=state.routines.map(r=>{
    if(!r.active||(r.goalId&&state.goals.find(g=>g.id===r.goalId)?.status!=='active')||r.lastGeneratedDate>=today||today<r.startDate||(r.rule==='weekdays'&&(weekday===0||weekday===6))||(r.rule==='weekly'&&(n-ordinal(r.startDate))%7!==0))return r;
    if(!tasks.some(t=>t.seriesId===r.id&&t.plan===today)){tasks=[...tasks,task({...r,seriesId:r.id,repeat:r.rule,plan:today,due:null,lead:60,done:false},{},now)];}
    changed=true;return {...r,lastGeneratedDate:today};
   });return changed?{...state,tasks,routines}:state;
  }
  if(action==='import'){
   const imported=validateState(input);
   const merge=(a,b)=>{const ids=new Set(a.map(x=>x.id));return [...a,...b.filter(x=>!ids.has(x.id))];};
   return {...state,tasks:merge(state.tasks,imported.tasks),goals:merge(state.goals,imported.goals),routines:merge(state.routines,imported.routines)};
  }
  throw Error('未知操作');
 }
 const D={day,date,ordinal,settings,defaults,task,goal,validateState,goalStats,reminderKey,pendingReminders,pendingStartReminders,pendingGoalReminders,change};
 root.DaymarkDomain=D;if(typeof module!=='undefined')module.exports=D;
})(typeof window!=='undefined'?window:globalThis);
