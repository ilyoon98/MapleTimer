import { describe,it,expect } from 'vitest';
import { GAME_RESOLUTIONS,inferGameViewport,validViewport } from './layout';
describe('게임 화면 크기',()=>{
  for(const [w,h]of GAME_RESOLUTIONS){
    it(`${w}×${h} 전체화면과 창모드 좌표`,()=>{
      expect(inferGameViewport(w,h)).toEqual({x:0,y:0,w,h});
      expect(inferGameViewport(w+2,h+32)).toEqual({x:1,y:31,w,h});
      expect(inferGameViewport(w+16,h+39)).toEqual({x:8,y:31,w,h});
    });
  }
  it('알 수 없는 화면을 임의로 확대하거나 자르지 않는다',()=>expect(inferGameViewport(1600,900)).toEqual({x:0,y:0,w:1600,h:900}));
  it('수동 게임 영역의 잘못된 좌표를 거부한다',()=>{
    expect(validViewport({x:-1,y:0,w:1920,h:1080},1920,1080)).toBe(false);
    expect(validViewport({x:0,y:0,w:2560,h:1440},1920,1080)).toBe(false);
    expect(validViewport({x:0,y:0,w:NaN,h:720},1920,1080)).toBe(false);
    expect(validViewport({x:320,y:180,w:1280,h:720},1920,1080)).toBe(true);
  });
});
