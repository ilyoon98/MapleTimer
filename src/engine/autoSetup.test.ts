import { describe,it,expect,vi } from 'vitest';
const mock=vi.hoisted(()=>({find:vi.fn(()=>({x:10,y:30,w:100,h:60})),booster:vi.fn<() => {x:number;y:number;w:number;h:number}|null>(()=>null)}));
vi.mock('../capture/screenCapture',()=>({screenCapture:{width:400,height:300,sessionId:1,layoutRevision:1,crop:()=>({width:180,height:150,data:new Uint8ClampedArray(180*150*4)})}}));
vi.mock('../detect/autoRegions',async importOriginal=>({...(await importOriginal<typeof import('../detect/autoRegions')>()),findMinimap:mock.find,findBooster:mock.booster}));
import { autoSetup } from './autoSetup';
import { defaultProfile,profileStore,setRegion } from '../state/profile';
describe('자동 설정 적용',()=>{
  it('세 번 확인한 후보만 적용하고 사용자가 지정한 위치는 덮지 않는다',()=>{
    profileStore.set(defaultProfile());
    autoSetup(1500);autoSetup(3000);expect(profileStore.get().regions.minimap).toBeUndefined();
    autoSetup(4500);expect(profileStore.get().regions.minimap?.automatic).toBe(true);
    const manual={x:30,y:50,w:120,h:80,frameW:400,frameH:300};
    setRegion('minimap',manual);
    mock.find.mockReturnValue({x:90,y:20,w:100,h:60});
    autoSetup(6000);autoSetup(7500);autoSetup(9000);
    expect(profileStore.get().regions.minimap).toEqual(manual);
  });
  it('부스터는 별도 선택 없이 중앙 후보를 세 번 확인하고 예전 직접 지정 위치를 갱신한다',()=>{
    const p=defaultProfile();p.rune.enabled=false;p.booster.enabled=true;
    profileStore.set(p);
    setRegion('booster',{x:5,y:5,w:20,h:20,frameW:400,frameH:300});
    mock.booster.mockReturnValue({x:20,y:30,w:80,h:40});
    autoSetup(10500);autoSetup(12000);
    expect(profileStore.get().regions.booster?.x).toBe(5);
    autoSetup(13500);
    expect(profileStore.get().regions.booster).toEqual({x:120,y:30,w:80,h:40,frameW:400,frameH:300,automatic:true});
    mock.booster.mockReturnValue(null);autoSetup(15000);
    expect(profileStore.get().regions.booster?.x).toBe(120);
  });
});
