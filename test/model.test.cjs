const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Store, task, pendingReminders, validateState } = require('../src/model.cjs');
function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(),'daymark-test-'));
  t.after(() => fs.rmSync(dir,{recursive:true,force:true}));
  const file = path.join(dir,'tasks.json'); return {file,store:new Store(file)};
}
test('save, edit, complete, delete survive a restart and preserve a backup',t => {
  const {file,store} = fixture(t);
  store.save({title:'消融实验',plan:'2026-09-24',category:'科研'});
  let item = store.state.tasks[0];
  store.save({...item,title:'消融实验第二组',done:true});
  assert.equal(new Store(file).state.tasks[0].done,true);
  assert.equal(JSON.parse(fs.readFileSync(file+'.bak')).tasks[0].title,'消融实验');
  store.remove(item.id); assert.equal(new Store(file).state.tasks.length,0);
});
test('failed validation does not overwrite saved data',t => {
  const {file,store} = fixture(t); store.save({title:'保持原数据'});
  const before = fs.readFileSync(file,'utf8');
  assert.throws(() => store.save({title:'',due:'nonsense'}));
  assert.equal(fs.readFileSync(file,'utf8'),before);
  assert.throws(() => task({title:'test',plan:'2026-02-31'}));
});
test('reminders catch up after downtime, deduplicate across restart, reset on reschedule',t => {
  const {file,store} = fixture(t);
  const due = '2026-09-24T12:00:00Z';
  store.save({title:'论文提交',due,lead:60});
  assert.equal(pendingReminders(store.state,Date.parse('2026-09-24T10:59:00Z')).length,0);
  assert.equal(pendingReminders(store.state,Date.parse('2026-09-24T11:00:00Z')).length,1);
  assert.equal(pendingReminders(store.state,Date.parse('2026-09-25T12:00:00Z')).length,1);
  store.mark([store.state.tasks[0].id]);
  assert.equal(pendingReminders(new Store(file).state,Date.parse('2026-09-25T12:00:00Z')).length,0);
  store.save({...store.state.tasks[0],due:'2026-09-25T12:00:00Z'});
  assert.equal(pendingReminders(store.state,Date.parse('2026-09-25T12:00:00Z')).length,1);
  store.save({...store.state.tasks[0],done:true});
  assert.equal(pendingReminders(store.state,Date.parse('2026-09-25T12:00:00Z')).length,0);
});
test('import is idempotent and never replaces local edits',t => {
  const {store} = fixture(t); store.save({title:'本地最新版本'});
  const backup=JSON.parse(JSON.stringify(store.state)); backup.tasks[0].title='旧标题';
  backup.tasks.push(task({title:'新任务'}));
  store.merge(backup); store.merge(backup);
  assert.equal(store.state.tasks.length,2); assert.equal(store.state.tasks[0].title,'本地最新版本');
  assert.throws(() => validateState({...backup,tasks:[backup.tasks[0],backup.tasks[0]]}));
});
test('corrupt primary data is preserved and fails closed',t => {
  const {file} = fixture(t); fs.writeFileSync(file,'broken json');
  assert.throws(() => new Store(file)); assert.equal(fs.readFileSync(file,'utf8'),'broken json');
});
