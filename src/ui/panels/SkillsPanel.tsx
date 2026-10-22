import { useEffect, useMemo, useRef, useState } from "react";
import { screenCapture } from "../../capture/screenCapture";
import { regionValidFor } from "../../capture/types";
import { segment, staticBrightMask } from "../../cv/digits";
import { digitStore, learnedDigitCount } from "../../detect/digitLearner";
import { teachDigits } from "../teachDigits";
import { makeReference, referenceToPixels } from "../../detect/quickslotCast";
import { clearSkill, debugCrops, liveStore, manualSkillCast } from "../../engine/engine";
import {
  LEAD_MAX,
  LEAD_MIN,
  LEAD_MIN_INSTALL,
  SKILL_PRESETS,
  newSkill,
  profileStore,
  setRegion,
  shortName,
  updateSkill,
  type SkillEntry,
} from "../../state/profile";
import { AlertSettings } from "../AlertSettings";
import { DebugCrop, NumberInput, Panel, StatusDot, Toggle, fmtRemaining, leadLabel } from "../common";
import { openPicker } from "../pickerStore";

const STATE_LABEL = { ready: "사용 가능", cooling: "쿨타임", unknown: "판별 불가" } as const;

export function SkillsPanel({ collapsed, onToggleCollapse }: { collapsed: boolean; onToggleCollapse: () => void }) {
  const skills = profileStore.use((p) => p.skills);
  const [addPreset, setAddPreset] = useState(SKILL_PRESETS[0].id);
  return (
    <Panel
      title="스킬 알림"
      badge={<span className="badge">퀵슬롯 감지</span>}
      collapsed={collapsed}
      onToggleCollapse={onToggleCollapse}
      actions={
        <>
          <select value={addPreset} onChange={(e) => setAddPreset(e.target.value)}>
            {SKILL_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <button onClick={() => profileStore.set((s) => ({ ...s, skills: [...s.skills, newSkill(addPreset)] }))}>+ 추가</button>
        </>
      }
    >
      <p className="panel-hint">
        우하단 퀵슬롯의 스킬 아이콘을 <b>쿨타임 숫자까지 포함해서</b> 선택하면, 아이콘이 어두워지는 순간을 스킬 사용 시점으로 보고
        지속시간이 끝나기 전에 알려줘요. 영역은 <b>스킬을 쓸 수 있는 상태(밝은 아이콘)</b>일 때 선택해 주세요.
        <br />
        처음 한 번은 스킬을 쓰고 <b>숫자가 한 자리가 될 때까지</b> 두세요. 쿨타임 숫자 모양을 자동으로 배워서, 그다음부터는 숫자로도 사용 시점을
        맞춰요.
      </p>
      {skills.length === 0 && <div className="empty">등록된 스킬이 없어요.</div>}
      {skills.map((s) => (
        <SkillRow key={s.id} skill={s} />
      ))}
    </Panel>
  );
}

/** 저장된 '사용 가능' 기준 이미지(흑백)를 보여준다 */
function RefThumb({ skill: s }: { skill: SkillEntry }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const r = s.readyRef;
  useEffect(() => {
    const c = ref.current;
    if (!c || !r) return;
    c.width = r.width;
    c.height = r.height;
    const img = new ImageData(r.width, r.height);
    r.data.forEach((v, i) => img.data.set([v, v, v, 255], i * 4));
    c.getContext("2d")!.putImageData(img, 0, 0);
  }, [r]);
  const suspicious = useMemo(() => !!r && segment(referenceToPixels(r)).glyphs.length > 0, [r]);
  if (!r) return <div className="debug-empty">없음</div>;
  const scale = Math.max(1, Math.min(6, Math.floor(160 / r.width)));
  return (
    <>
      <canvas ref={ref} className="debug-crop" style={{ width: r.width * scale, height: r.height * scale }} />
      {suspicious && <div className="small warn-text">⚠ 숫자가 찍혀 있어요 (준비된 모습이 보이면 자동으로 다시 맞춰요)</div>}
    </>
  );
}

function SkillRow({ skill: s }: { skill: SkillEntry }) {
  const [open, setOpen] = useState(false);
  const live = liveStore.use((l) => l.skills[s.id]);
  const now = liveStore.use((l) => l.now);
  const region = profileStore.use((p) => p.regions[`skill:${s.id}`]);
  const sharing = liveStore.use(() => screenCapture.state === "live");
  const regionOk = sharing && regionValidFor(region, screenCapture.width, screenCapture.height);
  const remaining = live?.expiresAt != null ? live.expiresAt - now : null;
  const leadMin = s.presetId === "class-install" ? LEAD_MIN_INSTALL : LEAD_MIN;
  const learnedCount = digitStore.use((d) => learnedDigitCount(d));

  const pickRegion = () =>
    openPicker({
      title: `${shortName(s.name)} 퀵슬롯 아이콘 선택`,
      guide: [
        "우하단 퀵슬롯에서 이 스킬 아이콘을 쿨타임 숫자까지 들어가게 선택하세요.",
        "스킬을 쓸 수 있는 상태(밝은 아이콘)에서 선택해야 해요. 이 모습을 '사용 가능' 기준으로 저장합니다.",
        "노란색 스킬 아이콘은 판별이 불안정할 수 있어요.",
      ],
      initial: region,
      onConfirm: ({ region, pixels }) => {
        setRegion(`skill:${s.id}`, region);
        updateSkill(s.id, { readyRef: makeReference(pixels) });
        if (segment(pixels).glyphs.length > 0)
          alert(
            "선택한 아이콘에 쿨타임 숫자가 보이는 것 같아요.\n'사용 가능' 기준은 스킬이 준비된(숫자 없는 밝은) 모습이어야 해요.\n\n일단 저장해 두고, 스킬이 준비된 모습이 3초쯤 보이면 자동으로 다시 맞출게요.",
          );
      },
    });

  const saveReadyNow = () => {
    const img = debugCrops.get(`skill:${s.id}`);
    if (img) updateSkill(s.id, { readyRef: makeReference(img) });
  };

  let status: { tone: "ok" | "warn" | "alert" | "idle" | "info"; text: string };
  if (!s.enabled) status = { tone: "idle", text: "꺼짐" };
  else if (remaining != null && remaining <= s.leadSec * 1000) status = { tone: "alert", text: remaining > 0 ? "곧 종료" : "종료됨" };
  else if (remaining != null) status = { tone: "ok", text: "지속 중" };
  else if (!sharing) status = { tone: "warn", text: "화면 공유 필요" };
  else if (!regionOk) status = { tone: "warn", text: "영역 선택 필요" };
  else if (!s.readyRef) status = { tone: "warn", text: "기준 이미지 필요" };
  else status = { tone: "info", text: `대기 · ${STATE_LABEL[live?.iconState ?? "unknown"]}` };

  return (
    <div className={`row ${s.enabled ? "" : "row-off"}`}>
      <div className="row-main">
        <Toggle checked={s.enabled} onChange={(v) => updateSkill(s.id, { enabled: v })} />
        <div className="row-title">
          <div className="name">{s.name}</div>
          <div className="sub">
            지속 {s.durationSec}초 · 쿨 {s.cooldownSec}초
          </div>
        </div>
        <div className="cell">
          <div className="cell-label">알림 시점</div>
          <div className="cell-value">{leadLabel(s.leadSec)}</div>
        </div>
        <div className="cell">
          <div className="cell-label">남은 시간</div>
          <div className={`cell-value big mono ${remaining != null && remaining <= s.leadSec * 1000 ? "urgent" : ""}`}>
            {fmtRemaining(remaining)}
          </div>
        </div>
        <StatusDot tone={status.tone}>{status.text}</StatusDot>
        <div className="row-buttons">
          <button onClick={pickRegion}>{region ? "영역 다시 선택" : "영역 선택"}</button>
          <button title="지금 스킬을 썼다고 보고 타이머 시작" onClick={() => manualSkillCast(s.id)}>
            ▶ 수동 시작
          </button>
          <button className="icon-btn" onClick={() => setOpen(!open)} aria-label="설정 펼치기">
            {open ? "▴" : "▾"}
          </button>
        </div>
      </div>
      {open && (
        <div className="row-detail">
          <div className="detail-grid">
            <div>
              <div className="field-row">
                <span className="field-label">이름</span>
                <input value={s.name} onChange={(e) => updateSkill(s.id, { name: e.target.value })} />
              </div>
              <div className="field-row">
                <span className="field-label">지속시간</span>
                <NumberInput value={s.durationSec} min={1} max={3600} suffix="초" onChange={(v) => updateSkill(s.id, { durationSec: v })} />
                <span className="field-label">쿨타임</span>
                <NumberInput value={s.cooldownSec} min={1} max={3600} suffix="초" onChange={(v) => updateSkill(s.id, { cooldownSec: v })} />
              </div>
              <div className="field-row">
                <span className="field-label">알림 시점</span>
                <NumberInput value={s.leadSec} min={leadMin} max={LEAD_MAX} suffix="초 전" onChange={(v) => updateSkill(s.id, { leadSec: v })} />
                <span className="muted">음수면 종료 후 (예: -3 → 3초 후)</span>
              </div>
              <AlertSettings value={s.alert} onChange={(alert) => updateSkill(s.id, { alert })} />
              <div className="field-row">
                <button onClick={() => clearSkill(s.id)}>타이머 초기화</button>
                <button
                  className="danger"
                  onClick={() => {
                    if (!confirm(`'${s.name}' 항목을 삭제할까요?`)) return;
                    setRegion(`skill:${s.id}`, null);
                    profileStore.set((p) => ({ ...p, skills: p.skills.filter((x) => x.id !== s.id) }));
                  }}
                >
                  삭제
                </button>
              </div>
            </div>
            <div className="diag">
              <div className="diag-title">진단</div>
              <div className="diag-pair">
                <div>
                  <div className="muted small">지금 화면</div>
                  <DebugCrop cropKey={`skill:${s.id}`} maxWidth={160} />
                </div>
                <div>
                  <div className="muted small">'사용 가능' 기준</div>
                  <RefThumb skill={s} />
                </div>
              </div>
              <p className="muted small">
                기준 이미지는 쿨타임 숫자 없이 <b>밝은 아이콘</b>이어야 해요. 숫자가 찍혀 있으면 스킬이 준비됐을 때 아래 버튼으로 다시 저장하세요.
              </p>
              <div className="diag-values mono">
                <div>
                  상태: <b>{STATE_LABEL[live?.iconState ?? "unknown"]}</b>
                </div>
                <div>
                  쿨타임 숫자: <b>{live?.digitText ?? "--"}</b>
                  {live?.digitText && ` (일치 ${live.digitConf.toFixed(2)})`}
                </div>
                <div>
                  추가 학습: {learnedCount}/10 자리
                  {live?.learning ? ` · 관찰 중 (${live.learnObserved}개 값)` : ""}
                  {live?.learnMessage && !live.learning ? ` · 마지막: ${live.learnMessage}` : ""}
                </div>
                <div>
                  기준과 차이: {Number.isFinite(live?.diff) ? live!.diff.toFixed(1) : "--"} (≤ {s.options.readyMaxDiff} 이면 사용 가능)
                </div>
                <div>
                  밝기 비율: {Number.isFinite(live?.lumaRatio) ? live!.lumaRatio.toFixed(2) : "--"} (≤ {s.options.coolingLumaRatio} 이면 쿨타임)
                </div>
              </div>
              <div className="field-row">
                <button onClick={saveReadyNow} disabled={!regionOk}>
                  지금 모습을 '사용 가능' 기준으로 저장
                </button>
                <button
                  disabled={!regionOk}
                  title="자동 학습이 잘 안 될 때: 쿨타임 숫자가 보이는 순간 눌러서 직접 입력"
                  onClick={() => {
                    const img = debugCrops.get(`skill:${s.id}`);
                    const r = s.readyRef;
                    const staticMask = r && img && r.width === img.width && r.height === img.height ? staticBrightMask(r.data, r.width, r.height) : null;
                    teachDigits(img ? segment(img, undefined, staticMask) : null, "퀵슬롯");
                  }}
                >
                  숫자 직접 가르치기
                </button>
              </div>
              <div className="field-row">
                <span className="field-label">허용 차이</span>
                <NumberInput
                  value={s.options.readyMaxDiff}
                  min={2}
                  max={80}
                  onChange={(v) => updateSkill(s.id, { options: { ...s.options, readyMaxDiff: v } })}
                />
                <span className="field-label">어두움 비율</span>
                <NumberInput
                  value={s.options.coolingLumaRatio}
                  min={0.3}
                  max={0.98}
                  step={0.02}
                  onChange={(v) => updateSkill(s.id, { options: { ...s.options, coolingLumaRatio: v } })}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
