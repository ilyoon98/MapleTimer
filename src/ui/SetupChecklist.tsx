import { screenCapture } from "../capture/screenCapture";
import { favoritesRegion, stallRegion } from "../capture/detectionRegions";
import { regionValidFor } from "../capture/types";
import { digitStore, learnedDigitCount } from "../detect/digitLearner";
import { liveStore } from "../engine/engine";
import { preciseIcon, profileStore } from "../state/profile";

interface Step {
  done: boolean;
  text: string;
  hint?: string;
  optional?: boolean;
}

/** 처음 쓸 때 무엇이 준비됐고 무엇이 남았는지 한눈에 보여준다 */
export function SetupChecklist() {
  const p = profileStore.use((s) => s);
  const learned = digitStore.use((d) => learnedDigitCount(d));
  const live = liveStore.use(() => screenCapture.state === "live");
  const stale = liveStore.use((s) => s.captureStale);
  const black = liveStore.use((s) => s.captureBlack);
  const hidden = profileStore.use((s) => s.collapsed.checklist ?? false);
  const w = screenCapture.width,
    h = screenCapture.height;
  const ok = (key: keyof typeof p.regions) => live && regionValidFor(p.regions[key], w, h);

  const skillsOn = p.skills.filter((s) => s.enabled);
  const skillsReady = skillsOn.filter((s) => live && (preciseIcon(s)
    ? s.where !== 'favorites' || regionValidFor(favoritesRegion(p, w, h), w, h)
    : regionValidFor(p.regions[`skill:${s.id}`], w, h) && s.readyRef));
  const buffsOn = p.buffs.filter((b) => b.enabled);
  const onBar = buffsOn.filter((b) => !b.slot);

  const steps: Step[] = [
    {
      done: live && !stale && !black,
      text: live
        ? black
          ? "화면 공유: 화면이 검게 나와요"
          : stale
            ? "화면 공유: 화면이 멈춰 있어요"
            : `화면 공유 중 (${w}×${h})`
        : "화면 공유 시작",
      hint: !live
        ? "'메이플 연결'을 누르세요"
        : black
          ? "'다른 창 선택' → '전체 화면' 탭에서 모니터를 골라 주세요"
          : "게임 창이 최소화되면 화면이 멈춰요",
    },
    {
      done: skillsOn.length === 0 || skillsReady.length === skillsOn.length,
      text: `스킬 준비 ${skillsReady.length}/${skillsOn.length}`,
      hint: "즐겨찾기는 스킬 설정에서 좌측·우측 하단을 고르세요",
      optional: skillsOn.length === 0,
    },
    {
      done: learned === 10,
      text: learned === 10 ? "숫자 추가 학습 완료" : `숫자 추가 학습 ${learned}/10 (선택)`,
      hint: "게임 숫자 모양이 기본으로 들어 있어 학습 없이도 읽어요. 남은 시간을 읽는 버프가 끝날 때 자동으로 더 배워요",
      optional: true,
    },
    {
      done: !p.rune.enabled || ok("minimap"),
      text: p.rune.enabled ? (ok("minimap") ? "룬: 준비됨" : "미니맵을 자동으로 찾고 있어요 · 안 잡히면 직접 지정") : "룬 알림 꺼짐",
      hint: "사냥터에서 미니맵 안쪽만 선택",
      optional: !p.rune.enabled,
    },
    {
      done: !p.stall.enabled || (live && regionValidFor(stallRegion(p, w, h), w, h)),
      text: p.stall.enabled ? (p.stall.mode === 'exp' ? "경험치: 중앙 자동 감지 · 필요하면 높이 조정" : "사냥 멈춤: 영역 선택") : "사냥 멈춤 꺼짐",
      optional: !p.stall.enabled,
    },
    {
      // 정한 자리(버프 즐겨찾기 칸)를 쓰는 버프는 위쪽 버프칸이 없어도 된다
      done: buffsOn.length === 0 || ((onBar.length === 0 || ok("buffbar")) && buffsOn.every((b) => (b.template || b.icon) && (!b.slot || regionValidFor(b.slot, w, h)))),
      text:
        buffsOn.length === 0
          ? "버프칸 감지 항목 없음"
          : '버프 감지 위치를 확인해 주세요',
      optional: buffsOn.length === 0,
    },
    {
      done: !p.booster.enabled || live,
      text: p.booster.enabled ? (ok("booster") ? "부스터: 준비됨" : "부스터가 켜지면 자동으로 찾아요") : "부스터 알림 꺼짐",
      optional: !p.booster.enabled,
    },
  ];
  const remaining = steps.filter((s) => !s.done && !s.optional).length;
  const toggle = () => profileStore.set((s) => ({ ...s, collapsed: { ...s.collapsed, checklist: !hidden } }));

  return (
    <section className={`checklist ${remaining === 0 ? "checklist-done" : ""}`}>
      <header className="checklist-head" onClick={toggle}>
        <b>{remaining === 0 ? "✓ 설정 완료" : `연결 준비 · ${remaining}개 남음`}</b>
        <span className="spacer" />
        <span className="muted">{hidden ? "▸" : "▾"}</span>
      </header>
      {!hidden && (
        <ul className="checklist-items">
          {/* 해야 할 것만 보여 준다 (끝난 것·선택 항목은 숨겨서 짧게) */}
          {steps.filter((s) => !s.done && !s.optional).map((s) => (
            <li key={s.text} className={s.done ? "ck-done" : s.optional ? "ck-optional" : "ck-todo"} title={s.hint}>
              <span className="ck-mark">{s.done ? "✓" : s.optional ? "–" : "○"}</span>
              <span>{s.text}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
