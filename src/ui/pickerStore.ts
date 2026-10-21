import type { SavedRegion } from "../capture/types";
import { createStore } from "../state/createStore";
import type { PickResult } from "./RegionPicker";

export interface PickRequest {
  title: string;
  guide: string[];
  within?: SavedRegion | null;
  initial?: SavedRegion | null;
  onConfirm: (r: PickResult) => void;
}

export const pickerStore = createStore<{ req: PickRequest | null }>({ req: null });

export function openPicker(req: PickRequest) {
  pickerStore.set({ req });
}
export function closePicker() {
  pickerStore.set({ req: null });
}
