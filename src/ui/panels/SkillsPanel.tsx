import { useState } from "react";
import { screenCapture } from "../../capture/screenCapture";
import { regionValidFor } from "../../capture/types";
import { segment } from "../../cv/digits";
import { makeReference } from "../../detect/quickslotCast";
import { liveStore } from "../../engine/engine";
import {
  SKILL_PRESETS,
  newSkill,
  preciseIcon,
  profileStore,
  setRegion,
  shortName,
  updateSkill,
  type SkillEntry,
} from "../../state/profile";
import { AlertSettings } from "../AlertSettings";
import { leadText } from "../../alerts/speech";
import { NumberInput, Panel, StatusDot, Toggle, fmtRemaining } from "../common";
import { gameIconUrl } from "../gameArt";
import { openPicker } from "../pickerStore";

const STATE_LABEL = { ready: "사용 가능", cooling: "쿨타임", unknown: "판별 불가" } as const;

export function SkillsPanel({ collapsed, onToggleCollapse }: { collapsed: boolean; onToggleCollapse: () => void }) {
  const skills = profileStore.use((p) => p.skills);
  const [addPreset, setAddPreset] = useState(SKILL_PRESETS[0].id);
  return (
    <Panel
      title="스킬 알림"
      icon={gameIconUrl("janus")}
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
      {skills.length === 0 && <div className="empty">등록된 스킬이 없어요.</div>}
      {skills.map((s) => (
        <SkillRow key={s.id} skill={s} />
      ))}
    </Panel>
  );
}

