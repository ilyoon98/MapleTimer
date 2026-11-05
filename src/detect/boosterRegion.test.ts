import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import fixture from "./fixtures/booster-quest-overlay.json?raw";
import { findBooster, RegionConfirmation } from "./autoRegions";
import { cropPixels, type Pixels } from "../cv/image";
import { readSevenSegment } from "../cv/sevenSegment";

describe("실플레이 부스터 자동 위치", () => {
  it("퀘스트 글자가 겹친 실제 49초 화면도 고정 영역에서 읽는다", () => {
    const f=JSON.parse(fixture),raw=inflateSync(Uint8Array.from(atob(f.rgbaDeflate),c=>c.charCodeAt(0)));
    const img:Pixels={width:f.screenWidth,height:f.screenHeight,data:new Uint8ClampedArray(f.screenWidth*f.screenHeight*4)};
    for(let y=0;y<f.height;y++)img.data.set(raw.subarray(y*f.width*4,(y+1)*f.width*4),((y+f.y)*img.width+f.x)*4);
    const region=findBooster(img)!;
    expect(region).toEqual({x:370,y:90,w:230,h:65});
    expect(readSevenSegment(cropPixels(img,region.x,region.y,region.w,region.h))?.seconds).toBe(49.5);
    const confirmation=new RegionConfirmation();
    expect(confirmation.observe(region)).toBeNull();expect(confirmation.observe(region)).toBeNull();
    expect(confirmation.observe(region)).toEqual(region);
    // 실제로 실패하던 넓은 영역: 위치와 판독기 중 어느 단계가 문제였는지 보존한다.
    expect(readSevenSegment(cropPixels(img,290,60,340,120))).toBeNull();
  });
});
