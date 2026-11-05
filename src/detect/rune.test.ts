import { describe, expect, it } from "vitest";
import townMarkerJson from "./fixtures/town-pink-marker.json?raw";
import type { Pixels } from "../cv/image";
import { DEFAULT_RUNE_COLOR, detectRuneByColor, RuneTracker } from "./rune";

const stored = JSON.parse(townMarkerJson) as { width: number; height: number; rgba: string };
const townMarker: Pixels = {
  width: stored.width, height: stored.height,
  data: Uint8ClampedArray.from(atob(stored.rgba), c => c.charCodeAt(0)),
};

function scaled(img: Pixels, scale: number): Pixels {
  const width = Math.round(img.width * scale), height = Math.round(img.height * scale);
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const p = (Math.min(img.height-1, Math.floor(y/scale))*img.width + Math.min(img.width-1, Math.floor(x/scale)))*4;
    data.set(img.data.subarray(p,p+4),(y*width+x)*4);
  }
  return {width,height,data};
}

function diamond(radius: number): Pixels {
  const width=30,height=30,data=new Uint8ClampedArray(width*height*4);
  for(let y=0;y<height;y++) for(let x=0;x<width;x++) {
    const distance=Math.abs(x-15)+Math.abs(y-15);
    const color=distance<=radius?[200,60,230,255]:distance<=radius+2?[235,235,240,255]:[40,60,60,255];
    data.set(color,(y*width+x)*4);
  }
  return {width,height,data};
}

describe("마을 룬 오탐 회귀", () => {
  it.each([.75,1,1.25,1.5,2])("첨부 미니맵의 분홍 세로 표식을 %s배에서도 제외한다", scale => {
    const img=scaled(townMarker,scale),tracker=new RuneTracker();
    for(let now=0;now<=6000;now+=1000){
      const boxes=detectRuneByColor(img,DEFAULT_RUNE_COLOR);
      expect(boxes).toEqual([]);
      expect(tracker.observe(img,boxes,now).newRune).toBe(false);
    }
  });
  it.each([3,4,5,7])("정상 마름모(반지름 %s)는 두 번 확인 후 한 번만 알린다", radius => {
    const img=diamond(radius),tracker=new RuneTracker();
    const boxes=detectRuneByColor(img,DEFAULT_RUNE_COLOR);
    expect(boxes).toHaveLength(1);
    expect(tracker.observe(img,boxes,0).newRune).toBe(false);
    expect(tracker.observe(img,boxes,1000).newRune).toBe(true);
    expect(tracker.observe(img,boxes,2000).newRune).toBe(false);
  });
});
