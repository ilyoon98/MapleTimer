import { describe, expect, it } from "vitest";
import { analyze, formatReport, type EvidenceItem } from "./evidenceCheck";

const blank = { width: 20, height: 20, data: new Uint8ClampedArray(20 * 20 * 4).fill(30) };
const item = (over: Partial<EvidenceItem>): EvidenceItem => ({ id: String(Math.random()), at: 0, key: "rune", label: "룬", playIndex: 0, verdict: null, crop: blank, live: {}, ...over });

describe("알림 캡처 분석", () => {
  it("표시가 없어도 연달아 울림·검은 화면·다시 읽어도 없음을 의심으로 고른다", () => {
    const rows = analyze([item({ at: 0 }), item({ at: 5000 }), item({ at: 60000, live: { captureBlack: true } })]);
    expect(rows[0].suspicious).toEqual(["다시 읽으니 못 찾음"]);
    expect(rows[1].suspicious).toContain("5초 만에 또 울림");
    expect(rows[2].suspicious).toContain("검은 화면일 때 울림");
  });
  it("반복 재생(playIndex>0)은 연달아 울림으로 보지 않는다", () => {
    const rows = analyze([item({ at: 0 }), item({ at: 3000, playIndex: 1 })]);
    expect(rows[1].suspicious.some((s) => s.includes("또 울림"))).toBe(false);
  });
  it("룬 '틀림'은 지금 코드가 못 찾으면 고쳐진 것, 부스터 '틀림'은 정답 숫자 없이 판단하지 않는다", () => {
    const [rune, booster] = analyze([item({ verdict: "wrong" }), item({ key: "booster", label: "부스터", verdict: "wrong", at: 1 })]);
    expect(rune.stillWrong).toBe(false);
    expect(booster.stillWrong).toBeNull();
    expect(formatReport([rune, booster])).toContain("지금 코드로는 맞음");
  });
});

import { gameIcon } from "../cv/gameIcons";
import { defaultProfile } from "../state/profile";
import { recheck, setupFromProfile } from "./evidenceCheck";

/** 어두운 버프칸 가운데 게임 아이콘을 하나 그려 넣는다 */
function barWith(icon: "janus" | "fountain" | null) {
  const w = 220, h = 60, data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < data.length; i += 4) data.set([24, 26, 30, 255], i);
  if (icon) {
    const t = gameIcon(icon), px = Uint8ClampedArray.from(t.rgba);
    for (let y = 0; y < t.height; y++) data.set(px.subarray(y * t.width * 4, (y + 1) * t.width * 4), ((y + 12) * w + 90) * 4);
  }
  return { width: w, height: h, data };
}

describe("정밀 스킬 다시 읽기", () => {
  const p = defaultProfile();
  const setup = setupFromProfile(p);
  const janus = p.skills.find((s) => s.name.includes("야누스"))!, fountain = p.skills.find((s) => s.name.includes("파운틴"))!;
  it("설정의 정밀 스킬마다 프로그램에 든 아이콘으로 다시 찾는다", () => {
    expect(recheck(`buff:precise-${janus.id}`, barWith("janus"), setup)?.found).toBe(true);
    expect(recheck(`buff:precise-${fountain.id}`, barWith("fountain"), setup)?.found).toBe(true);
  });
  it("아이콘이 없거나 다른 스킬 아이콘이면 못 찾는다", () => {
    expect(recheck(`buff:precise-${janus.id}`, barWith(null), setup)?.found).toBe(false);
    expect(recheck(`buff:precise-${janus.id}`, barWith("fountain"), setup)?.found).toBe(false);
  });
});
