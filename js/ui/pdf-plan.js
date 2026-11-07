// Geometry follows the approved sheet mockup, in millimetres.
export const MIN_CELL = 2.5;
export const M = 4, TOP = 6.5, NUM = 3.6, OV = 3, ROWH = 4.6, GAP = 4.5;
export function makeParts(p, sx, sy) {
  const out = [];
  for (let j = 0; j < sy; j++) for (let i = 0; i < sx; i++) {
    const c0 = Math.round(p.cols * i / sx), c1 = Math.round(p.cols * (i + 1) / sx);
    const r0 = Math.round(p.rows * j / sy), r1 = Math.round(p.rows * (j + 1) / sy);
    const part = { i, j, c0, c1, r0, r1,
      vc0: Math.max(0, c0 - (i ? OV : 0)), vc1: Math.min(p.cols, c1 + (i < sx - 1 ? OV : 0)),
      vr0: Math.max(0, r0 - (j ? OV : 0)), vr1: Math.min(p.rows, r1 + (j < sy - 1 ? OV : 0)) };
    const used = new Set();
    for (let r = part.vr0; r < part.vr1; r++) for (let c = part.vc0; c < part.vc1; c++) {
      const v = p.cells[r * p.cols + c]; if (v !== 0xffff) used.add(v);
    }
    part.colors = [...used].sort((a, b) => a - b);
    part.hasBlends = part.colors.some(i => p.colors[i].blend);
    part.legend = part.hasBlends ? [...part.colors.filter(i => !p.colors[i].blend), null, ...part.colors.filter(i => p.colors[i].blend)] : part.colors;
    out.push(part);
  }
  return out;
}

export function layoutFor(p, sx, sy, orient) {
  const W = orient === "land" ? 297 : 210, H = orient === "land" ? 210 : 297;
  const parts = makeParts(p, sx, sy), m = M;
  const w = Math.max(...parts.map(t => t.vc1 - t.vc0)), h = Math.max(...parts.map(t => t.vr1 - t.vr0));
  const n = Math.max(...parts.map(t => t.legend.length)), rowH = parts.some(t => t.hasBlends) ? 7.2 : ROWH, gridTop = m + TOP + NUM;
  // Key below the grid…
  const cols = Math.max(1, Math.floor((W - 2 * m) / 65));
  const legH = GAP + Math.max(ROWH, Math.ceil(n / cols) * (rowH === ROWH ? 4.2 : rowH));
  let availW = W - 2 * m - NUM;
  let best = { side: "bottom", availW, cell: Math.min(6, availW / w, (H - gridTop - legH - m) / h) };
  // …or beside it, whichever gives bigger cells.
  for (let c = 1; c <= 3; c++) {
    if (Math.ceil(n / c) * rowH > H - gridTop - m) continue;
    const legW = c * (parts.some(t => t.hasBlends) ? 50 : 40);
    availW = W - 2 * m - NUM - legW - 5;
    const cell = Math.min(6, availW / w, (H - gridTop - m) / h);
    if (cell > best.cell + 0.01) best = { side: "right", availW, cell, legW };
  }
  return { sx, sy, orient, W, H, parts, total: parts.length, m, rowH, ...best };
}
function splitPlan(p, sx, sy) {
  const a = layoutFor(p, sx, sy, "port"), b = layoutFor(p, sx, sy, "land");
  return a.cell >= b.cell ? a : b;
}

// Options: for each sheet count keep the best split, then only keep counts that give bigger cells.
export function options(p) {
  const best = new Map();
  for (let sx = 1; sx <= 6; sx++) for (let sy = 1; sy <= 6; sy++) {
    const n = sx * sy, pl = splitPlan(p, sx, sy);
    if (!best.has(n) || pl.cell > best.get(n).cell) best.set(n, pl);
  }
  const sorted = [...best.keys()].sort((a, b) => a - b).map(n => best.get(n));
  // Recommend from every count, so the filter below cannot hide the smallest readable one.
  const rec = sorted.find(pl => pl.cell >= MIN_CELL) ?? sorted.reduce((a, b) => (b.cell > a.cell ? b : a));
  const list = []; let top = 0;
  sorted.forEach(pl => { if (pl === rec || pl.cell > top + 0.05) { list.push(pl); top = Math.max(top, pl.cell); } });
  const k = list.indexOf(rec);
  const shown = list.slice(Math.max(1, k - 1), k + 2);
  return { list: [list[0], ...shown.filter(pl => pl !== list[0])], rec: list[k] };
}


// Keep the dialog/export API: a split is [columns, rows], one sheet is 1.
const split = pl => pl.parts.length === 1 ? 1 : [pl.sx, pl.sy];
export function pageChoices(p) { return options(p).list.map(split); }
export function recommended(p) { return split(options(p).rec); }
export function plan(p, pages = 1) {
  if (Array.isArray(pages)) return splitPlan(p, ...pages);
  if (pages === 1) return splitPlan(p, 1, 1);
  let best;
  for (let sx = 1; sx <= pages; sx++) if (pages % sx === 0) {
    const candidate = splitPlan(p, sx, pages / sx);
    if (!best || candidate.cell > best.cell) best = candidate;
  }
  return best;
}
export const sheets = n => `${n} ${n % 10 === 1 && n % 100 !== 11 ? "лист" : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? "листа" : "листов"}`;

export function legendLayout(pl, part) {
  const gy = pl.m + TOP + NUM, vh = part.vr1 - part.vr0;
  const box = pl.side === "bottom"
    ? { x: pl.m, y: gy + vh * pl.cell + GAP, w: pl.W - 2 * pl.m }
    : { x: pl.W - pl.m - pl.legW, y: gy, w: pl.legW };
  box.h = pl.H - pl.m - box.y;
  let pick = null;
  for (let c = 1; c <= Math.max(1, Math.floor(box.w / 50)); c++) {
    const rh = Math.min(part.hasBlends ? 9 : 7, box.h / Math.max(1, Math.ceil((part.legend || part.colors).length / c)));
    if (rh >= (part.hasBlends ? 7.2 : 4.2)) { pick = { c, rh }; break; }
    if (!pick || rh > pick.rh + 0.01) pick = { c, rh };
  }
  return { ...box, ...pick };
}
