import { useEffect, useState } from "react";
import { type AlertConfig } from "../alerts/alertRunner";
import { LeadSelect } from "./common";
import { type BeepPattern, type SoundSpec } from "../alerts/audio";
import { listCustomSounds, type CustomSound } from "../alerts/customSounds";

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
 * 알림 소리·볼륨·반복 설정을 한 줄로 (원래 사이트처럼 단순하게).
 * - 알림음: 음성 읽기 / 비프음 / 내 소리 파일을 목록 하나에서 고른다
 * - 반복: 3초 간격 고정, '한 번만' 또는 '계속 반복'(멈출 때까지)
 * speech: 음성 읽기일 때 읽을 문장 (항목 이름으로 알아서 만든 것이라 사용자가 쓰지 않는다)
 */
export function AlertSettings({
  value,
  onChange,
  speech,
  lead,
}: {
  value: AlertConfig;
  onChange: (v: AlertConfig) => void;
  speech: string;
  /** 알림 시점도 이 줄에 같이 (반복 바로 앞) */
  lead?: { value: number; onChange: (v: number) => void; options?: number[] };
}) {
  const sounds = useCustomSounds();
  const s = value.sound;
  const key = s.kind === "tts" ? "tts" : s.kind === "beep" ? `beep:${s.pattern}` : `custom:${s.soundId}`;
  const pick = (k: string) => {
    const [kind, arg] = k.split(":");
    const sound: SoundSpec =
      kind === "tts" ? { kind: "tts", text: speech } : kind === "beep" ? { kind: "beep", pattern: arg as BeepPattern } : { kind: "custom", soundId: arg };
    onChange({ ...value, sound });
  };
  const maxVol = s.kind === "tts" ? 1 : 2;
  const vol = Math.round(Math.min(value.volume, maxVol) * 100);

  return (
    <div className="field-row alert-settings">
      <span className="field-label">알림음</span>
      <select value={key} onChange={(e) => pick(e.target.value)}>
        <option value="tts">음성 읽기</option>
        {BEEPS.map(([id, name]) => (
          <option key={id} value={`beep:${id}`}>
            비프음 · {name}
          </option>
        ))}
        {sounds.map((x) => (
          <option key={x.id} value={`custom:${x.id}`}>
            내 소리 · {x.name}
          </option>
        ))}
      </select>
      <span className="field-label">볼륨</span>
      <input type="range" min={0} max={maxVol * 100} step={5} value={vol} onChange={(e) => onChange({ ...value, volume: Number(e.target.value) / 100 })} />
      <span className="mono">{vol}%</span>
      {lead && (
        <>
          <span className="field-label">알림 시점</span>
          <LeadSelect value={lead.value} onChange={lead.onChange} options={lead.options} />
        </>
      )}
      <span className="field-label">반복</span>
      <select
        value={value.repeat.enabled ? "loop" : "once"}
        onChange={(e) =>
          onChange({
            ...value,
            repeat: e.target.value === "loop" ? { enabled: true, intervalSec: 3, maxCount: null } : { ...value.repeat, enabled: false },
          })
        }
      >
        <option value="once">한 번만</option>
        <option value="loop">계속 반복 (3초마다)</option>
      </select>
    </div>
  );
}
