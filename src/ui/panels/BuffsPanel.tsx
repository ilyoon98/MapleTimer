import { useState } from "react";
import { storeTemplate, type StoredTemplate } from "../../cv/match";
import { segment } from "../../cv/digits";
import { debugCrops, liveStore } from "../../engine/engine";
import { teachDigits } from "../teachDigits";
import { BUFF_PRESETS, newBuffPreset, profileStore, setRegion, updateBuff, type BuffEntry, type BuffPresetId } from "../../state/profile";
import { AlertSettings } from "../AlertSettings";
import { DebugCrop, NumberInput, Panel, StatusDot, Toggle, fmtRemaining, leadLabel } from "../common";
import { openPicker } from "../pickerStore";

function TemplateThumb({ t }: { t: StoredTemplate | null }) {
  if (!t) return <span className="thumb thumb-empty">?</span>;
  const c = document.createElement("canvas");
  c.width = t.width;
  c.height = t.height;
  c.getContext("2d")!.putImageData(new ImageData(Uint8ClampedArray.from(t.rgba), t.width, t.height), 0, 0);
  return <img className="thumb" src={c.toDataURL()} width={32} height={32} alt="" />;
}

export function BuffsPanel({ collapsed, onToggleCollapse }: { collapsed: boolean; onToggleCollapse: () => void }) {
  const buffs = profileStore.use((p) => p.buffs);
  const region = profileStore.use((p) => p.regions.buffbar);
  const add = (id: BuffPresetId) => profileStore.set((p) => ({ ...p, buffs: [...p.buffs, newBuffPreset(id)] }));

  const pickRegion = () =>
    openPicker({
      title: "우상단 버프칸 영역 선택",
      guide: [
        "화면 오른쪽 위 버프 아이콘들이 뜨는 영역 전체를 넉넉하게 선택하세요.",
        "인게임 설정: UI 크기 [최적 비율], 퀵슬롯&버프 시간표시 [중앙, 크게], 버프 정렬 옵션 모두 켜기를 권장해요.",
      ],
      initial: region,
      onConfirm: ({ region }) => setRegion("buffbar", region),
    });

  return (
    <Panel
      title="버프칸 감지"
      badge={<span className="badge">버프 종료 · 특수 코어</span>}
      collapsed={collapsed}
      onToggleCollapse={onToggleCollapse}
      actions={
        <>
          <button onClick={pickRegion}>{region ? "버프칸 다시 선택" : "버프칸 선택"}</button>
          {BUFF_PRESETS.map((bp) => (
            <button key={bp.id} onClick={() => add(bp.id)}>
              {bp.label}
            </button>
          ))}
        </>
      }
    >
      <p className="panel-hint">
        버프칸에서 직접 고른 아이콘을 테두리 모양으로 찾아요. 아이콘 위 <b>남은 시간 숫자</b>를 읽어서 끝나기 전에 알려주고(정밀 감지 — 야누스
        자석펫 연장도 따라감), 숫자를 못 읽으면 <b>나타난 시점부터 지속시간</b>을 세거나 <b>사라질 때</b> 알려줘요. 숫자 읽기는 스킬 알림에서 숫자
        학습을 마친 뒤에 정확해져요.
      </p>
      {buffs.length === 0 && <div className="empty">등록된 항목이 없어요. 버프칸을 선택한 뒤 '+ 버프' 또는 '+ 특수 코어'를 눌러 주세요.</div>}
      {buffs.map((b) => (
        <BuffRow key={b.id} buff={b} hasRegion={!!region} />
      ))}
      {region && (
        <details className="diag-details">
          <summary>버프칸 진단 화면</summary>
          <DebugCrop cropKey="buffbar" maxWidth={640} />
        </details>
      )}
    </Panel>
  );
}

