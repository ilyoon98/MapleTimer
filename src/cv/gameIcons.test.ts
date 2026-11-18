import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import fixture from "./fixtures/janus-ending.json?raw";
import smallFixture from "./fixtures/janus-small.json?raw";
import resolutionFixture from "./fixtures/janus-resolutions.json";
import { readBuffDigits } from "./digits";
import { compactBuffDigitTemplates, gameDigitTemplates } from "./gameDigits";
import { gameIconTemplates } from "./gameIcons";
import { toGray, type Pixels } from "./image";
import { findTemplate } from "./match";

const { samples } = JSON.parse(fixture) as { samples: Array<{ at: string; shown: string; width: number; height: number; rgbaDeflate: string }> };

function bestScore(img: Pixels) {
  const gray = toGray(img);
  let best = 0;
  for (const template of gameIconTemplates("janus")) {
    const m = findTemplate(img, gray, template, 1)[0];
    if (m && m.colorDist <= 60) best = Math.max(best, m.score);
  }
  return best;
}

describe("프로그램에 넣어 둔 야누스 아이콘", () => {
  it("작은 화면에 표시되는 32픽셀 아이콘과 남은 시간을 읽는다", () => {
    const { width, height, shown, rgbaDeflate } = JSON.parse(smallFixture);
    const img: Pixels = { width, height, data: new Uint8ClampedArray(inflateSync(Buffer.from(rgbaDeflate, "base64"))) };
    expect(bestScore(img)).toBeGreaterThanOrEqual(0.72);
    expect(readBuffDigits(img, gameDigitTemplates()).read?.text).toBe(shown);
  });

  for (const { resolution, width, height, shown, rgbaDeflate } of resolutionFixture.samples) {
    it(`캡처를 ${resolution.join("×")}로 바꿔도 남은 시간 ${shown}초를 읽는다`, () => {
      const img: Pixels = { width, height, data: new Uint8ClampedArray(inflateSync(Buffer.from(rgbaDeflate, "base64"))) };
      expect(bestScore(img)).toBeGreaterThanOrEqual(0.72);
      expect(readBuffDigits(img, gameDigitTemplates(), compactBuffDigitTemplates()).read?.text).toBe(shown);
    });
  }

  // 가운데 숫자 자리를 빼기 전에는 0.59·0.70 으로 기준(0.72) 아래라, 끝나기 직전에 아이콘을 놓쳤다
  for (const s of samples)
    it(`끝나기 직전 숫자 '${s.shown}' 가 크게 찍혀도 찾는다 (실제 캡처 ${s.at})`, () => {
      const img: Pixels = { width: s.width, height: s.height, data: new Uint8ClampedArray(inflateSync(Buffer.from(s.rgbaDeflate, "base64"))) };
      expect(bestScore(img)).toBeGreaterThanOrEqual(0.78);
    });
});
