(function(root) {
  'use strict';
  const D=root.DaymarkDomain||(typeof require==='function'?require('./domain.js'):null);
  const day = (d=new Date()) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const esc = value => String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const paths={
    target:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
    repeat:'<path d="m17 2 4 4-4 4M3 10V6h18M7 22l-4-4 4-4m14 0v4H3"/>',
    sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
    calendar:'<rect x="3" y="5" width="18" height="16" rx="4"/><path d="M7 3v4m10-4v4M3 11h18m-13 4h.01M12 15h.01M16 15h.01"/>',
    stack:'<path d="M4 5h16M4 12h16M4 19h16"/><path d="M4 5h.01M4 12h.01M4 19h.01"/>',
    flag:'<path d="M5 22V3c5-4 9 4 14 0v11c-5 4-9-4-14 0"/>',
    check:'<path d="m5 12 4 4L19 6"/>',
    search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
    plus:'<path d="M12 5v14M5 12h14"/>',
    settings:'<path d="m9 3 .6 2a8 8 0 0 1 4.8 0l.6-2 3 2-1 2a8 8 0 0 1 2.4 4l2 .5v3l-2 .5a8 8 0 0 1-2.4 4l1 2-3 2-.6-2a8 8 0 0 1-4.8 0l-.6 2-3-2 1-2a8 8 0 0 1-2.4-4l-2-.5v-3l2-.5A8 8 0 0 1 7 7L6 5z" transform="translate(0 -1) scale(.96)"/><circle cx="12" cy="12" r="3"/>',
    widget:'<rect x="3" y="3" width="18" height="18" rx="5"/><path d="M3 10h18M10 10v11"/>',
    clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    chevron:'<path d="m9 5 7 7-7 7"/>',
    close:'<path d="m6 6 12 12M6 18 18 6"/>',
    more:'<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
    pin:'<path d="m8 3 8 0-1 6 3 3v2H6v-2l3-3zM12 14v8"/>',
    inbox:'<path d="m5 4-3 11v5h20v-5L19 4zM2 15h6l2 3h4l2-3h6"/>',
    arrow:'<path d="M5 12h14m-6-6 6 6-6 6"/>',
    moon:'<path d="M20 14A9 9 0 0 1 10 3a9 9 0 1 0 10 11z"/>',
    expand:'<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
    minus:'<path d="M5 12h14"/>',
    edit:'<path d="m14 4 6 6M4 20l5-1L21 7a2 2 0 0 0-4-4L5 15z"/>',
    trash:'<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',
    download:'<path d="M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5"/>',
    upload:'<path d="M12 16V4m-4 4 4-4 4 4M4 16v5h16v-5"/>'
  };
  const icon=(name,cls='')=>`<svg class="icon ${esc(cls)}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]||paths.stack}</svg>`;
  const isOverdue=(t,now=Date.now())=>!t.done && !!t.due && Date.parse(t.due)<now;
  function countdown(t,now=Date.now()) {
    if(!t.due)return '';
    const diff=Date.parse(t.due)-now,mins=Math.max(1,Math.ceil(Math.abs(diff)/60000));
    const unit=mins<60?`${mins} 分钟`:mins<1440?`${Math.floor(mins/60)} 小时`:`${Math.floor(mins/1440)} 天`;
    return diff<0?`逾期 ${unit}`:`剩余 ${unit}`;
  }
  function filter(tasks,{view='today',category='',date=day(),query='',showDone=false}={}) {
    const today=day();
    return tasks.filter(t=>{
      if(view==='done'?!t.done:(t.done&&!showDone))return false;
      if(view==='today'&&t.plan!==today)return false;
      if(view==='date'&&t.plan!==date)return false;
      if(view==='inbox'&&(t.plan||t.due))return false;
      if(view==='scheduled'&&!(t.plan||t.due))return false;
      if(view==='flagged'&&t.priority!=='high')return false;
      if(view==='overdue'&&!isOverdue(t))return false;
      if(view==='upcoming'&&(!t.due||Date.parse(t.due)<Date.now()||Date.parse(t.due)>Date.now()+7*86400000))return false;
      return (!category||t.category===category)&&(!query||(t.title+' '+t.note).toLocaleLowerCase().includes(query.toLocaleLowerCase()));
    });
  }
  function sort(tasks,mode='priority') {
    const rank={high:0,normal:1,low:2};
    return [...tasks].sort((a,b)=>Number(a.done)-Number(b.done)||Number(isOverdue(b))-Number(isOverdue(a))||(mode==='priority'?rank[a.priority]-rank[b.priority]:0)||(a.due?Date.parse(a.due):Infinity)-(b.due?Date.parse(b.due):Infinity)||String(a.createdAt).localeCompare(String(b.createdAt)));
  }
  function applyTheme(settings={}) {
    if(!root.document)return;
    root.document.documentElement.dataset.theme=settings.appearance||'system';
  }
  function goalCountdown(g){const n=D.goalStats(g).days;return n===null?'未设截止日期':n>0?`还剩 ${n} 天`:n===0?'今天到期':`已到期 ${Math.abs(n)} 天`;}
  function timeline(tasks){return [...tasks].sort((a,b)=>(a.planTime||'99:99').localeCompare(b.planTime||'99:99')||Number(a.done)-Number(b.done));}
  function conflicts(tasks){const ids=new Set(),timed=tasks.filter(t=>!t.done&&t.planTime&&t.duration);for(let i=0;i<timed.length;i++)for(let j=i+1;j<timed.length;j++){const a=timed[i],b=timed[j];if(a.plan!==b.plan)continue;const minutes=t=>Number(t.planTime.slice(0,2))*60+Number(t.planTime.slice(3));if(minutes(a)<minutes(b)+b.duration&&minutes(b)<minutes(a)+a.duration){ids.add(a.id);ids.add(b.id);}}return ids;}
  function previewBridge(){
    const key='daymark-preview-v4',listeners=new Set();
    const read=()=>{try{return D.validateState(JSON.parse(localStorage.getItem(key))||D.defaults());}catch{return D.defaults();}};
    let state=read();
    root.addEventListener?.('storage',event=>{if(event.key===key){state=read();listeners.forEach(cb=>cb(structuredClone(state)));}});
    return {onState:cb=>listeners.add(cb),async call(action,payload){
      state=read();
      if(action==='get'){state=D.change(state,'ensure-recurring');localStorage.setItem(key,JSON.stringify(state));return structuredClone(state);}
      if(action==='panel-default-size')state=D.change(state,'settings',{panelCurrentSize:state.settings.panelDefaultSize});
      else if(action==='demo'){
        if(state.tasks.length||state.goals.length)throw Error('请先清空预览中的任务和目标，再载入示例');
        const shifted=(days,hours=18)=>{const d=new Date();d.setDate(d.getDate()+days);d.setHours(hours,0,0,0);return d;};
        for(const input of [
          {title:'英语四六级准备',deadline:day(shifted(45)),weeklyTarget:4,color:'blue',note:'示例日期，请替换为实际考试日期。',milestones:[{title:'建立词汇复习节奏'},{title:'听力与阅读专项练习'},{title:'完成考前模拟'}]},
          {title:'CSP 考试准备',deadline:day(shifted(75)),weeklyTarget:3,color:'purple',note:'示例日期，请替换为实际考试日期。',milestones:[{title:'巩固基础算法'},{title:'完成专题练习'},{title:'进行限时模拟'}]}
        ])state=D.change(state,'save-goal',input);
        const english=state.goals[0],csp=state.goals[1];
        for(const input of [
          {title:'完成一组英语听力练习',goalId:english.id,plan:day(),planTime:'09:00',duration:30,priority:'high',note:'完成后记录两处易错点。'},
          {title:'练习一道图论题',goalId:csp.id,plan:day(),planTime:'19:00',duration:60},
          {title:'整理课程笔记',category:'课程',plan:day()},
          {title:'提交实验报告',category:'课程',plan:day(shifted(-1)),due:shifted(-1,20).toISOString()},
          {title:'复习 20 个单词',goalId:english.id,plan:day(),done:true},
          {title:'想一想下周的安排',plan:''}
        ])state=D.change(state,'save',{category:'个人',priority:'normal',lead:60,note:'',...input});
      }else if(['save','delete','toggle-task','settings','save-goal','delete-goal','toggle-milestone','plan-milestone'].includes(action))state=D.change(state,action,payload);
      else throw Error('此功能需要启动桌面版');
      state=D.validateState(state);localStorage.setItem(key,JSON.stringify(state));return structuredClone(state);
    }};
  }
  const UI={day,esc,icon,isOverdue,countdown,filter,sort,applyTheme,previewBridge,goalCountdown,goalStats:D.goalStats,timeline,conflicts};
  root.DaymarkUI=UI;if(typeof module!=='undefined')module.exports=UI;
})(typeof window!=='undefined'?window:globalThis);
