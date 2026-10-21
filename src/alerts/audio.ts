import { listCustomSounds } from "./customSounds";

/** 알림 소리 설정: 음성(TTS) / 비프음 / 사용자 파일 */
export type SoundSpec =
  | { kind: "tts"; text: string }
  | { kind: "beep"; pattern: BeepPattern }
  | { kind: "custom"; soundId: string };

export type BeepPattern = "single" | "double" | "triple" | "rising" | "alarm";

const PATTERNS: Record<BeepPattern, Array<[freq: number, startSec: number, durSec: number]>> = {
  single: [[880, 0, 0.18]],
  double: [
    [880, 0, 0.14],
    [880, 0.22, 0.14],
  ],
  triple: [
    [988, 0, 0.12],
    [988, 0.18, 0.12],
    [988, 0.36, 0.12],
  ],
  rising: [
    [660, 0, 0.12],
    [880, 0.15, 0.12],
    [1175, 0.3, 0.2],
  ],
  alarm: [
    [1046, 0, 0.1],
    [784, 0.12, 0.1],
    [1046, 0.24, 0.1],
    [784, 0.36, 0.1],
    [1046, 0.48, 0.18],
  ],
};

class AudioEngine {
  private ctx: AudioContext | null = null;
  private buffers = new Map<string, AudioBuffer>();
  /** 0~1 */
  masterVolume = 1;
  muted = false;
  /** 음성 읽기에 쓸 목소리 (null = 첫 한국어 목소리) */
  ttsVoiceURI: string | null = null;
  ttsRate = 1.1;

  /** 사용자 제스처(클릭) 안에서 한 번 호출해 브라우저 자동재생 제한을 푼다 */
  unlock() {
    if (!this.ctx) this.ctx = new AudioContext();
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  private get audio() {
    this.unlock();
    return this.ctx!;
  }

  /** 소리를 재생하고, 재생이 끝나면 resolve 한다 (반복 알림 간격 계산용) */
  async play(spec: SoundSpec, volume = 1): Promise<void> {
    if (this.muted) return;
    // 비프음·내 소리 파일은 최대 2배(200%)까지 키울 수 있다 (음성 읽기는 브라우저 한계로 100%)
    const vol = Math.max(0, Math.min(2, volume * this.masterVolume));
    if (vol === 0) return;
    switch (spec.kind) {
      case "tts":
        return this.speak(spec.text, Math.min(1, vol));
      case "beep":
        return this.beep(spec.pattern, vol);
      case "custom":
        return this.playCustom(spec.soundId, vol);
    }
  }

  private speak(text: string, vol: number): Promise<void> {
    if (!("speechSynthesis" in window) || !text.trim()) return this.beep("double", vol);
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "ko-KR";
    u.volume = vol;
    u.rate = this.ttsRate;
    const voices = speechSynthesis.getVoices();
    const voice =
      (this.ttsVoiceURI && voices.find((v) => v.voiceURI === this.ttsVoiceURI)) || voices.find((v) => v.lang.startsWith("ko"));
    if (voice) u.voice = voice;
    return new Promise((resolve) => {
      const done = () => resolve();
      u.onend = done;
      u.onerror = done;
      // 일부 환경에서 onend 가 오지 않는 경우 대비
      setTimeout(done, 1500 + text.length * 250);
      speechSynthesis.speak(u);
    });
  }

  private beep(pattern: BeepPattern, vol: number): Promise<void> {
    const ctx = this.audio;
    const t0 = ctx.currentTime + 0.02;
    const notes = PATTERNS[pattern];
    const last = notes[notes.length - 1];
    for (const [freq, start, dur] of notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, t0 + start);
      gain.gain.linearRampToValueAtTime(0.35 * vol, t0 + start + 0.01);
      gain.gain.setValueAtTime(0.35 * vol, t0 + start + dur - 0.03);
      gain.gain.linearRampToValueAtTime(0, t0 + start + dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0 + start);
      osc.stop(t0 + start + dur + 0.02);
    }
    return new Promise((r) => setTimeout(r, (last[1] + last[2] + 0.05) * 1000));
  }

  private async playCustom(id: string, vol: number): Promise<void> {
    const ctx = this.audio;
    let buf = this.buffers.get(id);
    if (!buf) {
      const s = (await listCustomSounds()).find((x) => x.id === id);
      if (!s) return this.beep("double", vol);
      buf = await ctx.decodeAudioData(await s.blob.arrayBuffer());
      this.buffers.set(id, buf);
    }
    const src = ctx.createBufferSource();
    const gain = ctx.createGain();
    gain.gain.value = vol;
    src.buffer = buf;
    src.connect(gain).connect(ctx.destination);
    // 너무 긴 파일은 30초에서 자른다
    const maxSec = Math.min(buf.duration, 30);
    src.start(0, 0, maxSec);
    return new Promise((r) => {
      src.onended = () => r();
    });
  }

  forget(id: string) {
    this.buffers.delete(id);
  }
}

export const audioEngine = new AudioEngine();
