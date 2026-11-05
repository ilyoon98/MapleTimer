const fs = require('node:fs');
const path = require('node:path');
const KEYS = new Map([
  ['maple-timer-personal.profile.v1', 'profile.json'],
  ['maple-timer-personal.digits.v2', 'digits.json'],
  ['maple-timer-personal.presets.v1', 'presets.json'],
]);
const MAX_BYTES = 16 * 1024 * 1024;

class SettingsRepository {
  constructor(directory) { this.directory = directory; }
  file(key) {
    if (!KEYS.has(key)) throw new Error('지원하지 않는 설정');
    return path.join(this.directory, KEYS.get(key));
  }
  parse(text, key) {
    const record = JSON.parse(text);
    if (record.key !== key || typeof record.value !== 'string') throw new Error('설정 형식 오류');
    const value = JSON.parse(record.value);
    if (!value || typeof value !== 'object') throw new Error('설정 값 오류');
    return record;
  }
  read(key) {
    const file = this.file(key);
    let failed=false;
    for (const [candidate, recovered] of [[file,false],[file+'.bak',true]]) {
      try { return { value: this.parse(fs.readFileSync(candidate,'utf8'),key).value, recovered }; }
      catch (e) { if (e.code !== 'ENOENT') failed=true; }
    }
    return {value:null,...(failed?{error:'저장된 설정을 읽지 못했어요'}:{})};
  }
  atomic(file,text) {
    const temp = file+'.tmp';
    const fd = fs.openSync(temp,'w');
    try { fs.writeFileSync(fd,text,'utf8');fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    fs.renameSync(temp,file);
  }
  write(key,value) {
    const file = this.file(key);
    if (typeof value !== 'string' || Buffer.byteLength(value)>MAX_BYTES) throw new Error('설정이 너무 커요');
    const text=JSON.stringify({key,value,savedAt:Date.now()});this.parse(text,key);
    fs.mkdirSync(this.directory,{recursive:true});
    let previous=null,valid=false;
    try {previous=fs.readFileSync(file,'utf8');}catch(e){if(e.code!=='ENOENT')throw e;}
    if(previous){try{this.parse(previous,key);valid=true;}catch{/* 정상 백업은 손상된 현재 파일로 덮지 않는다 */}}
    if(valid){
      if(JSON.parse(previous).value===value)return {ok:true};
      this.atomic(file+'.bak',previous);
    }
    this.atomic(file,text);
    return {ok:true};
  }
}
module.exports={SettingsRepository};
