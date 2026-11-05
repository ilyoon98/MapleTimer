import { connectedComponents, type Pixels } from '../cv/image';
import { cropPixels } from '../cv/image';
import { readSevenSegment } from '../cv/sevenSegment';
import type { Rect } from '../capture/types';

/** 어두운 내부와 네 변의 밝은 테두리가 모두 있는 미니맵만 후보로 삼는다. */
export function findMinimap(img: Pixels): Rect | null {
  const { width:w, height:h, data:d } = img;
  const mask = new Uint8Array(w*h);
  const luma = (x:number,y:number) => {
    if (x<0 || y<0 || x>=w || y>=h) return 0;
    const p=(y*w+x)*4; return (d[p]+d[p+1]+d[p+2])/3;
  };
  for(let i=0;i<w*h;i++) mask[i]=(d[i*4]+d[i*4+1]+d[i*4+2])/3<70?1:0;
  const candidates = connectedComponents(mask,w,h,2000).filter(b=>b.w>=80&&b.h>=40&&b.w< w-4&&b.h<h-4&&b.w/b.h>0.6&&b.w/b.h<5);
  for (const b of candidates.sort((a,b)=>a.y-b.y||a.x-b.x)) {
    const horizontal=(y:number)=>{let n=0;for(let x=b.x;x<b.x+b.w;x++)if(Math.max(luma(x,y),luma(x,y-1),luma(x,y+1))>110)n++;return n/b.w;};
    const vertical=(x:number)=>{let n=0;for(let y=b.y;y<b.y+b.h;y++)if(Math.max(luma(x,y),luma(x-1,y),luma(x+1,y))>110)n++;return n/b.h;};
    if(horizontal(b.y-1)>0.6&&horizontal(b.y+b.h)>0.6&&vertical(b.x-1)>0.6&&vertical(b.x+b.w)>0.6)
      return {x:b.x,y:b.y,w:b.w,h:b.h};
  }
  return null;
}

/** 화면 상단 중앙의 디지털 숫자 띠를 찾고 실제 판독까지 성공해야 반환한다. */
export function findBooster(img: Pixels): Rect | null {
  // 부스터 숫자 위치는 고정이다. 1920×1080 실플레이에서 이 영역은 읽혔지만,
  // 화면 전체의 노란 픽셀로 폭을 잡으면 겹친 퀘스트 글자까지 포함해 판독이 실패했다.
  // 기본 UI와 해상도 비례 UI를 먼저 확인한다. 숫자 모양(초.소수 두 자리)까지
  // 확인하므로 부스터가 없을 때 영역을 임의로 확정하지 않는다.
  for (const scale of new Set([1, img.width / 960])) {
    const r = { x: Math.round(img.width / 2 - 110 * scale), y: Math.round(90 * scale),
      w: Math.round(230 * scale), h: Math.round(65 * scale) };
    if (r.x < 0 || r.y + r.h > img.height || r.x + r.w > img.width) continue;
    const read = readSevenSegment(cropPixels(img,r.x,r.y,r.w,r.h));
    if (read && read.confidence >= 0.85) return r;
  }
  const rows:number[]=[];
  for(let y=0;y<img.height;y++) {
    let n=0; for(let x=0;x<img.width;x++){const p=(y*img.width+x)*4;if(img.data[p]>=230&&img.data[p+1]>=140&&img.data[p+2]<140)n++;}
    if(n>=8)rows.push(y);
  }
  const groups:number[][]=[];
  for(const y of rows){const last=groups.at(-1);if(last&&y-last.at(-1)!<=6)last.push(y);else groups.push([y]);}
  for(const band of groups){
    const y=Math.max(0,band[0]-65),h=Math.min(img.height-y,band.at(-1)!-y+16);
    if(h<25)continue;
    let left=img.width,right=0;
    for(let yy=y;yy<y+h;yy++)for(let x=0;x<img.width;x++){const p=(yy*img.width+x)*4;if(img.data[p]>=230&&img.data[p+1]>=140&&img.data[p+2]<140){left=Math.min(left,x);right=Math.max(right,x);}}
    const r={x:Math.max(0,left-50),y,w:Math.min(img.width, right+60)-Math.max(0,left-50),h};
    if(r.w<30)continue;
    const read=readSevenSegment(cropPixels(img,r.x,r.y,r.w,r.h));
    if(read&&read.confidence>=0.85)return r;
  }
  return null;
}

export class RegionConfirmation {
  private previous:Rect|null=null;
  private count=0;
  observe(r:Rect|null):Rect|null{
    if(!r){this.previous=null;this.count=0;return null;}
    const p=this.previous;
    this.count=p&&Math.abs(r.x-p.x)<=4&&Math.abs(r.y-p.y)<=4&&Math.abs(r.w-p.w)<=4&&Math.abs(r.h-p.h)<=4?this.count+1:1;
    this.previous=r;
    return this.count>=3?r:null;
  }
  reset(){this.previous=null;this.count=0;}
}

/** 맨 아래 왼쪽에서 시작하는 황록색 경험치 막대만 찾는다. */
export function findExperienceBand(img:Pixels):Rect|null {
  const rows:number[]=[];
  for(let y=Math.max(0,img.height-22);y<img.height-1;y++){
    let run=0;
    for(let x=1;x<Math.min(img.width,200);x++){
      const p=(y*img.width+x)*4,r=img.data[p],g=img.data[p+1],b=img.data[p+2];
      if(r>=70&&g>=140&&g>=r*.95&&b<70)run++;else break;
    }
    if(run>=8)rows.push(y);
  }
  if(rows.length<2)return null;
  const y=rows[0];
  return {x:0,y,w:img.width,h:img.height-y};
}
