import { describe,it,expect } from 'vitest';
import { findMinimap,findBooster,findExperienceBand,RegionConfirmation } from './autoRegions';
import type { Pixels } from '../cv/image';
const image=():Pixels=>({width:400,height:250,data:new Uint8ClampedArray(400*250*4).fill(150)});
describe('영역 자동 탐색',()=>{
  it('경험치 막대는 화면 하단 왼쪽에서 여러 줄 이어질 때만 찾는다',()=>{
    const img=image();expect(findExperienceBand(img)).toBeNull();
    for(let y=238;y<246;y++)for(let x=0;x<60;x++){const p=(y*img.width+x)*4;img.data[p]=180;img.data[p+1]=230;img.data[p+2]=0;}
    expect(findExperienceBand(img)).toEqual({x:0,y:238,w:400,h:12});
  });
  it('평평한 화면이나 게임 배경만 있을 때 미니맵을 추측하지 않는다',()=>{
    expect(findMinimap(image())).toBeNull();
    expect(findBooster(image())).toBeNull();
  });
  it('네 변의 테두리가 있는 어두운 지도만 찾는다',()=>{
    const img=image();
    for(let y=21;y<121;y++)for(let x=11;x<211;x++){const p=(y*img.width+x)*4;img.data[p]=img.data[p+1]=img.data[p+2]=30;}
    expect(findMinimap(img)).toEqual({x:11,y:21,w:200,h:100});
  });
  it('다른 위치나 사라진 후보는 확정하지 않고, 세 번 같은 위치만 받아들인다',()=>{
    const c=new RegionConfirmation(),r={x:10,y:20,w:200,h:100};
    expect(c.observe(r)).toBeNull();expect(c.observe(r)).toBeNull();expect(c.observe(r)).toEqual(r);
    expect(c.observe({...r,x:90})).toBeNull();expect(c.observe(null)).toBeNull();expect(c.observe(r)).toBeNull();
  });
});
