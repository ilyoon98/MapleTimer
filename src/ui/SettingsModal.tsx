import { useEffect, useState } from "react";
import { audioEngine } from "../alerts/audio";
import { screenCapture } from "../capture/screenCapture";
import { liveStore } from "../engine/engine";
import { deleteCustomSound, listCustomSounds, putCustomSound, type CustomSound } from "../alerts/customSounds";
import { digitStore, importLearnedDigits, learnedDigitCount, resetLearnedDigits } from "../detect/digitLearner";
import { PIP_SIZES, defaultProfile, migrate, profileStore, uid, type PipSize, type ThemeMode } from "../state/profile";
import { deletePreset, loadPreset, presetStore, savePreset } from "../state/presets";
import { refreshCustomSounds } from "./AlertSettings";
import { Toggle } from "./common";

function useEscape(onClose: () => void) {
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
              <option value="">자동 (첫 한국어 목소리)</option>
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
            쿨타임 10초 이상인 스킬의 퀵슬롯 영역을 잡아 두고, 스킬을 한 번 쓴 뒤 숫자가 한 자리(9 이하)가 될 때까지 두면 화면의 숫자 모양을 자동으로 배워요.
            0~9 를 모두 배우면 쿨타임 숫자로 사용 시점을 다시 계산해요. 해상도나 UI 크기를 바꿨다면 초기화 후 다시 배우세요.
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
            감지가 잘 안 될 때, 문제가 보이는 순간에 눌러 주세요. 지금 게임 화면·선택한 영역·학습한 숫자·감지 수치가 파일 하나로 저장돼요 (다운로드
            폴더). 이 파일을 보면 기준값을 정확히 맞출 수 있어요.
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

export function GuideModal({ onClose }: { onClose: () => void }) {
  useEscape(onClose);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <header className="modal-head">
          <h3>사용 방법</h3>
          <button className="icon-btn" onClick={onClose} aria-label="닫기">
            ✕
          </button>
        </header>
        <section className="modal-section">
          <h4>1. 인게임 설정</h4>
          <ul className="guide-list">
            <li>UI &gt; UI 크기 옵션: <b>최적 비율</b></li>
            <li>UI &gt; 퀵슬롯&amp;버프 시간표시: <b>중앙, 크게</b> / 표시 방식: <b>분 + 초</b></li>
            <li>UI &gt; 버프 정렬 옵션: <b>모두 켜기</b></li>
          </ul>
        </section>
        <section className="modal-section">
          <h4>2. 화면 공유</h4>
          <ul className="guide-list">
            <li>오른쪽 위 <b>화면 공유 시작</b> → 메이플스토리 <b>창</b>을 선택하세요. (창 모드가 안 되면 전체 화면 선택)</li>
            <li>이 탭은 열어 둔 채로 게임을 하면 돼요. 다른 창에 가려져도 감지는 계속돼요.</li>
            <li>해상도를 바꾸면 영역을 다시 선택해야 해요.</li>
          </ul>
        </section>
        <section className="modal-section">
          <h4>3. 기능별 영역 선택</h4>
          <ul className="guide-list">
            <li><b>스킬</b>: 퀵슬롯 아이콘(쿨타임 숫자 포함)을 스킬이 준비된 상태에서 선택 → 스킬을 쓰면 자동으로 타이머 시작</li>
            <li><b>룬</b>: 미니맵 안쪽 지도 영역 선택 → 룬이 떴을 때 '룬 아이콘 등록'을 하면 더 정확해요</li>
            <li><b>사냥 멈춤</b>: 경험치 숫자 영역(또는 자주 쓰는 스킬 아이콘, MP 숫자) 선택</li>
            <li><b>버프칸</b>: 우상단 버프칸 전체 선택 → 감지할 버프/특수 코어 아이콘 등록</li>
          </ul>
        </section>
        <section className="modal-section">
          <h4>4. 숫자 학습 (처음 한 번)</h4>
          <ul className="guide-list">
            <li>쿨타임 10초 이상 스킬의 퀵슬롯 영역을 잡고, 스킬을 쓴 뒤 <b>숫자가 한 자리(9 이하)가 될 때까지</b> 두면 0~9 숫자 모양을 자동으로 배워요.</li>
            <li>숫자를 배우면 쿨타임 도중에 켜도 남은 시간을 맞추고, 버프 아이콘의 남은 시간(야누스·파운틴 정밀)과 부스터 타이머도 읽어요.</li>
            <li>잘 안 배워지면 진단의 <b>숫자 직접 가르치기</b>로 화면 숫자를 입력해 주세요.</li>
          </ul>
        </section>
        <section className="modal-section">
          <h4>5. 잘 안 될 때</h4>
          <ul className="guide-list">
            <li>맨 위 <b>준비 체크리스트</b>에서 빠진 단계를 확인하세요.</li>
            <li>각 항목의 ▾ 를 눌러 <b>진단</b> 화면에서 실제로 잘린 영역과 수치를 확인하고 기준값을 조절하세요.</li>
            <li>설정 &gt; <b>진단 파일 저장</b>으로 그 순간의 화면·설정을 저장해 두면 원인을 찾기 쉬워요.</li>
            <li>소리가 안 나면: 페이지를 한 번 클릭했는지, 탭 음소거·시스템 볼륨을 확인하세요.</li>
            <li>PIP 타이머를 켜 두면 게임 위에 남은 시간이 항상 보여요.</li>
          </ul>
        </section>
        <p className="muted small">
          이 도구는 공유한 화면을 이 브라우저 안에서만 분석하며 게임 입력·메모리·파일에는 접근하지 않습니다. 그래도 비공식 도구이므로 사용에
          따른 책임은 본인에게 있어요.
        </p>
      </div>
    </div>
  );
}
