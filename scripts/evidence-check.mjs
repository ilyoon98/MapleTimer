// 알림 캡처 자동 분석
//   npm run evidence:check -- <진단 파일.json 또는 폴더> [--no-save]
// 진단 파일의 알림 캡처를 지금 감지 코드로 다시 읽어 기능별로 정리하고,
// '틀림'·'놓침' 으로 표시한 기록은 src/detect/fixtures/evidence/ 에 회귀 테스트로 저장한다.
import { createServer } from "vite";
import { inflateSync, deflateSync } from "node:zlib";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const save = !args.includes("--no-save");
const targets = args.filter((a) => !a.startsWith("--"));
if (!targets.length) {
  console.log("사용법: npm run evidence:check -- <진단 파일.json 또는 폴더> [--no-save]");
  process.exit(1);
}

/** canvas 가 만드는 PNG(8비트 RGB/RGBA, 비월간)만 푼다 */
export function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error("PNG 아님");
  let pos = 8, width = 0, height = 0, depth = 0, type = 0, interlace = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos), name = buf.toString("ascii", pos + 4, pos + 8), body = buf.subarray(pos + 8, pos + 8 + len);
    if (name === "IHDR") { width = body.readUInt32BE(0); height = body.readUInt32BE(4); depth = body[8]; type = body[9]; interlace = body[12]; }
    else if (name === "IDAT") idat.push(body);
    else if (name === "IEND") break;
    pos += 12 + len;
  }
  if (depth !== 8 || (type !== 6 && type !== 2) || interlace) throw new Error(`지원 안 하는 PNG (depth ${depth}, type ${type})`);
  const bpp = type === 6 ? 4 : 3, stride = width * bpp, raw = inflateSync(Buffer.concat(idat));
  const out = new Uint8ClampedArray(width * height * 4), prev = new Uint8Array(stride), cur = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)], line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
      let v = line[i];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      cur[i] = v & 255;
    }
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4, s = x * bpp;
      out[o] = cur[s]; out[o + 1] = cur[s + 1]; out[o + 2] = cur[s + 2]; out[o + 3] = bpp === 4 ? cur[s + 3] : 255;
    }
    prev.set(cur);
  }
  return { width, height, data: out };
}

const fromDataUrl = (url) => decodePng(Buffer.from(url.slice(url.indexOf(",") + 1), "base64"));

function files(target) {
  const p = path.resolve(target);
  if (fs.statSync(p).isDirectory()) return fs.readdirSync(p).filter((f) => f.endsWith(".json")).map((f) => path.join(p, f));
  return [p];
}

const server = await createServer({ root, configFile: false, logLevel: "error", appType: "custom", optimizeDeps: { noDiscovery: true, entries: [] }, server: { middlewareMode: true, hmr: false, watch: null } });
try {
  const m = await server.ssrLoadModule("/src/dev/evidenceCheck.ts");
  const items = [], seen = new Set();
  let setup;
  for (const file of targets.flatMap(files)) {
    let data;
    try { data = JSON.parse(fs.readFileSync(file, "utf8")); } catch { console.log(`건너뜀 (JSON 아님): ${file}`); continue; }
    if (data.kind !== "maple-timer-diagnostics" || !Array.isArray(data.alertEvidence)) { console.log(`건너뜀 (진단 파일 아님): ${file}`); continue; }
    if (data.profile) setup = m.setupFromProfile(data.profile, data.learnedDigits);
    for (const e of data.alertEvidence) {
      if (seen.has(e.id)) continue;
      seen.add(e.id);
      let crop = null;
      try { crop = e.crop?.image ? fromDataUrl(e.crop.image) : null; } catch (err) { console.log(`그림을 못 풀었어요 (${e.label}): ${err.message}`); }
      items.push({ id: e.id, at: e.at, key: e.key, label: e.label, playIndex: e.playIndex ?? 0, verdict: e.verdict ?? null, crop, live: e.live ?? {} });
    }
  }
  if (!items.length) { console.log("알림 캡처가 없어요."); process.exit(0); }
  setup ??= {};
  const rows = m.analyze(items, setup);
  console.log(m.formatReport(rows));

  if (save) {
    const dir = path.join(root, "src/detect/fixtures/evidence");
    let added = 0, needsAnswer = 0;
    for (const r of rows) {
      const v = r.item.verdict;
      if ((v !== "wrong" && v !== "missed") || !r.item.crop) continue;
      const name = r.item.id.replace(/[^0-9a-zA-Z_-]+/g, "_") + ".json";
      const file = path.join(dir, name);
      if (fs.existsSync(file)) continue;
      const expected = m.expectedFor(r.item.key, v, setup);
      if (!expected) needsAnswer++;
      const c = r.item.crop;
      const fixture = {
        id: r.item.id, key: r.item.key, label: r.item.label, at: r.item.at, verdict: v,
        width: c.width, height: c.height, rgbaDeflate: deflateSync(Buffer.from(c.data.buffer)).toString("base64"),
        setup: m.setupFor(r.item.key, setup),
        // 지금 코드로 이미 통과하면 고쳐진 것으로 저장 (그 뒤로 다시 틀리면 테스트가 잡는다)
        expected, fixed: expected ? r.stillWrong === false : false,
      };
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(file, JSON.stringify(fixture, null, 1));
      added++;
    }
    console.log("");
    console.log(added ? `회귀 테스트 기록 ${added}건 저장 → src/detect/fixtures/evidence/` : "새로 저장할 회귀 테스트 기록 없음");
    if (needsAnswer) console.log(`  그중 ${needsAnswer}건은 정답(expected)을 채워야 테스트가 돌아요.`);
  }
} finally {
  await server.close();
}
