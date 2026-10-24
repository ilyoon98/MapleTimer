import { useState } from "react";
import { storeTemplate, trimToIconBorder, type StoredTemplate } from "../../cv/match";
import { liveStore } from "../../engine/engine";
import { BUFF_PRESETS, newBuffPreset, profileStore, setRegion, updateBuff, type BuffEntry, type BuffPresetId } from "../../state/profile";
import { AlertSettings } from "../AlertSettings";
import { doneText, leadText } from "../../alerts/speech";
import { LeadSelect, NumberInput, Panel, StatusDot, Toggle, fmtRemaining } from "../common";
import { openPicker } from "../pickerStore";
import { BuffbarSteps } from "../guideArt";

function TemplateThumb({ t }: { t: StoredTemplate | null }) {
  if (!t) return <span className="thumb thumb-empty">?</span>;
  const c = document.createElement("canvas");
  c.width = t.width;
  c.height = t.height;
  c.getContext("2d")!.putImageData(new ImageData(Uint8ClampedArray.from(t.rgba), t.width, t.height), 0, 0);
  return <img className="thumb" src={c.toDataURL()} width={32} height={32} alt="" />;
}

/**
 * 원래 사이트처럼 두 칸으로 나눈다: '버프 종료 알림'(kind expiry)과 '특수 코어 알림'(kind cooldown).
 * 둘 다 같은 위쪽 버프칸 영역을 쓴다.
 */
export function BuffsPanel({ kind, collapsed, onToggleCollapse }: { kind: "expiry" | "cooldown"; collapsed: boolean; onToggleCollapse: () => void }) {
  const isCore = kind === "cooldown";
  const all = profileStore.use((p) => p.buffs);
  const buffs = all.filter((b) => b.kind === kind);
  const region = profileStore.use((p) => p.regions.buffbar);
  const add = (id: BuffPresetId) => profileStore.set((p) => ({ ...p, buffs: [...p.buffs, newBuffPreset(id)] }));
  // 아직 아무것도 등록 안 했으면 설정 방법을 펼쳐서 보여 준다
  const [howto, setHowto] = useState(!isCore && buffs.length === 0);

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
      title={isCore ? "특수 코어 알림" : "버프 종료 알림"}
      collapsed={collapsed}
      onToggleCollapse={onToggleCollapse}
      actions={
        <>
          {!isCore && <button onClick={() => setHowto(!howto)}>{howto ? "설정 방법 닫기" : "설정 방법"}</button>}
          <button onClick={pickRegion}>{region ? "버프칸 다시 선택" : "버프칸 선택"}</button>
          {BUFF_PRESETS.filter((bp) => (bp.id === "core") === isCore).map((bp) => (
            <button key={bp.id} onClick={() => add(bp.id)}>
              + 추가
            </button>
          ))}
        </>
      }
    >
      {howto ? (
        <div className="howto-card">
          <div className="howto-head">
            <b>버프 종료 알림 설정 방법</b>
            <button onClick={() => setHowto(false)}>닫기</button>
          </div>
          <BuffbarSteps />
        </div>
      ) : (
        <p className="panel-hint">
          {isCore
            ? "특수 코어가 발동해 버프칸에 아이콘이 뜨면 쿨타임을 세고, 다시 쓸 수 있을 때 알려요."
            : "오른쪽 위 버프칸에서 등록한 아이콘을 찾아 남은 시간을 읽고 끝나기 전에 알려요. 처음이면 '설정 방법'을 눌러 보세요."}
        </p>
      )}
      {buffs.length === 0 && (
        <div className="empty">
          {isCore ? "등록된 특수 코어가 없어요. 버프칸을 선택한 뒤 '+ 추가'를 눌러 주세요." : "등록된 버프가 없어요. 버프칸을 선택한 뒤 '+ 추가'를 눌러 주세요. 솔 야누스·에르다 파운틴은 스킬 알림의 (정밀)에서 골라요."}
        </div>
      )}
      {buffs.map((b) => (
        <BuffRow key={b.id} buff={b} hasRegion={!!region} />
      ))}
    </Panel>
  );
}

