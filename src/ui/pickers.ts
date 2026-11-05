/**
 * 영역을 고르는 창 열기. 기능 칸과 준비 안내(문제 옆 버튼)가 같이 쓴다.
 */
import { stallRegion } from "../capture/detectionRegions";
import { screenCapture } from "../capture/screenCapture";
import { profileStore, setRegion, type StallMode } from "../state/profile";
import { openPicker } from "./pickerStore";

export const STALL_MODES: Record<StallMode, { label: string; guide: string[] }> = {
  exp: {
    label: "경험치 인식",
    guide: [
      "화면 아래 경험치바에서 경험치 숫자와 % 가 보이는 부분을 선택하세요.",
      "사냥 중 경험치가 오르면 이 영역이 바뀌고, 일정 시간 안 바뀌면 멈춘 것으로 봐요.",
    ],
  },
  cooldown: {
    label: "쿨타임 인식",
    guide: [
      "사냥 중 계속 쓰는 짧은 쿨타임 스킬의 퀵슬롯 아이콘을 선택하세요.",
      "아이콘(쿨타임 표시)이 일정 시간 안 바뀌면 멈춘 것으로 봐요.",
    ],
  },
  mana: {
    label: "마나 인식",
    guide: [
      "MP 숫자와 MP 바만 선택하세요 (HP 는 빼고).",
      "MP 가 일정 시간 안 바뀌면 멈춘 것으로 봐요. 마을에서 MP 가 자연 회복되면 변화로 칠 수 있어요.",
    ],
  },
};

export function pickMinimap() {
  openPicker({
    title: "미니맵 영역 선택",
    guide: [
      "미니맵의 헤더·버튼·필터 창은 빼고, 안쪽 지도 부분만 선택하세요.",
      "맵마다 미니맵 크기가 달라요. 마을이 아닌 실제 사냥터에서 선택해 주세요.",
    ],
    initial: profileStore.get().regions.minimap,
    onConfirm: ({ region }) => setRegion("minimap", region),
  });
}

export function pickStallRegion() {
  const p = profileStore.get();
  const st = p.stall;
  openPicker({
    title: st.mode === "exp" ? "경험치 숫자 높이 선택" : `사냥 멈춤 · ${STALL_MODES[st.mode].label} 영역 선택`,
    selection: st.mode === "exp" ? "experience-height" : undefined,
    guide: st.mode === "exp" ? ["경험치 숫자가 있는 높이를 클릭하세요. 가로는 중앙 40%로 맞춰져요."] : STALL_MODES[st.mode].guide,
    initial: stallRegion(p, screenCapture.width, screenCapture.height),
    onConfirm: ({ region }) =>
      st.mode === "exp"
        ? profileStore.set((p) => ({ ...p, stall: { ...p.stall, expHeightRatio: 1 - (region.y + region.h / 2) / region.frameH } }))
        : setRegion("stall", region),
  });
}

export function pickBuffbar() {
  openPicker({
    title: "우상단 버프칸 영역 선택",
    guide: [
      "화면 오른쪽 위 버프 아이콘들이 뜨는 영역 전체를 넉넉하게 선택하세요.",
      "인게임 설정: UI 크기 [최적 비율], 퀵슬롯&버프 시간표시 [중앙, 크게], 버프 정렬 옵션 모두 켜기를 권장해요.",
    ],
    initial: profileStore.get().regions.buffbar,
    onConfirm: ({ region }) => setRegion("buffbar", region),
  });
}

export function pickFavorites() {
  openPicker({
    title: "버프 즐겨찾기 위치 선택",
    guide: ["즐겨찾기 버프 칸들을 넉넉하게 선택하세요. 두 스킬에 함께 적용돼요."],
    initial: profileStore.get().regions.favorites,
    onConfirm: ({ region }) => {
      setRegion("favorites", region);
      profileStore.set((p) => ({ ...p, favoritesPosition: "manual" }));
    },
  });
}
