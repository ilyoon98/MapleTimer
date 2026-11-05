const {test}=require('node:test');const assert=require('node:assert/strict');const {EventEmitter}=require('node:events');
const {createUpdateController}=require('./updates.cjs');
test('실패는 표시하고 재확인·다운로드·설치까지 상태를 전달한다',async()=>{
  const updater=new EventEmitter(),notifications=[];let failed=true,installs=0;
  updater.checkForUpdates=async()=>{if(failed)throw Error('offline');updater.emit('update-available',{version:'0.3.3'});};
  updater.quitAndInstall=()=>installs++;
  const controller=createUpdateController({version:'0.3.2',updater,notify:s=>notifications.push(s)});
  assert.equal((await controller.check()).status,'error');assert.equal(controller.get().error,'offline');
  failed=false;assert.equal((await controller.check()).status,'available');
  updater.emit('download-progress',{percent:60});assert.equal(controller.get().progress,60);
  assert.throws(()=>controller.install());updater.emit('update-downloaded',{version:'0.3.3'});
  assert.equal(controller.get().status,'downloaded');controller.install();assert.equal(installs,1);
  assert.equal(updater.autoDownload,true);assert.equal(updater.autoInstallOnAppQuit,true);
  assert.ok(notifications.every((s,i)=>i===0||s.revision>notifications[i-1].revision));
});
