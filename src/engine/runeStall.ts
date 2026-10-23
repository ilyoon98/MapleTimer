import { RUNE_TEXT, STALL_TEXT } from "../alerts/speech";
import { screenCapture } from "../capture/screenCapture";
import { regionValidFor } from "../capture/types";
import { ChangeMonitor } from "../detect/changeMonitor";
import { RuneTracker, detectRuneByColor, detectRuneByTemplate, type RuneBox } from "../detect/rune";
import { profileStore, type Profile } from "../state/profile";
import { debugCrops, type RuneLive, type StallLive } from "./live";
import { prepared, runner } from "./shared";

/* ───────── 룬 ───────── */
const runeTracker = new RuneTracker();
let runeRegionKey = "";

export function tickRune(p: Profile, now: number, live: boolean, prev: RuneLive): RuneLive {
  const r = runner("rune", "룬", () => profileStore.get().rune.alert, () => RUNE_TEXT);
  const base = { boxes: [] as RuneBox[], lastAlertAt: r.lastFiredAt };
  if (!p.rune.enabled) {
    r.reset();
    runeTracker.reset();
    return { ...base, status: "off" };
  }
  if (!live) return { ...base, status: "no-share" };
  const region = p.regions.minimap;
  if (!regionValidFor(region, screenCapture.width, screenCapture.height)) return { ...base, status: "no-region" };
  const key = `${region.x},${region.y},${region.w},${region.h}`;
  if (key !== runeRegionKey) {
    runeRegionKey = key;
    runeTracker.reset();
    r.reset();
  }
  const img = screenCapture.crop(region);
  if (!img) return { ...base, status: "no-region" };
  debugCrops.set("minimap", img);
  const boxes =
    p.rune.mode === "template" && p.rune.template
      ? detectRuneByTemplate(img, prepared(p.rune.template), p.rune.templateMinScore)
      : detectRuneByColor(img, p.rune.color);
  const obs = runeTracker.observe(img, boxes, now);
  if (obs.mapChange || !obs.present) r.reset();
  if (obs.newRune) r.trigger(now);
  const status: RuneLive["status"] = obs.dark ? "dark" : obs.present ? "present" : boxes.length ? "candidate" : "searching";
  void prev;
  return { boxes, status, lastAlertAt: r.lastFiredAt };
}

/* ───────── 사냥 멈춤 ───────── */
const stallMonitor = new ChangeMonitor();
let stallKey = "";

export function tickStall(p: Profile, now: number, live: boolean, buffPresent: (id: string) => boolean): StallLive {
  const r = runner("stall", "사냥 멈춤", () => profileStore.get().stall.alert, () => STALL_TEXT);
  const st = p.stall;
  const base = { idleMs: 0, changedCells: 0, totalCells: 0, lastAlertAt: r.lastFiredAt };
  if (!st.enabled) {
    r.reset();
    stallMonitor.reset();
    return { ...base, status: "off" };
  }
  if (!live) return { ...base, status: "no-share" };
  const region = p.regions.stall;
  if (!regionValidFor(region, screenCapture.width, screenCapture.height)) return { ...base, status: "no-region" };
  if (st.linkedBuffId && !buffPresent(st.linkedBuffId)) {
    r.reset();
    stallMonitor.reset();
    return { ...base, status: "gated" };
  }
  const key = `${st.mode}|${region.x},${region.y},${region.w},${region.h}`;
  if (key !== stallKey) {
    stallKey = key;
    stallMonitor.reset();
    r.reset();
  }
  stallMonitor.opts = st.sensitivity;
  const img = screenCapture.crop(region);
  if (!img) return { ...base, status: "no-region" };
  debugCrops.set("stall", img);
  const sample = stallMonitor.observe(img, now);
  if (sample.changed) r.reset();
  const stalled = stallMonitor.isStalled(now, st.thresholdSec);
  if (stalled) r.trigger(now);
  r.tick(now);
  return {
    status: stalled ? "stalled" : stallMonitor.armed ? "watching" : "waiting",
    idleMs: stallMonitor.idleMs(now),
    changedCells: sample.changedCells,
    totalCells: sample.totalCells,
    lastAlertAt: r.lastFiredAt,
  };
}
