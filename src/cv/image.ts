// 화면 인식에 쓰는 기본 영상처리 함수들 (ImageData 와 같은 모양의 객체를 받는다)

export interface Pixels {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export interface Gray {
  data: Float32Array;
  width: number;
  height: number;
}

export function toGray(img: Pixels): Gray {
  const n = img.width * img.height;
  const out = new Float32Array(n);
  const d = img.data;
  for (let i = 0, p = 0; i < n; i++, p += 4) out[i] = 0.299 * d[p] + 0.587 * d[p + 1] + 0.114 * d[p + 2];
  return { data: out, width: img.width, height: img.height };
}

/** 두 영상의 평균 밝기 차이 (0~255). 크기가 다르면 Infinity */
export function meanAbsDiff(a: Gray, b: Gray): number {
  if (a.width !== b.width || a.height !== b.height) return Infinity;
  let s = 0;
  for (let i = 0; i < a.data.length; i++) s += Math.abs(a.data[i] - b.data[i]);
  return s / a.data.length;
}

/** 평균 밝기 */
export function meanLuma(g: Gray): number {
  let s = 0;
  for (let i = 0; i < g.data.length; i++) s += g.data[i];
  return g.data.length ? s / g.data.length : 0;
}

/** RGB(0~255) → HSV (h: 0~360, s,v: 0~1) */
export function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255,
    gn = g / 255,
    bn = b / 255;
  const max = Math.max(rn, gn, bn),
    min = Math.min(rn, gn, bn);
  const d = max - min;
  let h = 0;
  if (d > 0) {
    if (max === rn) h = 60 * (((gn - bn) / d) % 6);
    else if (max === gn) h = 60 * ((bn - rn) / d + 2);
    else h = 60 * ((rn - gn) / d + 4);
  }
  if (h < 0) h += 360;
  return [h, max === 0 ? 0 : d / max, max];
}

export interface Blob {
  x: number;
  y: number;
  w: number;
  h: number;
  area: number;
  cx: number;
  cy: number;
}

/** 이진 마스크(1=전경)에서 4-연결 덩어리를 찾는다 */
export function connectedComponents(mask: Uint8Array, width: number, height: number, minArea = 1): Blob[] {
  const seen = new Uint8Array(mask.length);
  const blobs: Blob[] = [];
  const stack: number[] = [];
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || seen[start]) continue;
    let minX = width,
      minY = height,
      maxX = -1,
      maxY = -1,
      area = 0,
      sx = 0,
      sy = 0;
    stack.push(start);
    seen[start] = 1;
    while (stack.length) {
      const i = stack.pop()!;
      const x = i % width,
        y = (i / width) | 0;
      area++;
      sx += x;
      sy += y;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (x > 0 && mask[i - 1] && !seen[i - 1]) (seen[i - 1] = 1), stack.push(i - 1);
      if (x < width - 1 && mask[i + 1] && !seen[i + 1]) (seen[i + 1] = 1), stack.push(i + 1);
      if (y > 0 && mask[i - width] && !seen[i - width]) (seen[i - width] = 1), stack.push(i - width);
      if (y < height - 1 && mask[i + width] && !seen[i + width]) (seen[i + width] = 1), stack.push(i + width);
    }
    if (area >= minArea)
      blobs.push({ x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1, area, cx: sx / area, cy: sy / area });
  }
  return blobs;
}

/**
 * 정규화 상호상관(NCC) 템플릿 매칭. 영상 전체를 훑어 가장 비슷한 위치와 점수(-1~1)를 돌려준다.
 * step 으로 거칠게 훑은 뒤 최고점 주변을 1픽셀 단위로 다시 본다.
 */
export function matchTemplate(img: Gray, tpl: Gray, step = 1): { x: number; y: number; score: number } {
  const best = { x: -1, y: -1, score: -Infinity };
  if (tpl.width > img.width || tpl.height > img.height) return best;
  const tn = tpl.width * tpl.height;
  let tMean = 0;
  for (let i = 0; i < tn; i++) tMean += tpl.data[i];
  tMean /= tn;
  let tVar = 0;
  for (let i = 0; i < tn; i++) tVar += (tpl.data[i] - tMean) ** 2;
  const tStd = Math.sqrt(tVar);

  const scoreAt = (ox: number, oy: number) => {
    let mean = 0;
    for (let y = 0; y < tpl.height; y++) {
      const row = (oy + y) * img.width + ox;
      for (let x = 0; x < tpl.width; x++) mean += img.data[row + x];
    }
    mean /= tn;
    let num = 0,
      v = 0;
    for (let y = 0; y < tpl.height; y++) {
      const row = (oy + y) * img.width + ox;
      const trow = y * tpl.width;
      for (let x = 0; x < tpl.width; x++) {
        const a = img.data[row + x] - mean;
        num += a * (tpl.data[trow + x] - tMean);
        v += a * a;
      }
    }
    const den = Math.sqrt(v) * tStd;
    return den < 1e-6 ? 0 : num / den;
  };

  const maxX = img.width - tpl.width,
    maxY = img.height - tpl.height;
  for (let y = 0; y <= maxY; y += step)
    for (let x = 0; x <= maxX; x += step) {
      const s = scoreAt(x, y);
      if (s > best.score) Object.assign(best, { x, y, score: s });
    }
  if (step > 1 && best.x >= 0) {
    const bx = best.x,
      by = best.y;
    for (let y = Math.max(0, by - step + 1); y <= Math.min(maxY, by + step - 1); y++)
      for (let x = Math.max(0, bx - step + 1); x <= Math.min(maxX, bx + step - 1); x++) {
        const s = scoreAt(x, y);
        if (s > best.score) Object.assign(best, { x, y, score: s });
      }
  }
  return best;
}

/** ImageData 일부를 잘라 새 Pixels 로 */
export function cropPixels(img: Pixels, x: number, y: number, w: number, h: number): Pixels {
  const out = new Uint8ClampedArray(w * h * 4);
  for (let row = 0; row < h; row++) {
    const src = ((y + row) * img.width + x) * 4;
    out.set(img.data.subarray(src, src + w * 4), row * w * 4);
  }
  return { data: out, width: w, height: h };
}
