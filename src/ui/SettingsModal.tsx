import { useEffect, useState } from "react";
import { audioEngine } from "../alerts/audio";
import { exportAlertEvidence } from "../state/alertEvidence";
import { flushAlertEvidence } from "../engine/alertEvidence";
import { AlertEvidenceViewer } from "./AlertEvidenceViewer";
import { UpdateSettings } from "./UpdateBanner";
import { screenCapture } from "../capture/screenCapture";
import { buffSearchStats, clipSnapshot, clipUsage, featurePerf, liveStore } from "../engine/engine";
import { deleteCustomSound, listCustomSounds, putCustomSound, type CustomSound } from "../alerts/customSounds";
import { digitStore, importLearnedDigits, learnedDigitCount, resetLearnedDigits } from "../detect/digitLearner";
import { defaultProfile, migrate, profileStore, uid } from "../state/profile";
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
  const alertOnShareEnd = profileStore.use((p) => p.alertOnShareEnd);
  const learned = digitStore.use((d) => learnedDigitCount(d));
  const randomDelay = profileStore.use((p) => p.randomDelay);
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
  const [savingDiag, setSavingDiag] = useState(false);
  const [showAlertEvidence, setShowAlertEvidence] = useState(false);
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
  const exportDiagnostics = async () => {
    if (savingDiag) return;
    setSavingDiag(true);
    try {
      // 지금 화면과 상태는 누른 순간 것으로 먼저 잡아 두고, 30초 녹화 변환은 그 뒤에 천천히 한다
      const frame = screenCapture.snapshot();
      const live = liveStore.get();
      const framePng = frame ? frame.toDataURL("image/png") : null;
      const usage = clipUsage();
      const clip = await clipSnapshot();
      await flushAlertEvidence();
      const alertEvidence = await exportAlertEvidence();
      const data = {
        kind: "maple-timer-diagnostics",
        savedAt: new Date().toISOString(),
        clipUsage: usage,
        userAgent: navigator.userAgent,
        capture: {
          state: screenCapture.state, width: screenCapture.width, height: screenCapture.height,
          lastFrameAt: screenCapture.lastFrameAt, drawnAt: screenCapture.drawnAt,
          error: screenCapture.error, visibility: document.visibilityState,
        },
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
        featurePerf: featurePerf(),
        buffSearch: buffSearchStats(),
          captureStale: live.captureStale,
          captureBlack: live.captureBlack,
          screenTransition: live.screenTransition,
        },
        framePng,
        // 최근 30초 동안 선택한 영역만 0.25초마다 (개발 모드에서 재생해 문제를 그대로 재현)
        clip,
        alertEvidence,
      };
      const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      const d = new Date();
      const p2 = (n: number) => String(n).padStart(2, "0");
      a.download = `maple-diagnostics-${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    } finally {
      setSavingDiag(false);
    }
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
        <UpdateSettings />
        <section className="modal-section">
          <h4>일반</h4>
          <div className="field-row">
            <span className="field-label">읽어주는 목소리</span>
            <select value={ttsVoice ?? ""} onChange={(e) => profileStore.set({ ttsVoice: e.target.value || null })}>
              <option value="">자동</option>
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
          {voices.length === 0 && <p className="muted small">한국어 목소리가 없어요 · Windows 설정 &gt; 시간 및 언어 &gt; 음성에서 추가</p>}
          <div className="field-row">
            <Toggle checked={randomDelay} onChange={(v) => profileStore.set({ randomDelay: v })} label="첫 알림을 0~2초 무작위로 늦추기" />
          </div>
          <div className="field-row">
            <Toggle
              checked={alertOnShareEnd}
              onChange={(v) => profileStore.set({ alertOnShareEnd: v })}
              label="화면 공유가 끊기면 알려 주기"
            />
          </div>
        </section>
        <section className="modal-section">
          <h4>내 소리 파일</h4>
          <p className="muted small">알림음으로 쓸 소리 (mp3·wav 등, 5MB 이하)</p>
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
        <details className="modal-section modal-advanced">
          <summary>문제가 생겼을 때 · 백업</summary>
          <div className="adv-row">
            <div className="adv-text">
              <b>진단 파일 저장</b>
              <span className="muted small">최근 30초 화면과 알림 순간 캡처를 함께 저장해요.</span>
            </div>
            <button
              onClick={() => void exportDiagnostics()}
              disabled={screenCapture.state !== "live" || savingDiag}
              title={`감지 1회 평균 ${perf.avgMs.toFixed(1)}ms · 녹화 ${(clipUsage().bytes / 1048576).toFixed(1)}MB`}
            >
              {savingDiag ? "저장하는 중…" : "저장"}
            </button>
            <button onClick={() => setShowAlertEvidence(v=>!v)}>{showAlertEvidence?"캡처 접기":"알림 캡처 보기"}</button>
          </div>
          {showAlertEvidence && <AlertEvidenceViewer />}
          <div className="adv-row">
            <div className="adv-text">
              <b>설정 옮기기</b>
              <span className="muted small">다른 PC 로 옮기거나 미리 저장해 둘 때</span>
            </div>
            <button onClick={exportProfile}>파일로 저장</button>
            <label className="file-btn">
              불러오기
              <input type="file" accept="application/json" onChange={(e) => importProfile(e.target.files)} />
            </label>
          </div>
          <div className="adv-row">
            <div className="adv-text">
              <b>상황별 설정</b>
              <span className="muted small">사냥용·보스용처럼 지금 설정을 이름 붙여 두고 바꿔 쓰기</span>
            </div>
            <input value={presetName} onChange={(e) => setPresetName(e.target.value)} placeholder="예: 보스" />
            <button
              disabled={!presetName.trim()}
              onClick={() => {
                savePreset(presetName);
                setPresetName("");
              }}
            >
              저장
            </button>
          </div>
          {presets.length > 0 && (
            <ul className="sound-list">
              {presets.map((pr) => (
                <li key={pr.id}>
                  <span className="grow">{pr.name}</span>
                  <button onClick={() => confirm(`'${pr.name}' 설정으로 바꿀까요? 지금 설정은 덮어써져요.`) && loadPreset(pr.id)}>바꾸기</button>
                  <button className="danger" onClick={() => confirm(`'${pr.name}' 을(를) 지울까요?`) && deletePreset(pr.id)}>
                    삭제
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="adv-row">
            <div className="adv-text">
              <b>숫자 읽기</b>
              <span className="muted small">게임 숫자 모양이 들어 있어서 따로 할 일은 없어요. 이 PC 에 맞춰 자동으로 더 배워요{learned ? ` (${learned}/10)` : ""}.</span>
            </div>
            {learned > 0 && (
              <button onClick={() => confirm("이 PC 에서 더 배운 숫자 모양을 지울까요? (기본 숫자 모양은 그대로예요)") && resetLearnedDigits()}>배운 것 지우기</button>
            )}
          </div>
          <div className="adv-row">
            <div className="adv-text">
              <b>처음 상태로</b>
              <span className="muted small">모든 설정·영역·등록한 아이콘을 지워요</span>
            </div>
            <button
              className="danger"
              onClick={() => {
                if (confirm("모든 설정을 처음 상태로 되돌릴까요? (선택한 영역·등록한 아이콘도 지워져요)")) profileStore.set(() => defaultProfile());
              }}
            >
              초기화
            </button>
          </div>
        </details>
      </div>
    </div>
  );
}
