import { useEffect, useState } from "react";
import { audioEngine } from "../alerts/audio";
import { screenCapture } from "../capture/screenCapture";
import { clipSnapshot, liveStore } from "../engine/engine";
import { deleteCustomSound, listCustomSounds, putCustomSound, type CustomSound } from "../alerts/customSounds";
import { digitStore, importLearnedDigits, learnedDigitCount, resetLearnedDigits } from "../detect/digitLearner";
import {
  PIP_ALERT_COLORS,
  type PipAlertColor,
  PIP_EMPHASIS,
  PIP_ITEMS,
  PIP_SIZES,
  defaultProfile,
  migrate,
  profileStore,
  uid,
  type PipEmphasis,
  type PipSize,
  type ThemeMode,
} from "../state/profile";
import { deletePreset, loadPreset, presetStore, savePreset } from "../state/presets";
import { refreshCustomSounds } from "./AlertSettings";
import { Toggle } from "./common";

export function useEscape(onClose: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
}

export function SettingsModal({ onClose }: { onClose: () => void }) {
  useEscape(onClose);
  const theme = profileStore.use((p) => p.theme);
  const alertOnShareEnd = profileStore.use((p) => p.alertOnShareEnd);
  const learned = digitStore.use((d) => learnedDigitCount(d));
  const pipSize = profileStore.use((p) => p.pipSize);
  const pipShow = profileStore.use((p) => p.pipShow);
  const randomDelay = profileStore.use((p) => p.randomDelay);
  const pipAlertColor = profileStore.use((p) => p.pipAlertColor);
  const pipBackground = profileStore.use((p) => p.pipBackground);
  const pipEmphasis = profileStore.use((p) => p.pipEmphasis);
  const perf = liveStore.use((s) => s.perf);
  const presets = presetStore.use((s) => s.presets);
  const [presetName, setPresetName] = useState("");
  const ttsVoice = profileStore.use((p) => p.ttsVoice);
  const ttsRate = profileStore.use((p) => p.ttsRate);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  useEffect(() => {
    if (!("speechSynthesis" in window)) return;
    const load = () => setVoices(speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith("ko")));
    load();
    speechSynthesis.addEventListener("voiceschanged", load);
    return () => speechSynthesis.removeEventListener("voiceschanged", load);
  }, []);
  const [sounds, setSounds] = useState<CustomSound[]>([]);
  const reload = async () => {
    setSounds(await listCustomSounds());
    await refreshCustomSounds();
  };
  useEffect(() => {
    void reload();
  }, []);

  const addSound = async (files: FileList | null) => {
    if (!files) return;
    for (const f of Array.from(files)) {
      if (f.size > 5 * 1024 * 1024) {
        alert(`${f.name}: 5MB 이하 파일만 넣을 수 있어요.`);
        continue;
      }
      await putCustomSound({ id: uid(), name: f.name.replace(/\.[^.]+$/, ""), blob: f });
    }
    await reload();
  };

  /** 지금 화면 + 설정(영역) + 학습 숫자 + 감지 상태를 파일 하나로 저장 (기준값 조정용) */
  const exportDiagnostics = () => {
    const frame = screenCapture.snapshot();
    const live = liveStore.get();
    const data = {
      kind: "maple-timer-diagnostics",
      savedAt: new Date().toISOString(),
      userAgent: navigator.userAgent,
      capture: { state: screenCapture.state, width: screenCapture.width, height: screenCapture.height },
      profile: profileStore.get(),
      learnedDigits: digitStore.get(),
      live: {
        skills: live.skills,
        rune: live.rune,
        stall: live.stall,
        buffs: live.buffs,
        booster: live.booster,
        log: live.log,
        perf: live.perf,
        captureStale: live.captureStale,
        captureBlack: live.captureBlack,
        screenTransition: live.screenTransition,
      },
      framePng: frame ? frame.toDataURL("image/png") : null,
      // 최근 30초 동안 선택한 영역만 0.25초마다 (개발 모드에서 재생해 문제를 그대로 재현)
      clip: clipSnapshot(profileStore.get()),
    };
    const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    const d = new Date();
    const p2 = (n: number) => String(n).padStart(2, "0");
    a.download = `maple-diagnostics-${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  const exportProfile = () => {
    // 설정 + 학습한 숫자 모양을 함께 내보낸다 (다른 컴퓨터에서 바로 쓰기)
    const data = { ...profileStore.get(), learnedDigits: digitStore.get() };
    const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `maple-timer-settings-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const importProfile = async (files: FileList | null) => {
    const f = files?.[0];
    if (!f) return;
    try {
      const { learnedDigits, ...data } = JSON.parse(await f.text());
      if (data?.v !== 1) throw new Error("형식이 달라요");
      profileStore.set(() => migrate(data));
      const withDigits = importLearnedDigits(learnedDigits);
      alert(withDigits ? "설정과 학습한 숫자를 불러왔어요." : "설정을 불러왔어요.");
    } catch (e) {
      alert(`불러오기 실패: ${(e as Error).message}`);
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <header className="modal-head">
          <h3>설정</h3>
          <button className="icon-btn" onClick={onClose} aria-label="닫기">
            ✕
          </button>
        </header>
        <section className="modal-section">
          <h4>일반</h4>
          <div className="field-row">
            <span className="field-label">테마</span>
            <select value={theme} onChange={(e) => profileStore.set({ theme: e.target.value as ThemeMode })}>
              <option value="system">시스템 설정 따르기</option>
              <option value="light">밝게</option>
              <option value="dark">어둡게</option>
            </select>
          </div>
          <div className="field-row">
            <span className="field-label">읽어주는 목소리</span>
            <select value={ttsVoice ?? ""} onChange={(e) => profileStore.set({ ttsVoice: e.target.value || null })}>
              <option value="">자동 (크게 들리는 목소리 먼저)</option>
              {voices.map((v) => (
                <option key={v.voiceURI} value={v.voiceURI}>
                  {v.name} {v.localService ? "" : "(온라인)"}
                </option>
              ))}
            </select>
            <span className="field-label">속도</span>
            <input
              type="range"
              min={0.7}
              max={1.8}
              step={0.1}
              value={ttsRate}
              onChange={(e) => profileStore.set({ ttsRate: Number(e.target.value) })}
            />
            <span className="mono">{ttsRate.toFixed(1)}×</span>
            <button
              onClick={() => {
                audioEngine.ttsVoiceURI = ttsVoice;
                audioEngine.ttsRate = ttsRate;
                void audioEngine.play({ kind: "tts", text: "룬이 나타났어요" });
              }}
            >
              들어보기
            </button>
          </div>
          {voices.length === 0 && <p className="muted small">한국어 목소리를 찾지 못했어요. Windows 설정 &gt; 시간 및 언어 &gt; 음성에서 한국어 음성을 추가할 수 있어요.</p>}
          <div className="field-row">
            <span className="field-label">PIP 크기</span>
            <select value={pipSize} onChange={(e) => profileStore.set({ pipSize: e.target.value as PipSize })}>
              {(Object.keys(PIP_SIZES) as PipSize[]).map((k) => (
                <option key={k} value={k}>
                  {PIP_SIZES[k].label} ({PIP_SIZES[k].width}×{PIP_SIZES[k].height})
                </option>
              ))}
            </select>
            <span className="muted small">다음에 PIP 를 열 때 적용돼요</span>
          </div>
          <div className="field-row">
            <span className="field-label">PIP 표시</span>
            {PIP_ITEMS.map((it) => (
              <Toggle
                key={it.id}
                checked={pipShow[it.id]}
                onChange={(v) => profileStore.set((p) => ({ ...p, pipShow: { ...p.pipShow, [it.id]: v } }))}
                label={it.label}
              />
            ))}
          </div>
          <div className="field-row">
            <span className="field-label">PIP 강조</span>
            <select value={pipEmphasis} onChange={(e) => profileStore.set({ pipEmphasis: e.target.value as PipEmphasis })}>
              {(Object.keys(PIP_EMPHASIS) as PipEmphasis[]).map((k) => (
                <option key={k} value={k}>
                  {PIP_EMPHASIS[k]}
                </option>
              ))}
            </select>
            <span className="muted small">알림이 울릴 때 PIP 창 모양</span>
          </div>
          <div className="field-row">
            <span className="field-label">PIP 알림색</span>
            {(Object.keys(PIP_ALERT_COLORS) as PipAlertColor[]).map((k) => {
              const c = PIP_ALERT_COLORS[k];
              return (
                <button
                  key={k}
                  className={`color-chip ${pipAlertColor === k ? "color-chip-on" : ""}`}
                  style={{ "--chip": c.color ?? "var(--alert)" } as React.CSSProperties}
                  aria-pressed={pipAlertColor === k}
                  onClick={() => profileStore.set({ pipAlertColor: k })}
                >
                  {c.label}
                </button>
              );
            })}
          </div>
          <div className="field-row">
            <Toggle
              checked={pipBackground}
              onChange={(v) => profileStore.set({ pipBackground: v })}
              label="PIP 배경에 공유 중인 게임 화면 깔기 (화면을 공유하면 보여요)"
            />
          </div>
          <div className="field-row">
            <Toggle checked={randomDelay} onChange={(v) => profileStore.set({ randomDelay: v })} label="랜덤 지연: 첫 알림을 0~2초 사이로 무작위로 늦추기" />
          </div>
          <div className="field-row">
            <Toggle
              checked={alertOnShareEnd}
              onChange={(v) => profileStore.set({ alertOnShareEnd: v })}
              label="화면 공유가 끊기면 음성으로 알려주기 (게임 창이 닫히거나 최소화로 끊긴 경우)"
            />
          </div>
        </section>
        <section className="modal-section">
          <h4>숫자 학습</h4>
          <p className="muted small">
            실제 게임에서 모은 숫자 모양이 기본으로 들어 있어서 학습 없이도 쿨타임·버프 숫자를 읽어요. 그래도 자꾸 못 읽으면, 쿨타임 10초 이상인
            스킬을 한 번 쓴 뒤 숫자가 한 자리(9 이하)가 될 때까지 두세요. 이 PC 화면의 숫자 모양을 자동으로 더 배워요. 해상도나 UI 크기를
            바꿨다면 초기화 후 다시 배우세요.
          </p>
          <div className="field-row">
            <span>
              학습한 숫자: <b>{learned}/10</b>
            </span>
            <button className="danger" onClick={() => confirm("학습한 숫자 모양을 지울까요?") && resetLearnedDigits()}>
              숫자 학습 초기화
            </button>
          </div>
        </section>
        <section className="modal-section">
          <h4>내 소리 파일</h4>
          <p className="muted small">mp3 · m4a · wav · ogg (5MB 이하). 이 브라우저에만 저장돼요. 30초가 넘는 부분은 잘려서 재생돼요.</p>
          <ul className="sound-list">
            {sounds.map((s) => (
              <li key={s.id}>
                <span className="grow">{s.name}</span>
                <button onClick={() => audioEngine.play({ kind: "custom", soundId: s.id })}>▶</button>
                <button
                  className="danger"
                  onClick={async () => {
                    await deleteCustomSound(s.id);
                    audioEngine.forget(s.id);
                    await reload();
                  }}
                >
                  삭제
                </button>
              </li>
            ))}
            {sounds.length === 0 && <li className="muted">아직 없어요</li>}
          </ul>
          <label className="file-btn">
            소리 파일 추가
            <input type="file" accept="audio/*" multiple onChange={(e) => addSound(e.target.files)} />
          </label>
        </section>
        <section className="modal-section">
          <h4>프리셋 (사냥용 / 보스용 등)</h4>
          <p className="muted small">지금 설정(영역·알림·등록한 아이콘 포함)을 이름 붙여 저장하고, 상황에 맞게 바꿔 쓸 수 있어요.</p>
          <div className="field-row">
            <input value={presetName} onChange={(e) => setPresetName(e.target.value)} placeholder="예: 사냥, 보스" />
            <button
              onClick={() => {
                savePreset(presetName);
                setPresetName("");
              }}
            >
              지금 설정 저장
            </button>
          </div>
          <ul className="sound-list">
            {presets.map((pr) => (
              <li key={pr.id}>
                <span className="grow">
                  {pr.name} <span className="muted small">({new Date(pr.savedAt).toLocaleString()})</span>
                </span>
                <button onClick={() => confirm(`'${pr.name}' 프리셋으로 바꿀까요? 지금 설정은 덮어써져요.`) && loadPreset(pr.id)}>불러오기</button>
                <button className="danger" onClick={() => confirm(`'${pr.name}' 프리셋을 지울까요?`) && deletePreset(pr.id)}>
                  삭제
                </button>
              </li>
            ))}
            {presets.length === 0 && <li className="muted">저장된 프리셋이 없어요</li>}
          </ul>
        </section>
        <section className="modal-section">
          <h4>진단</h4>
          <p className="muted small">
            감지가 잘 안 될 때, 문제가 생긴 직후에 눌러 주세요. 지금 게임 화면, <b>최근 30초 동안의 감지 영역</b>, 설정, 학습한 숫자, 감지 수치가 파일
            하나로 저장돼요 (다운로드 폴더). 이 파일로 그 30초를 그대로 다시 돌려 보며 고칠 수 있어요.
          </p>
          <div className="field-row">
            <button onClick={exportDiagnostics} disabled={screenCapture.state !== "live"}>
              진단 파일 저장
            </button>
            <span className="muted small mono">
              감지 1회 평균 {perf.avgMs.toFixed(1)}ms · 최근 최대 {perf.maxMs.toFixed(1)}ms (0.25초마다 실행)
            </span>
          </div>
        </section>
        <section className="modal-section">
          <h4>설정 백업</h4>
          <div className="field-row">
            <button onClick={exportProfile}>설정 파일로 내보내기</button>
            <label className="file-btn">
              설정 파일 불러오기
              <input type="file" accept="application/json" onChange={(e) => importProfile(e.target.files)} />
            </label>
            <button
              className="danger"
              onClick={() => {
                if (confirm("모든 설정을 처음 상태로 되돌릴까요? (선택한 영역·등록한 아이콘도 지워져요)")) profileStore.set(() => defaultProfile());
              }}
            >
              설정 초기화
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
