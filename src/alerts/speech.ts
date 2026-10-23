/**
 * 음성 알림 문장. 사용자가 직접 쓰지 않아도 항목 이름과 상황으로 알아서 만든다
 * (이름을 바꾸면 문장도 따라 바뀐다).
 */
export const soonText = (name: string) => `${name} 곧 끝나요`;
export const doneText = (name: string) => `${name} 끝났어요`;

/** 알림 시점이 종료 전이면 '곧 끝나요', 종료 뒤(0 이하)면 '끝났어요' */
export const leadText = (name: string, leadSec: number) => (leadSec > 0 ? soonText(name) : doneText(name));

/** 울리는 순간 기준: 아직 안 끝났으면 '곧 끝나요', 끝났으면 '끝났어요' */
export const endingText = (name: string, endsAt: number | null, now = Date.now()) =>
  endsAt != null && endsAt > now ? soonText(name) : doneText(name);

export const RUNE_TEXT = "룬이 나타났어요";
export const STALL_TEXT = "사냥이 멈춘 것 같아요";