function BuffRow({ buff: b, hasRegion }: { buff: BuffEntry; hasRegion: boolean }) {
  const [open, setOpen] = useState(false);
  const live = liveStore.use((l) => l.buffs[b.id]);
  const now = liveStore.use((l) => l.now);
  const region = profileStore.use((p) => p.regions.buffbar);
  const remaining = live?.endsAt != null ? live.endsAt - now : null;
  const isCore = b.kind === "cooldown";

  const pickIcon = () =>
    openPicker({
      title: `'${b.name}' 아이콘 등록`,
      guide: [
        isCore
          ? "특수 코어가 발동해 버프칸에 아이콘이 떠 있을 때 열어 주세요. ('3초 후 가져오기' 활용)"
          : "이 버프가 걸려 있을 때 열어 주세요.",
        "버프칸에서 해당 아이콘 하나만 테두리에 딱 맞게 선택하세요.",
      ],
      within: region,
      onConfirm: ({ pixels }) => updateBuff(b.id, { template: storeTemplate(pixels, true) }),
    });

  let status: { tone: "ok" | "warn" | "alert" | "idle" | "info"; text: string };
  if (!b.enabled) status = { tone: "idle", text: "꺼짐" };
  else if (!live?.regionOk) status = { tone: "warn", text: hasRegion ? "화면 공유 필요" : "버프칸 선택 필요" };
  else if (!b.template) status = { tone: "warn", text: "아이콘 등록 필요" };
  else if (isCore && remaining != null && remaining > 0) status = { tone: remaining <= b.leadSec * 1000 ? "alert" : "ok", text: "쿨타임" };
  else if (isCore) status = { tone: "info", text: "사용 가능" };
  else if (live.present) status = { tone: "ok", text: "버프 있음" };
  else status = { tone: "info", text: "버프 없음" };

  return (
    <div className={`row ${b.enabled ? "" : "row-off"}`}>
      <div className="row-main">
        <Toggle checked={b.enabled} onChange={(v) => updateBuff(b.id, { enabled: v })} />
        <TemplateThumb t={b.template} />
        <div className="row-title">
          <div className="name">{b.name}</div>
          <div className="sub">{isCore ? `쿨타임 ${b.durationSec ?? "-"}초 · 카운트다운 ${b.leadSec}초 전부터` : b.durationSec ? `지속 ${Math.round(b.durationSec / 60)}분` : "사라지면 알림"}</div>
        </div>
        <div className="cell">
          <div className="cell-label">{isCore ? "남은 쿨타임" : "남은 시간"}</div>
          <div className={`cell-value big mono ${remaining != null && remaining <= b.leadSec * 1000 ? "urgent" : ""}`}>
            {fmtRemaining(remaining != null ? Math.max(remaining, isCore ? 0 : remaining) : null)}
          </div>
        </div>
        <div className="cell">
          <div className="cell-label">일치도</div>
          <div className="cell-value mono">{live?.score ? live.score.toFixed(2) : "--"}</div>
        </div>
        {b.readTime && !isCore && (
          <div className="cell">
            <div className="cell-label">읽은 숫자</div>
            <div className="cell-value mono">{live?.readText ?? "--"}</div>
          </div>
        )}
        <StatusDot tone={status.tone}>{status.text}</StatusDot>
        <div className="row-buttons">
          <button onClick={pickIcon} disabled={!hasRegion}>
            {b.template ? "아이콘 다시 등록" : "아이콘 등록"}
          </button>
          <button className="icon-btn" onClick={() => setOpen(!open)} aria-label="설정 펼치기">
            {open ? "▴" : "▾"}
          </button>
        </div>
      </div>
      {open && (
        <div className="row-detail">
          <div className="field-row">
            <span className="field-label">이름</span>
            <input value={b.name} onChange={(e) => updateBuff(b.id, { name: e.target.value })} />
          </div>
          {isCore ? (
            <div className="field-row">
              <span className="field-label">쿨타임</span>
              <NumberInput value={b.durationSec ?? 30} min={11} max={180} suffix="초" onChange={(v) => updateBuff(b.id, { durationSec: v })} />
              <span className="field-label">카운트다운</span>
              <NumberInput value={b.leadSec} min={0} max={10} suffix="초 전부터" onChange={(v) => updateBuff(b.id, { leadSec: v })} />
              <Toggle checked={b.countdownVoice} onChange={(v) => updateBuff(b.id, { countdownVoice: v })} label="숫자 읽어주기" />
            </div>
          ) : (
            <>
              <div className="field-row">
                <span className="field-label">지속시간</span>
                <select
                  value={b.durationSec ?? ""}
                  onChange={(e) => updateBuff(b.id, { durationSec: e.target.value ? Number(e.target.value) : null })}
                >
                  <option value="">모름 (사라질 때만 알림)</option>
                  <option value={600}>10분</option>
                  <option value={1200}>20분</option>
                  <option value={1800}>30분</option>
                  <option value={3600}>1시간</option>
                  <option value={7200}>2시간</option>
                </select>
                {b.durationSec != null && (
                  <>
                    <span className="field-label">알림 시점</span>
                    <NumberInput value={b.leadSec} min={-5} max={600} suffix="초 전" onChange={(v) => updateBuff(b.id, { leadSec: v })} />
                    <span className="muted">{leadLabel(b.leadSec)}</span>
                  </>
                )}
              </div>
              {b.readTime && (
                <div className="field-row">
                  <DebugCrop cropKey={`buff:${b.id}`} maxWidth={96} />
                  <button
                    title="자동 학습이 잘 안 될 때: 아이콘에 남은 시간 숫자가 보일 때 눌러서 직접 입력"
                    onClick={() => {
                      const img = debugCrops.get(`buff:${b.id}`);
                      teachDigits(img ? segment(img) : null, `'${b.name}' 아이콘`);
                    }}
                  >
                    숫자 직접 가르치기
                  </button>
                </div>
              )}
              <div className="field-row">
                <Toggle checked={b.readTime} onChange={(v) => updateBuff(b.id, { readTime: v })} label="아이콘의 남은 시간 숫자 읽기 (정밀)" />
                <Toggle checked={b.alertOnDisappear} onChange={(v) => updateBuff(b.id, { alertOnDisappear: v })} label="아이콘이 사라지면 알림" />
              </div>
              <p className="muted small">지속시간은 아이콘이 나타난 순간부터 셉니다. 켜기 전부터 걸려 있던 버프는 사라질 때만 알 수 있어요.</p>
            </>
          )}
          <div className="field-row">
            <span className="field-label">일치 기준</span>
            <NumberInput value={b.minScore} min={0.5} max={0.99} step={0.01} onChange={(v) => updateBuff(b.id, { minScore: v })} />
            <span className="muted">현재 일치도가 버프가 있을 때 이 값보다 높고, 없을 때 낮아야 해요.</span>
          </div>
          <AlertSettings value={b.alert} onChange={(alert) => updateBuff(b.id, { alert })} />
          <div className="field-row">
            <button
              className="danger"
              onClick={() => {
                if (!confirm(`'${b.name}' 항목을 삭제할까요?`)) return;
                profileStore.set((p) => ({ ...p, buffs: p.buffs.filter((x) => x.id !== b.id) }));
              }}
            >
              삭제
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
