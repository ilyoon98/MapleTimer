import { labelGlyphs, type Segmented } from "../cv/digits";
import { addDigitSamples } from "../detect/digitLearner";

/** 화면에 보이는 숫자를 직접 입력해 글자 모양을 가르친다 (자동 학습이 잘 안 되거나 글꼴이 다른 타이머용) */
export function teachDigits(seg: Segmented | null, where: string) {
  if (!seg || !seg.glyphs.length) {
    alert(`${where} 영역에서 숫자를 찾지 못했어요. 숫자가 보일 때 다시 눌러 주세요.`);
    return;
  }
  const typed = prompt(`${where}에 지금 보이는 숫자를 그대로 입력하세요 (예: 45.23, 1:05)\n찾은 글자 수: ${seg.glyphs.length}개`);
  if (typed == null) return;
  const samples = labelGlyphs(seg, typed);
  if (!samples) {
    alert(`입력한 숫자 개수(${typed.replace(/[^0-9]/g, "").length})와 화면에서 찾은 글자 수(${seg.glyphs.length})가 달라요.`);
    return;
  }
  addDigitSamples(samples);
  alert(`숫자 ${samples.length}개를 배웠어요. 여러 번 가르칠수록 정확해져요.`);
}