function SkillRow({ skill: s }: { skill: SkillEntry }) {
  const live = liveStore.use((l) => l.skills[s.id]);
  const now = liveStore.use((l) => l.now);
  const region = profileStore.use((p) => p.regions[`skill:${s.id}`]);
  const sharing = liveStore.use(() => screenCapture.state === "live");
  const regionOk = sharing && regionValidFor(region, screenCapture.width, screenCapture.height);
  const remaining = live?.expiresAt != null ? live.expiresAt - now : null;
  const preset = SKILL_PRESETS.find((x) => x.id === s.presetId);
  // (정밀): 퀵슬롯 대신 버프 아이콘의 남은 시간을 읽는다. 감지 위치만 고르면 된다
  const precise = !!preciseIcon(s);
  const onFavorites = s.where === "favorites";
  const favRegion = profileStore.use((p) => p.regions.favorites);
  const favOk = sharing && regionValidFor(favRegion, screenCapture.width, screenCapture.height);
  const pickFavorites = () =>
    openPicker({
      title: "버프 즐겨찾기 위치 선택",
      guide: [
        "게임에서 버프 즐겨찾기로 옮겨 둔 버프 칸들을 넉넉하게 선택하세요.",
        "이 위치는 '버프 즐겨찾기'로 감지하는 모든 정밀 스킬이 같이 써요.",
        "게임에서 즐겨찾기 위치를 옮기면 여기서도 '위치 변경'을 눌러 주세요.",
      ],
      initial: favRegion,
      onConfirm: ({ region }) => setRegion("favorites", region),
    });

  const pickRegion = () =>
    openPicker({
      title: `${shortName(s.name)} 퀵슬롯 칸 선택`,
      guide: ["오른쪽 아래 퀵슬롯에서 이 스킬 칸을 쿨타임 숫자까지 들어가게 선택하세요.", "스킬을 쓸 수 있는 상태(밝은 아이콘)에서 선택해 주세요."],
      initial: region,
      onConfirm: ({ region, pixels }) => {
        setRegion(`skill:${s.id}`, region);
        // 고른 칸의 모습을 항목 앞 아이콘으로도 쓴다 (사용자 화면의 실제 스킬 아이콘)
        const c = document.createElement("canvas");
        c.width = pixels.width;
        c.height = pixels.height;
        c.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(pixels.data), pixels.width, pixels.height), 0, 0);
        updateSkill(s.id, { readyRef: makeReference(pixels), iconUrl: c.toDataURL() });
        if (segment(pixels).glyphs.length > 0)
          alert("선택한 칸에 쿨타임 숫자가 보이는 것 같아요.\n스킬이 준비된(숫자 없는 밝은) 모습이 3초쯤 보이면 자동으로 다시 맞출게요.");
      },
    });

  const changePreset = (id: string) => {
    const p = SKILL_PRESETS.find((x) => x.id === id);
    if (p) updateSkill(s.id, { presetId: p.id, name: p.name, durationSec: p.durationSec, cooldownSec: p.cooldownSec });
  };

  let status: { tone: "ok" | "warn" | "alert" | "idle" | "info"; text: string };
  if (!s.enabled) status = { tone: "idle", text: "꺼짐" };
  else if (remaining != null && remaining <= s.leadSec * 1000) status = { tone: "alert", text: remaining > 0 ? "곧 종료" : "종료됨" };
  else if (remaining != null) status = { tone: "ok", text: "지속 중" };
  else if (!sharing) status = { tone: "warn", text: "화면 공유 필요" };
  else if (precise && onFavorites && !favOk) status = { tone: "warn", text: "즐겨찾기 위치 선택 필요" };
  else if (precise) status = { tone: "info", text: live?.iconState === "ready" ? "아이콘 찾음" : "감지 대기" };
  else if (!regionOk) status = { tone: "warn", text: "영역 선택 필요" };
  else status = { tone: "info", text: `감지 대기 · ${STATE_LABEL[live?.iconState ?? "unknown"]}` };

  return (
    <div className={`row ${s.enabled ? "" : "row-off"}`}>
      <div className="row-main">
        <Toggle checked={s.enabled} onChange={(v) => updateSkill(s.id, { enabled: v })} />
        <div className="row-title">
          <select value={s.presetId} onChange={(e) => changePreset(e.target.value)}>
            {SKILL_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div className="cell">
          <div className="cell-label">남은 시간</div>
          <div className={`cell-value big mono ${remaining != null && remaining <= s.leadSec * 1000 ? "urgent" : ""}`}>{fmtRemaining(remaining)}</div>
        </div>
        <StatusDot tone={status.tone}>{status.text}</StatusDot>
        <div className="row-buttons">
          {!precise && <button onClick={pickRegion}>{region ? "영역 다시 선택" : "영역 선택"}</button>}
          <button
            className="icon-btn danger"
            aria-label="삭제"
            title="삭제"
            onClick={() => {
              if (!confirm(`'${s.name}' 항목을 삭제할까요?`)) return;
              setRegion(`skill:${s.id}`, null);
              profileStore.set((p) => ({ ...p, skills: p.skills.filter((x) => x.id !== s.id) }));
            }}
          >
            🗑
          </button>
        </div>
      </div>
      <div className="row-sub">
        <AlertSettings
          value={s.alert}
          onChange={(alert) => updateSkill(s.id, { alert })}
          speech={leadText(shortName(s.name), s.leadSec)}
          lead={{ value: s.leadSec, onChange: (leadSec) => updateSkill(s.id, { leadSec }) }}
        />
        {precise && (
          <div className="field-row">
            <span className="field-label">감지 위치</span>
            <div className="seg">
              <button className={onFavorites ? "" : "on"} onClick={() => updateSkill(s.id, { where: "bar" })}>
                기본 버프칸
              </button>
              <button
                className={onFavorites ? "on" : ""}
                onClick={() => {
                  updateSkill(s.id, { where: "favorites" });
                  if (!favRegion) pickFavorites();
                }}
              >
                버프 즐겨찾기
              </button>
            </div>
            {onFavorites && <button onClick={pickFavorites}>{favRegion ? "위치 변경" : "위치 선택"}</button>}
          </div>
        )}
        {preset?.editable && (
          <div className="field-row">
            <span className="field-label">지속시간</span>
            <NumberInput value={s.durationSec} min={1} max={3600} suffix="초" onChange={(v) => updateSkill(s.id, { durationSec: v })} />
          </div>
        )}
      </div>
    </div>
  );
}
