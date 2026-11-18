const {test}=require('node:test');
const assert=require('node:assert/strict');
const {panelBounds,dimensions,dragBounds}=require('../src/panel-bounds.cjs');
const {validateState}=require('../src/model.cjs');
const primary={x:0,y:0,width:1920,height:1040};
test('old data adopts panel defaults without losing tasks',()=>{
  const old={version:1,tasks:[{id:'old',title:'论文',plan:'2026-09-24',category:'科研'}],settings:{compact:true}};
  const migrated=validateState(old);
  assert.equal(migrated.tasks[0].id,'old');
  assert.equal(migrated.settings.compact,true);
  assert.equal(migrated.settings.panelEnabled,true);
  assert.equal(migrated.settings.panelPinned,false);
  assert.equal(migrated.settings.panelOpacity,.96);
});
test('panel preferences validate and survive normalization',()=>{
  const state=validateState({version:1,tasks:[],settings:{panelEnabled:false,panelPinned:false,panelOpacity:2,panelSize:'huge',panelCollapsed:true}});
  assert.equal(state.settings.panelEnabled,false);
  assert.equal(state.settings.panelPinned,false);
  assert.equal(state.settings.panelOpacity,1);
  assert.equal(state.settings.panelSize,'normal');
  assert.equal(validateState(state).settings.panelCollapsed,true);
});
test('initial panel is positioned within the primary work area',()=>{
  assert.deepEqual(panelBounds(null,[primary]),{x:1536,y:32,width:360,height:600});
});
test('negative-coordinate secondary displays and collapsed height are supported',()=>{
  const left={x:-1600,y:0,width:1600,height:900};
  assert.deepEqual(panelBounds({x:-1000,y:50},[primary,left],'large',true),{x:-1000,y:50,width:400,height:112});
});
test('disconnected monitor and smaller screen never strand the panel',()=>{
  assert.deepEqual(panelBounds({x:2300,y:800},[primary],'large'),{x:1520,y:300,width:400,height:740});
  const tiny={x:0,y:0,width:300,height:400};
  assert.deepEqual(panelBounds({x:Infinity,y:NaN},[tiny],'large'),{x:0,y:0,width:300,height:400});
});
test('custom defaults and current dimensions are independent and persist',()=>{
  const state=validateState({version:1,tasks:[],settings:{panelDefaultSize:{width:430,height:680},panelCurrentSize:{width:550,height:760}}});
  assert.deepEqual(state.settings.panelDefaultSize,{width:430,height:680});
  assert.deepEqual(state.settings.panelCurrentSize,{width:550,height:760});
  assert.deepEqual(validateState(state).settings.panelCurrentSize,{width:550,height:760});
  assert.deepEqual(dimensions({width:-30,height:Infinity}),{width:280,height:600});
});
test('dragging west/north keeps opposite edges fixed, and resizing is bounded',()=>{
  const original={x:100,y:100,width:400,height:700};
  assert.deepEqual(dragBounds(original,30,50,'move'),{x:130,y:150,width:400,height:700});
  assert.deepEqual(dragBounds(original,50,40,'nw'),{x:150,y:140,width:350,height:660});
  assert.deepEqual(dragBounds(original,500,500,'nw'),{x:220,y:440,width:280,height:360});
  assert.deepEqual(dragBounds(original,900,900,'se'),{x:100,y:100,width:1000,height:1400});
});
