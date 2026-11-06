import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import type { Pixels } from "../cv/image";
import { featureOf, fixturePasses, type EvidenceFixture } from "../dev/evidenceCheck";

// npm run evidence:check 가 '틀림'·'놓침' 표시한 알림 캡처를 여기에 쌓는다
const fixtures = Object.entries(import.meta.glob<EvidenceFixture>("./fixtures/evidence/*.json", { eager: true, import: "default" }));

const pixels = (f: EvidenceFixture): Pixels => ({
  width: f.width,
  height: f.height,
  data: new Uint8ClampedArray(inflateSync(Buffer.from(f.rgbaDeflate, "base64"))),
});

describe("실제 알림 캡처 회귀", () => {
  if (!fixtures.length) it("아직 모인 기록 없음", () => {});
  for (const [file, f] of fixtures) {
    const name = `${featureOf(f.key)} ${f.verdict === "wrong" ? "잘못 울림" : "놓침"} · ${f.label} (${file.split("/").pop()})`;
    if (!f.expected) {
      it.todo(`${name} — 정답(expected)을 채워 주세요`);
      continue;
    }
    // 아직 안 고친 기록은 '실패해야 통과'로 둔다. 고쳐서 통과하기 시작하면 이 테스트가 알려 주니 fixed: true 로 바꾼다
    (f.fixed ? it : it.fails)(name, () => {
      expect(fixturePasses(f, pixels(f))).toBe(true);
    });
  }
});
