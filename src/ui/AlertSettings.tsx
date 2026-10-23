import { useEffect, useState } from "react";
import { REPEAT_COUNTS, REPEAT_INTERVALS, type AlertConfig } from "../alerts/alertRunner";
import { audioEngine, type BeepPattern, type SoundSpec } from "../alerts/audio";
import { listCustomSounds, type CustomSound } from "../alerts/customSounds";
import { Toggle } from "./common";

const BEEPS: Array<[BeepPattern, string]> = [
  ["single", "삑"],
  ["double", "삑삑"],
  ["triple", "삑삑삑"],
  ["rising", "띠리링"],
  ["alarm", "경보"],
];

let soundsCache: CustomSound[] | null = null;
const soundListeners = new Set<() => void>();
export async function refreshCustomSounds() {
  soundsCache = await listCustomSounds();
  for (const l of soundListeners) l();
}

function useCustomSounds() {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    soundListeners.add(l);
    if (!soundsCache) void refreshCustomSounds();
    return () => {
      soundListeners.delete(l);
    };
  }, []);
  return soundsCache ?? [];
}

/**
 * 알림 소리·볼륨·반복 설정.
 * speech: 음성 읽기일 때 읽을 문장 (항목 이름으로 알아서 만든 것이라 사용자가 쓰지 않는다)
 */
export function AlertSettings({ value, onChange, speech }: { value: AlertConfig; onChange: (v: AlertConfig) => void; speech: string }) {
  const sounds = useCustomSounds();
  const s = value.sound;
  const setSound = (sound: SoundSpec) => onChange({ ...value, sound });
  const rep = value.repeat;

  return (
    <div className="alert-settings">
      <div className="field-row">
        <span className="field-label">알림음</span>
        <select
          value={s.kind}
          onChange={(e) => {
            const k = e.target.value as SoundSpec["kind"];
            if (k === "tts") setSound({ kind: "tts", text: speech });
            if (k === "beep") setSound({ kind: "beep", pattern: "double" });
            if (k === "custom") setSound({ kind: "custom", soundId: sounds[0]?.id ?? "" });
          }}
        >
          <option value="tts">음성 읽기</option>
          <option value="beep">비프음</option>
          <option value="custom">내 소리 파일</option>
        </select>
        {s.kind === "tts" && <span className="muted">"{speech}" 라고 읽어요</span>}
        {s.kind === "beep" && (
          <select value={s.pattern} onChange={(e) => setSound({ kind: "beep", pattern: e.target.value as BeepPattern })}>
            {BEEPS.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        )}
        {s.kind === "custom" &&
          (sounds.length ? (
            <select value={s.soundId} onChange={(e) => setSound({ kind: "custom", soundId: e.target.value })}>
              {sounds.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          ) : (
            <span className="muted">설정 &gt; 내 소리 파일에서 먼저 추가해 주세요</span>
          ))}
        <button onClick={() => audioEngine.play(s.kind === "tts" ? { kind: "tts", text: speech } : value.sound, value.volume)}>미리 듣기</button>
      </div>
      <div className="field-row">
        <span className="field-label">볼륨</span>
        <input
          type="range"
          min={0}
          max={s.kind === "tts" ? 100 : 200}
          step={5}
          value={Math.round(Math.min(value.volume, s.kind === "tts" ? 1 : 2) * 100)}
          onChange={(e) => onChange({ ...value, volume: Number(e.target.value) / 100 })}
        />
        <span className="mono">{Math.round(Math.min(value.volume, s.kind === "tts" ? 1 : 2) * 100)}%</span>
        {value.volume > 1 && s.kind !== "tts" && <span className="muted small">100% 넘으면 소리가 깨질 수 있어요</span>}
      </div>
      <div className="field-row">
        <span className="field-label">반복</span>
        <Toggle checked={rep.enabled} onChange={(v) => onChange({ ...value, repeat: { ...rep, enabled: v } })} />
        {rep.enabled && (
          <>
            <select
              value={rep.intervalSec}
              onChange={(e) => onChange({ ...value, repeat: { ...rep, intervalSec: Number(e.target.value) } })}
            >
              {REPEAT_INTERVALS.map((v) => (
                <option key={v} value={v}>
                  {v}초 간격
                </option>
              ))}
            </select>
            <select
              value={rep.maxCount ?? "inf"}
              onChange={(e) =>
                onChange({ ...value, repeat: { ...rep, maxCount: e.target.value === "inf" ? null : Number(e.target.value) } })
              }
            >
              {REPEAT_COUNTS.map((v) => (
                <option key={String(v)} value={v ?? "inf"}>
                  {v == null ? "해결될 때까지 계속" : `${v}번 더`}
                </option>
              ))}
            </select>
          </>
        )}
        {!rep.enabled && <span className="muted">한 번만 알림</span>}
      </div>
    </div>
  );
}
