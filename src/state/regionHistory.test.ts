import { beforeEach,describe,expect,it } from 'vitest';
import { defaultProfile,profileStore,setRegion,restoreRegionLayout,migrate } from './profile';
beforeEach(()=>profileStore.set(defaultProfile()));
describe('해상도별 설정 복원',()=>{
  it('와이드에서 4:3으로 전환하고 되돌아와도 원래 영역을 복원한다',()=>{
    const a={x:10,y:80,w:240,h:120,frameW:1920,frameH:1080};
    const b={x:12,y:60,w:160,h:100,frameW:1024,frameH:768};
    setRegion('minimap',a);restoreRegionLayout(1024,768);
    expect(profileStore.get().regions.minimap).toEqual(a); // 모르는 크기에서 임의 확대하지 않음
    setRegion('minimap',b);restoreRegionLayout(1920,1080);
    expect(profileStore.get().regions.minimap).toEqual(a);
    restoreRegionLayout(1024,768);expect(profileStore.get().regions.minimap).toEqual(b);
    setRegion('minimap',null);restoreRegionLayout(1920,1080);expect(profileStore.get().regions.minimap).toBeUndefined();
  });
  it('예전 설정 파일도 새 화면 기록 필드를 초기화한다',()=>{
    const p=migrate({v:1,regions:{}});
    expect(p.regionHistory).toEqual({});expect(p.gameViewports).toEqual({});expect(p.referenceHistory).toEqual({});
  });
});
