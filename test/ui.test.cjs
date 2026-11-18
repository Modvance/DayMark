const {test}=require('node:test');
const assert=require('node:assert/strict');
const U=require('../src/ui.js');
const {validateState}=require('../src/model.cjs');
const items=()=>[
 {id:'1',title:'今天的任务',note:'',plan:U.day(),due:null,priority:'normal',done:false},
 {id:'2',title:'过去计划',note:'搜索备注',plan:'2000-01-01',due:new Date(Date.now()-3600000).toISOString(),priority:'low',done:false},
 {id:'3',title:'收件箱',note:'',plan:'',due:null,priority:'high',done:false},
 {id:'4',title:'完成',note:'',plan:U.day(),due:null,priority:'high',done:true}
];
test('smart lists distinguish today, scheduled, important and inbox',()=>{
 assert.deepEqual(U.filter(items(),{view:'today'}).map(t=>t.id),['1']);
 assert.deepEqual(U.filter(items(),{view:'scheduled'}).map(t=>t.id),['1','2']);
 assert.deepEqual(U.filter(items(),{view:'inbox'}).map(t=>t.id),['3']);
 assert.deepEqual(U.filter(items(),{view:'flagged'}).map(t=>t.id),['3']);
 assert.equal(U.filter(items(),{view:'today',showDone:true}).length,2);
 assert.equal(U.filter(items(),{view:'all',query:'搜索备注'}).length,1);
});
test('overdue tasks stay visible and sort before undated important tasks',()=>{
 assert.deepEqual(U.filter(items(),{view:'overdue'}).map(t=>t.id),['2']);
 assert.equal(U.sort(items())[0].id,'2');
 assert.equal(U.sort(items()).at(-1).id,'4');
});
test('HTML escaping protects titles, notes and identifiers',()=>{
 assert.equal(U.esc('<img onerror="alert(1)">'), '&lt;img onerror=&quot;alert(1)&quot;&gt;');
 assert.equal(U.esc(null),'');
});
test('appearance migration defaults safely and preserves original tasks and panel sizes',()=>{
 const old={version:1,tasks:[],settings:{panelCurrentSize:{width:480,height:700},panelPinned:false}};
 assert.equal(validateState(old).settings.appearance,'system');
 old.settings.appearance='dark';assert.equal(validateState(old).settings.appearance,'dark');
 assert.equal(validateState(old).settings.panelCurrentSize.width,480);
 old.settings.appearance='invalid';assert.equal(validateState(old).settings.appearance,'system');
});
