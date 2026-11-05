function createUpdateController({version,updater,notify=()=>{},now=Date.now}) {
  let state={currentVersion:version,status:updater?'idle':'disabled',latestVersion:null,progress:null,error:null,checkedAt:null,revision:0};
  const change=patch=>{state={...state,...patch,revision:state.revision+1};notify(state);};
  if(updater){
    updater.autoDownload=true;updater.autoInstallOnAppQuit=true;
    updater.on('checking-for-update',()=>change({status:'checking',error:null,checkedAt:now()}));
    updater.on('update-available',info=>change({status:'available',latestVersion:info.version,error:null}));
    updater.on('download-progress',p=>change({status:'downloading',progress:Math.max(0,Math.min(100,p.percent))}));
    updater.on('update-not-available',()=>change({status:'current',latestVersion:version,progress:null,error:null}));
    updater.on('update-downloaded',info=>change({status:'downloaded',latestVersion:info.version,progress:100,error:null}));
    updater.on('error',e=>change({status:'error',error:String(e?.message||e),progress:null}));
  }
  return {
    get:()=>({...state}),
    async check(){
      if(!updater||['checking','available','downloading','downloaded'].includes(state.status))return this.get();
      change({status:'checking',checkedAt:now(),error:null});
      try{await updater.checkForUpdates();}catch(e){change({status:'error',error:String(e?.message||e)});}
      return this.get();
    },
    install(){if(!updater||state.status!=='downloaded')throw new Error('업데이트가 아직 준비되지 않았어요');updater.quitAndInstall(true,true);},
  };
}
module.exports={createUpdateController};
