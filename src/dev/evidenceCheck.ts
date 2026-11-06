/**
 * 알림 캡처 자동 분석 (개발용). 브라우저·DOM 없이 돈다:
 * scripts/evidence-check.mjs 가 진단 파일을 읽어 여기로 넘기고, 회귀 테스트(evidence.test.ts)도 같은 판정을 쓴다.
 */
import { readDigits, segment, type DigitTemplates } from "../cv/digits";
import { gameDigitTemplates } from "../cv/gameDigits";
import { gameIcon, type GameIconId } from "../cv/gameIcons";
import { cropPixels, toGray, type Pixels } from "../cv/image";
import { findTemplate, prepareTemplate, scaleTemplate, type StoredTemplate } from "../cv/match";
import { ICON_SCALES } from "../engine/search/buffSearch";
import { preciseIcon, type BuffEntry, type SkillEntry } from "../state/profile";
import { readSevenSegment } from "../cv/sevenSegment";
import { DEFAULT_RUNE_COLOR, detectRuneByColor, detectRuneByTemplate, type RuneColorRange } from "../detect/rune";

export type Verdict = "right" | "wrong" | "missed";

/** 진단 파일의 알림 캡처 한 건 (그림은 이미 풀어서 넘긴다) */
export interface EvidenceItem {
  id: string;
  at: number;
  key: string;
  label: string;
  playIndex: number;
  verdict: Verdict | null;
  crop: Pixels | null;
  live: Record<string, unknown> & { captureStale?: boolean; captureBlack?: boolean };
}

export interface RuneSetup { mode?: "template" | "color"; template?: StoredTemplate | null; templateMinScore?: number; color?: RuneColorRange }

/** 버프·정밀 스킬을 다시 찾는 데 필요한 것: 아이콘(프로그램에 든 게임 아이콘 또는 등록한 그림)과 기준 점수 */
export interface IconSetup { icon?: GameIconId; template?: StoredTemplate | null; minScore: number; readTime: boolean }

export interface LearnedDigitsData { sets?: Array<{ counts: number[]; sums: Array<number[] | null> }> }

/** 진단 파일의 설정·학습 숫자에서 다시 읽기에 쓸 것만 꺼낸다 */
export interface CheckSetup {
  rune?: RuneSetup;
  icons?: Record<string, IconSetup>;
  learnedDigits?: LearnedDigitsData;
}

/** 엔진(buffs.ts minScoreOf)과 같은 기준 */
export function setupFromProfile(profile: { rune?: RuneSetup; skills?: SkillEntry[]; buffs?: BuffEntry[] } | undefined, learnedDigits?: LearnedDigitsData): CheckSetup {
  const icons: Record<string, IconSetup> = {};
  for (const s of profile?.skills ?? []) {
    const icon = preciseIcon(s);
    if (icon) icons[`buff:precise-${s.id}`] = { icon, minScore: 0.72, readTime: true };
  }
  for (const b of profile?.buffs ?? []) {
    if (!b.icon && !b.template) continue;
    icons[`buff:${b.id}`] = { icon: b.icon, template: b.template, minScore: b.icon ? 0.72 : b.slot ? Math.min(b.minScore, 0.85) : b.minScore, readTime: !!b.readTime };
  }
  const r = profile?.rune;
  return { rune: r ? { mode: r.mode, template: r.template, templateMinScore: r.templateMinScore, color: r.color } : undefined, icons, learnedDigits };
}

function digitTemplates(learned?: LearnedDigitsData): DigitTemplates {
  const game = gameDigitTemplates();
  return Array.from({ length: 10 }, (_, d) => [
    ...(learned?.sets ?? []).filter((set) => set.counts?.[d] > 0 && set.sums?.[d]).map((set) => Float32Array.from(set.sums[d]!, (x) => x / set.counts[d])),
    ...game[d],
  ]);
}

/** 버프칸(또는 정한 자리)에서 아이콘을 찾고, 찾으면 그 위의 남은 시간 숫자를 읽는다 */
export function recheckIcon(crop: Pixels, setup: IconSetup, learned?: LearnedDigitsData) {
  const stored = setup.icon ? gameIcon(setup.icon) : setup.template ?? null;
  if (!stored) return { found: false, score: 0, text: null as string | null };
  const templates = setup.icon ? ICON_SCALES.map((k) => prepareTemplate(k === 1 ? stored : scaleTemplate(stored, k))) : [prepareTemplate(stored)];
  const gray = toGray(crop);
  let best: { x: number; y: number; score: number; colorDist: number; w: number; h: number } | null = null;
  for (const t of templates) {
    if (t.gray.width > crop.width || t.gray.height > crop.height) continue;
    const m = findTemplate(crop, gray, t, 1)[0];
    if (m && (!best || m.score > best.score)) best = { x: m.x, y: m.y, score: m.score, colorDist: m.colorDist, w: t.gray.width, h: t.gray.height };
  }
  const found = !!best && best.score >= setup.minScore && best.colorDist <= 60;
  let text: string | null = null;
  if (found && best && setup.readTime) {
    text = readDigits(segment(cropPixels(crop, best.x, best.y, best.w, best.h)), digitTemplates(learned))?.text ?? null;
  }
  return { found, score: best?.score ?? 0, text };
}

