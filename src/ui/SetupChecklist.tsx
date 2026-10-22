import { screenCapture } from "../capture/screenCapture";
import { regionValidFor } from "../capture/types";
import { digitStore, learnedDigitCount } from "../detect/digitLearner";
import { liveStore } from "../engine/engine";
import { profileStore } from "../state/profile";

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
  const skillsReady = skillsOn.filter((s) => live && regionValidFor(p.regions[`skill:${s.id}`], w, h) && s.readyRef);
  const buffsOn = p.buffs.filter((b) => b.enabled);

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
        ? "오른쪽 위 '화면 공유 시작' → 메이플스토리 창 선택"
        : black
          ? "'다른 창 선택' → '전체 화면' 탭에서 모니터를 골라 주세요"
          : "게임 창이 최소화되면 화면이 멈춰요",
    },
    {
      done: skillsOn.length === 0 || skillsReady.length === skillsOn.length,
      text: `스킬 퀵슬롯 영역 ${skillsReady.length}/${skillsOn.length}`,
      hint: "각 스킬의 '영역 선택'을 스킬이 준비된 상태에서",
      optional: skillsOn.length === 0,
    },
    {
      done: learned === 10,
      text: `숫자 학습 ${learned}/10`,
      hint: "쿨 10초 이상 스킬을 한 번 쓰고 숫자가 한 자리가 될 때까지 기다리기",
    },
    {
      done: !p.rune.enabled || ok("minimap"),
      text: p.rune.enabled ? (ok("minimap") ? "룬: 미니맵 선택됨" : "룬: 미니맵 영역 선택") : "룬 알림 꺼짐",
      hint: "사냥터에서 미니맵 안쪽만 선택, 룬이 떴을 때 '룬 아이콘 등록' 하면 더 정확",
      optional: !p.rune.enabled,
    },
    {
      done: !p.stall.enabled || ok("stall"),
      text: p.stall.enabled ? (ok("stall") ? "사냥 멈춤: 영역 선택됨" : "사냥 멈춤: 영역 선택") : "사냥 멈춤 꺼짐",
      optional: !p.stall.enabled,
    },
    {
      done: buffsOn.length === 0 || (ok("buffbar") && buffsOn.every((b) => b.template)),
      text:
        buffsOn.length === 0
          ? "버프칸 감지 항목 없음"
          : `버프칸: ${ok("buffbar") ? "선택됨" : "영역 선택"} · 아이콘 ${buffsOn.filter((b) => b.template).length}/${buffsOn.length}`,
      optional: buffsOn.length === 0,
    },
    {
      done: !p.booster.enabled || ok("booster"),
      text: p.booster.enabled ? (ok("booster") ? "부스터: 영역 선택됨" : "부스터: 타이머 영역 선택") : "부스터 알림 꺼짐",
      optional: !p.booster.enabled,
    },
  ];
  const remaining = steps.filter((s) => !s.done && !s.optional).length;
  const toggle = () => profileStore.set((s) => ({ ...s, collapsed: { ...s.collapsed, checklist: !hidden } }));

  return (
    <section className={`checklist ${remaining === 0 ? "checklist-done" : ""}`}>
      <header className="checklist-head" onClick={toggle}>
        <b>{remaining === 0 ? "✓ 준비 완료" : `준비 체크리스트 · ${remaining}개 남음`}</b>
        <span className="muted small">인게임: UI 크기 [최적 비율] · 시간표시 [중앙, 크게] · [분 + 초] · 버프 정렬 모두 켜기</span>
        <span className="spacer" />
        <span className="muted">{hidden ? "▸" : "▾"}</span>
      </header>
      {!hidden && (
        <ul className="checklist-items">
          {steps.map((s) => (
            <li key={s.text} className={s.done ? "ck-done" : s.optional ? "ck-optional" : "ck-todo"}>
              <span className="ck-mark">{s.done ? "✓" : s.optional ? "–" : "○"}</span>
              <span>{s.text}</span>
              {!s.done && s.hint && <span className="muted small"> — {s.hint}</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