function BuffRow({ buff: b, hasRegion: hasBar }: { buff: BuffEntry; hasRegion: boolean }) {
  const live = liveStore.use((l) => l.buffs[b.id]);
  const now = liveStore.use((l) => l.now);
  const barRegion = profileStore.use((p) => p.regions.buffbar);
  // 정한 자리(버프 즐겨찾기 칸)가 있으면 그 자리만, 없으면 위쪽 버프칸에서 찾는다
  const region = b.slot ?? barRegion;
  const hasRegion = b.slot ? true : hasBar;
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

  const pickSlot = () =>
    openPicker({
      title: `'${b.name}' 자리 선택`,
      guide: [
        "버프 즐겨찾기로 옮겨 둔 칸을 선택하세요. 이 버프는 이제 그 자리만 확인해요 (빠르고 다른 아이콘과 헷갈리지 않아요).",
        "아이콘보다 조금 넉넉하게 잡아 주세요. 버프가 걸려 있을 때 잡으면 아이콘도 같이 등록돼요.",
        "게임에서 칸 위치를 바꾸면 여기서도 다시 선택해 주세요.",
      ],
      initial: b.slot ?? null,
      onConfirm: ({ region: slot, pixels }) => {
        // 아이콘이 보이는 채로 잡았으면(검은 테두리가 있으면) 아이콘이 없을 때 같이 등록
        const t = storeTemplate(pixels, true);
        const withIcon = !b.template && trimToIconBorder(t) !== t;
        updateBuff(b.id, withIcon ? { slot, template: t } : { slot });
      },
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
          <input className="name-input" value={b.name} aria-label="이름" onChange={(e) => updateBuff(b.id, { name: e.target.value })} />
          <div className="sub">{b.slot ? "버프 즐겨찾기 칸" : "위쪽 버프칸"}</div>
        </div>
        <div className="cell">
          <div className="cell-label">{isCore ? "숫자 세기" : "알림 시점"}</div>
          {isCore ? (
            <LeadSelect value={b.leadSec} options={[0, 3, 5, 10]} onChange={(leadSec) => updateBuff(b.id, { leadSec })} />
          ) : b.readTime || b.durationSec != null ? (
            <LeadSelect value={b.leadSec} onChange={(leadSec) => updateBuff(b.id, { leadSec })} />
          ) : (
            <div className="cell-value">사라지면</div>
          )}
        </div>
        <div className="cell">
          <div className="cell-label">{isCore ? "남은 쿨타임" : "남은 시간"}</div>
          <div className={`cell-value big mono ${remaining != null && remaining <= b.leadSec * 1000 ? "urgent" : ""}`}>
            {fmtRemaining(remaining != null ? Math.max(remaining, isCore ? 0 : remaining) : null)}
          </div>
        </div>
        <StatusDot tone={status.tone}>{status.text}</StatusDot>
        <div className="row-buttons">
          <button onClick={pickIcon} disabled={!hasRegion}>
            {b.template ? "아이콘 다시 등록" : "아이콘 등록"}
          </button>
          <button
            className="icon-btn danger"
            aria-label="삭제"
            title="삭제"
            onClick={() => {
              if (!confirm(`'${b.name}' 항목을 삭제할까요?`)) return;
              profileStore.set((p) => ({ ...p, buffs: p.buffs.filter((x) => x.id !== b.id) }));
            }}
          >
            🗑
          </button>
        </div>
      </div>
      <div className="row-sub">
        <AlertSettings
          value={b.alert}
          onChange={(alert) => updateBuff(b.id, { alert })}
          speech={isCore ? b.name : b.durationSec != null || b.readTime ? leadText(b.name, b.leadSec) : doneText(b.name)}
        />
        <div className="field-row">
          <span className="field-label">찾는 곳</span>
          <div className="seg">
            <button className={b.slot ? "" : "on"} onClick={() => updateBuff(b.id, { slot: null })}>
              위쪽 버프칸
            </button>
            <button className={b.slot ? "on" : ""} onClick={pickSlot}>
              버프 즐겨찾기 칸
            </button>
          </div>
          {b.slot && <button onClick={pickSlot}>자리 다시 선택</button>}
          {isCore ? (
            <>
              <span className="field-label">쿨타임</span>
              <NumberInput value={b.durationSec ?? 30} min={11} max={180} suffix="초" onChange={(v) => updateBuff(b.id, { durationSec: v })} />
              <Toggle checked={b.countdownVoice} onChange={(v) => updateBuff(b.id, { countdownVoice: v })} label="숫자 읽어주기" />
            </>
          ) : (
            <>
              <Toggle checked={b.readTime} onChange={(v) => updateBuff(b.id, { readTime: v })} label="남은 시간 읽기" />
              {!b.readTime && (
                <select
                  aria-label="지속시간"
                  value={b.durationSec ?? ""}
                  onChange={(e) => updateBuff(b.id, { durationSec: e.target.value ? Number(e.target.value) : null })}
                >
                  <option value="">지속시간 모름</option>
                  <option value={600}>10분</option>
                  <option value={1200}>20분</option>
                  <option value={1800}>30분</option>
                  <option value={3600}>1시간</option>
                  <option value={7200}>2시간</option>
                </select>
              )}
              <Toggle checked={b.alertOnDisappear} onChange={(v) => updateBuff(b.id, { alertOnDisappear: v })} label="사라지면 알림" />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