/** 지금 버전의 감지 코드로 다시 읽은 결과. 다시 읽을 수 없는 기능은 null */
export interface Recheck { feature: string; found: boolean; value: string | null }

export function featureOf(key: string) {
  if (key === "rune") return "룬";
  if (key === "booster") return "부스터";
  if (key === "stall") return "사냥 멈춤";
  if (key.startsWith("buff:precise-")) return "스킬(버프칸)";
  if (key.startsWith("buff:")) return "버프";
  if (key.startsWith("skill:")) return "스킬";
  if (key.startsWith("timer:")) return "일반 타이머";
  return key;
}

export function recheck(key: string, crop: Pixels | null, setup: CheckSetup = {}): Recheck | null {
  if (!crop) return null;
  const rune = setup.rune;
  const icon = setup.icons?.[key];
  if (icon) {
    const r = recheckIcon(crop, icon, setup.learnedDigits);
    // 값: 읽은 남은 시간 (숫자를 못 읽었으면 일치 점수)
    return { feature: featureOf(key), found: r.found, value: r.found ? (r.text ?? `일치 ${r.score.toFixed(2)}`) : null };
  }
  if (key === "rune") {
    let boxes = null;
    if (rune?.mode === "template" && rune.template) {
      try { boxes = detectRuneByTemplate(crop, prepareTemplate(rune.template), rune.templateMinScore ?? 0.8); } catch { boxes = null; }
    }
    boxes ??= detectRuneByColor(crop, { ...DEFAULT_RUNE_COLOR, ...rune?.color });
    return { feature: "룬", found: boxes.length > 0, value: boxes.length ? `${boxes.length}개` : null };
  }
  if (key === "booster") {
    const read = readSevenSegment(crop);
    return { feature: "부스터", found: read != null, value: read ? String(read.seconds) : null };
  }
  // 사냥 멈춤은 여러 장을 비교해야 하고, 퀵슬롯 스킬은 쿨타임이 도는 모습을 이어서 봐야 해서 한 장으로는 다시 읽지 않는다
  return null;
}

export interface Row {
  item: EvidenceItem;
  feature: string;
  check: Recheck | null;
  /** 표시가 없어도 이상해 보이는 이유 */
  suspicious: string[];
  /** 표시와 지금 코드의 판단이 다르면 (아직 안 고쳐짐) */
  stillWrong: boolean | null;
}

const REPEAT_MS = 15_000;

/** '있다/없다' 로 판단하는 기능 (룬, 남은 시간을 안 읽는 버프). 숫자를 읽는 기능의 '틀림'은 정답 숫자가 있어야 판단한다 */
function isPresenceKey(key: string, setup: CheckSetup) {
  if (key === "rune") return true;
  const icon = setup.icons?.[key];
  return !!icon && !icon.readTime;
}

export function analyze(items: EvidenceItem[], setup: CheckSetup = {}): Row[] {
  const sorted = [...items].sort((a, b) => a.at - b.at);
  const lastFirst = new Map<string, number>();
  return sorted.map((item) => {
    const check = recheck(item.key, item.crop, setup);
    const suspicious: string[] = [];
    if (item.live?.captureBlack) suspicious.push("검은 화면일 때 울림");
    if (item.live?.captureStale) suspicious.push("화면이 멈춘 채 울림");
    if (!item.crop && item.key !== "stall" && !item.key.startsWith("timer:")) suspicious.push("감지 영역 그림이 없음");
    if (item.verdict !== "missed" && item.playIndex === 0) {
      const prev = lastFirst.get(item.key);
      if (prev != null && item.at - prev < REPEAT_MS) suspicious.push(`${Math.round((item.at - prev) / 1000)}초 만에 또 울림`);
      lastFirst.set(item.key, item.at);
    }
    if (!item.verdict && check && !check.found) suspicious.push("다시 읽으니 못 찾음");
    let stillWrong: boolean | null = null;
    if (check && item.verdict) {
      // 잘못 울림 → 지금 코드도 찾으면 아직 틀림 / 놓침·맞음 → 지금 코드가 못 찾으면 아직 틀림
      // 부스터 '틀림'은 숫자를 잘못 읽은 것이라, 찾았는지만으로는 판단할 수 없다 (정답 숫자가 필요)
      stillWrong = item.verdict === "wrong" ? (isPresenceKey(item.key, setup) ? check.found : null) : !check.found;
    }
    return { item, feature: featureOf(item.key), check, suspicious, stillWrong };
  });
}

