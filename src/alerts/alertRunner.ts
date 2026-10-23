import { audioEngine, type SoundSpec } from "./audio";

export interface RepeatConfig {
  enabled: boolean;
  /** 반복 간격(초): 직전 소리가 끝난 뒤부터 잰다 */
  intervalSec: number;
  /** 최대 반복 횟수 (null = 조건이 풀릴 때까지 계속) */
  maxCount: number | null;
}

export interface AlertConfig {
  sound: SoundSpec;
  /** 0~1 */
  volume: number;
  repeat: RepeatConfig;
}

export const REPEAT_INTERVALS = [2, 3, 5] as const;
export const REPEAT_COUNTS = [1, 2, 3, 5, null] as const;
export const DEFAULT_REPEAT: RepeatConfig = { enabled: false, intervalSec: 3, maxCount: 3 };

/** 전역 '랜덤 지연' 설정: 첫 알림을 0~2초(0.5초 단위) 늦춘다 */
export const randomDelaySetting = { enabled: false };

function pickJitterMs() {
  if (!randomDelaySetting.enabled) return 0;
  return [0, 500, 1000, 1500, 2000][Math.floor(Math.random() * 5)];
}

export interface AlertLogEntry {
  at: number;
  label: string;
}
type LogListener = (e: AlertLogEntry) => void;
const logListeners = new Set<LogListener>();
export function onAlertLog(l: LogListener) {
  logListeners.add(l);
  return () => logListeners.delete(l);
}
export function emitAlertLog(label: string, at = Date.now()) {
  for (const l of logListeners) l({ at, label });
}

/**
 * 알림 한 건의 재생/반복을 관리한다.
 * - trigger(): 알림 조건이 처음 만족됐을 때 (랜덤 지연 후 첫 재생)
 * - tick(): 주기적으로 호출. 예약된 재생/반복을 처리
 * - reset(): 조건이 풀렸을 때 (룬 사라짐, 스킬 재사용 등) 남은 반복을 취소
 */
export class AlertRunner {
  private nextAt: number | null = null;
  private played = 0;
  private playing = false;
  private active = false;
  /** 사용자가 '알림 멈춤'을 눌렀음: 조건이 풀릴 때(reset)까지 다시 울리지 않음 */
  private acked = false;
  lastFiredAt: number | null = null;

  /** 음성 읽기일 때 읽을 문장 (없으면 저장된 문장) */
  private speak: (() => string) | null = null;

  constructor(
    private label: string,
    private getConfig: () => AlertConfig,
  ) {}

  setSpeak(speak: (() => string) | null) {
    this.speak = speak;
  }

  private soundOf(cfg: AlertConfig): SoundSpec {
    return cfg.sound.kind === "tts" && this.speak ? { kind: "tts", text: this.speak() } : cfg.sound;
  }

  get isActive() {
    return this.active;
  }

  /** 지금 소리가 나고 있거나 반복 대기 중 */
  get isRinging() {
    return this.active && (this.playing || this.nextAt != null);
  }

  setLabel(label: string) {
    this.label = label;
  }

  trigger(now = Date.now(), opts: { jitter?: boolean } = {}) {
    if (this.active || this.acked) return;
    this.active = true;
    this.played = 0;
    this.nextAt = now + (opts.jitter === false ? 0 : pickJitterMs());
  }

  reset() {
    this.active = false;
    this.acked = false;
    this.nextAt = null;
    this.played = 0;
  }

  /** 지금 울리거나 반복 중인 알림을 멈춘다. 조건이 풀렸다가 다시 생기면 그때 다시 울린다 */
  ack() {
    if (!this.active) return;
    this.active = false;
    this.acked = true;
    this.nextAt = null;
  }

  tick(now = Date.now()) {
    if (!this.active || this.playing || this.nextAt == null || now < this.nextAt) return;
    const cfg = this.getConfig();
    this.playing = true;
    this.played++;
    this.lastFiredAt = now;
    emitAlertLog(this.label, now);
    const repeatsLeft = (() => {
      if (!cfg.repeat.enabled) return false;
      if (cfg.repeat.maxCount == null) return true;
      return this.played <= cfg.repeat.maxCount; // 첫 알림 + 반복 maxCount 회
    })();
    this.nextAt = null;
    audioEngine
      .play(this.soundOf(cfg), cfg.volume)
      .catch((e) => console.warn("[alert] 재생 실패", e))
      .finally(() => {
        this.playing = false;
        if (this.active && repeatsLeft) this.nextAt = Date.now() + cfg.repeat.intervalSec * 1000;
      });
  }

  /** 알림 테스트용: 설정된 소리를 바로 한 번 재생 */
  async preview() {
    const cfg = this.getConfig();
    await audioEngine.play(this.soundOf(cfg), cfg.volume);
  }
}
