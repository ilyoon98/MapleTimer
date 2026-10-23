import { describe, expect, it } from "vitest";
import { trimToIconBorder, type StoredTemplate } from "./match";

/** 배경(bg) 여백 안에 검은 테두리 아이콘(40×40)이 있는 템플릿 */
function iconWithMargin(margin: number, bg: number[]): StoredTemplate {
  const S = 40 + margin * 2;
  const rgba: number[] = [];
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const ix = x - margin,
        iy = y - margin;
      const inside = ix >= 0 && iy >= 0 && ix < 40 && iy < 40;
      const border = inside && (ix < 2 || iy < 2 || ix >= 38 || iy >= 38);
      rgba.push(...(border ? [10, 10, 15] : inside ? [120, 90, 160] : bg), 255);
    }
  return { width: S, height: S, rgba, ringOnly: true };
}

describe("아이콘 템플릿 여백 자르기", () => {
  it("여백 있게 잡은 아이콘은 검은 테두리까지만 남긴다 (맵이 바뀌어 배경색이 달라져도 비교가 흔들리지 않게)", () => {
    const t = trimToIconBorder(iconWithMargin(10, [90, 170, 230]));
    expect([t.width, t.height]).toEqual([40, 40]);
    expect(t.rgba.slice(0, 3)).toEqual([10, 10, 15]);
  });
  it("이미 딱 맞게 잡았거나 테두리를 못 찾으면 그대로 둔다", () => {
    const tight = iconWithMargin(0, [0, 0, 0]);
    expect(trimToIconBorder(tight)).toBe(tight);
    const plain: StoredTemplate = { width: 40, height: 40, rgba: new Array(40 * 40 * 4).fill(200), ringOnly: true };
    expect(trimToIconBorder(plain)).toBe(plain);
  });
});