const VERDICT_TEXT: Record<Verdict, string> = { right: "맞음", wrong: "틀림", missed: "놓침" };

export function formatReport(rows: Row[]): string {
  const lines: string[] = [];
  const byFeature = new Map<string, Row[]>();
  for (const r of rows) byFeature.set(r.feature, [...(byFeature.get(r.feature) ?? []), r]);
  lines.push(`알림 캡처 ${rows.length}건`);
  lines.push("");
  lines.push("기능별");
  for (const [feature, list] of byFeature) {
    const count = (v: Verdict) => list.filter((r) => r.item.verdict === v).length;
    const open = list.filter((r) => r.stillWrong).length;
    const sus = list.filter((r) => !r.item.verdict && r.suspicious.length).length;
    const parts = [`${list.length}건`, `맞음 ${count("right")}`, `틀림 ${count("wrong")}`, `놓침 ${count("missed")}`, `표시 안 함 ${list.filter((r) => !r.item.verdict).length}`];
    if (open) parts.push(`지금 코드로도 아직 틀림 ${open}`);
    if (sus) parts.push(`의심 ${sus}`);
    lines.push(`  ${feature}: ${parts.join(" · ")}`);
  }
  const show = (title: string, list: Row[]) => {
    if (!list.length) return;
    lines.push("");
    lines.push(title);
    for (const r of list) {
      const t = new Date(r.item.at).toLocaleString("ko-KR", { hour12: false });
      const v = r.item.verdict ? VERDICT_TEXT[r.item.verdict] : "표시 없음";
      const c = r.check ? `다시 읽기: ${r.check.found ? `찾음${r.check.value ? ` (${r.check.value})` : ""}` : "못 찾음"}` : "다시 읽기: 안 됨";
      const s = r.suspicious.length ? ` · ${r.suspicious.join(", ")}` : "";
      const now = r.stillWrong === true ? " → 아직 틀림" : r.stillWrong === false ? " → 지금 코드로는 맞음" : "";
      lines.push(`  ${t} ${r.item.label} [${v}] ${c}${s}${now}`);
    }
  };
  show("고칠 것 (틀림·놓침)", rows.filter((r) => r.item.verdict === "wrong" || r.item.verdict === "missed"));
  show("의심 (표시 없음)", rows.filter((r) => !r.item.verdict && r.suspicious.length));
  return lines.join("\n");
}

/* ───────── 회귀 테스트용 기록 ───────── */

export interface EvidenceFixture {
  id: string;
  key: string;
  label: string;
  at: number;
  verdict: Verdict;
  width: number;
  height: number;
  /** RGBA 를 deflate 한 뒤 base64 */
  rgbaDeflate: string;
  setup?: CheckSetup;
  /**
   * 정답. 룬은 자동으로 채운다 (틀림 → 없어야 함, 놓침 → 있어야 함).
   * 숫자를 읽는 기능(부스터·정밀 스킬·남은 시간 읽는 버프)의 '틀림'은 실제 숫자를 사람이 채워야 한다 (null 이면 테스트를 건너뛴다).
   */
  expected: { found?: boolean; value?: string } | null;
  /** 감지 코드를 고쳐 이 기록이 통과하면 true 로 바꾼다. false 면 '아직 틀림' 으로 둔다 */
  fixed: boolean;
}

export function expectedFor(key: string, verdict: Verdict, setup: CheckSetup = {}): EvidenceFixture["expected"] {
  if (verdict === "right") return null;
  if (verdict === "missed") return recheckable(key, setup) ? { found: true } : null;
  return isPresenceKey(key, setup) ? { found: false } : null;
}

export const recheckable = (key: string, setup: CheckSetup = {}) => key === "rune" || key === "booster" || !!setup.icons?.[key];

/** 기록 파일에는 그 기능에 필요한 설정만 담는다 */
export function setupFor(key: string, setup: CheckSetup): CheckSetup {
  if (key === "rune") return { rune: setup.rune };
  const icon = setup.icons?.[key];
  return icon ? { icons: { [key]: icon }, learnedDigits: icon.readTime ? setup.learnedDigits : undefined } : {};
}

/** 기록이 정답대로 나오는지: true 통과 / false 실패 / null 판단 불가 */
export function fixturePasses(f: EvidenceFixture, crop: Pixels): boolean | null {
  if (!f.expected) return null;
  const c = recheck(f.key, crop, f.setup);
  if (!c) return null;
  if (f.expected.found != null && c.found !== f.expected.found) return false;
  if (f.expected.value != null && c.value !== f.expected.value) return false;
  return true;
}
