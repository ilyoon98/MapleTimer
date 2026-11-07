import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import fixture from "./fixtures/janus-ending.json?raw";
import { gameIcon } from "./gameIcons";
import { toGray, type Pixels } from "./image";
import { findTemplate, prepareTemplate, scaleTemplate } from "./match";
import { ICON_SCALES } from "../engine/search/buffSearch";

const { samples } = JSON.parse(fixture) as { samples: Array<{ at: string; shown: string; width: number; height: number; rgbaDeflate: string }> };

function bestScore(img: Pixels) {
  const icon = gameIcon("janus");
  const gray = toGray(img);
  let best = 0;
  for (const k of ICON_SCALES) {
    const m = findTemplate(img, gray, prepareTemplate(k === 1 ? icon : scaleTemplate(icon, k)), 1)[0];
    if (m && m.colorDist <= 60) best = Math.max(best, m.score);
  }
  return best;
}

describe("프로그램에 넣어 둔 야누스 아이콘", () => {
  // 가운데 숫자 자리를 빼기 전에는 0.59·0.70 으로 기준(0.72) 아래라, 끝나기 직전에 아이콘을 놓쳤다
  for (const s of samples)
    it(`끝나기 직전 숫자 '${s.shown}' 가 크게 찍혀도 찾는다 (실제 캡처 ${s.at})`, () => {
      const img: Pixels = { width: s.width, height: s.height, data: new Uint8ClampedArray(inflateSync(Buffer.from(s.rgbaDeflate, "base64"))) };
      expect(bestScore(img)).toBeGreaterThanOrEqual(0.78);
    });
});
