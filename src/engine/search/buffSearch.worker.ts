/// <reference lib="webworker" />
// 버프칸 아이콘 탐색 전용 워커: 무거운 탐색을 메인 스레드에서 빼서 버튼·타이머·PIP 가 끊기지 않게
import { TemplateBank, runSearch, type SearchItem, type SearchRegion, type TemplateDef } from "./buffSearch";

const bank = new TemplateBank();

self.onmessage = (e: MessageEvent<{ requestId: number; defs: TemplateDef[]; regions: SearchRegion[]; items: SearchItem[] }>) => {
  const { requestId, defs, regions, items } = e.data;
  try {
    for (const d of defs) bank.define(d);
    const t0 = performance.now();
    const hits = runSearch(bank, regions, items);
    self.postMessage({ requestId, hits, workMs: performance.now() - t0 });
  } catch (err) {
    self.postMessage({ requestId, error: String(err) });
  }
};
