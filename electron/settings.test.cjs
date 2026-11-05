const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');
const {SettingsRepository}=require('./settings.cjs');
test('즉시 저장·재시작·손상 복구에서 이전 설정을 보존한다',t=>{
  const root=path.resolve(__dirname,'../release');fs.mkdirSync(root,{recursive:true});
  const dir=fs.mkdtempSync(path.join(root,'settings-test-'));
  t.after(()=>{assert.equal(path.dirname(path.resolve(dir)),root);fs.rmSync(dir,{recursive:true,force:true});});
  const key='maple-timer-personal.profile.v1',repo=new SettingsRepository(dir);
  repo.write(key,JSON.stringify({v:1,theme:'dark'}));
  assert.equal(JSON.parse(new SettingsRepository(dir).read(key).value).theme,'dark');
  repo.write(key,JSON.stringify({v:1,theme:'light'}));
  fs.writeFileSync(path.join(dir,'profile.json'),'{broken');
  const recovered=repo.read(key);assert.equal(recovered.recovered,true);assert.equal(JSON.parse(recovered.value).theme,'dark');
  repo.write(key,recovered.value);assert.equal(repo.read(key).recovered,false);
  assert.throws(()=>repo.write('../other','{}'));
  assert.throws(()=>repo.write(key,'{broken'));
  assert.equal(JSON.parse(repo.read(key).value).theme,'dark');
});
