/** Pure Worker/Node engine. Backward-compatible SPEC.md API; no new options/fields.
 * Chart + emptyBackground: a supplied white legend entry (B5200/Blanc/3865/Ecru) preserves neutral
 * symbols on paper using central two-axis residual energy (straight rules removed).
 * Unmarked bright paper stays empty. emptyBackground=false still fills all cells.
 * Without a supplied white legend, the existing automatic palette is preserved;
 * white-symbol identification is ambiguous and is not guaranteed in auto mode.
 * detectGrid / detectGridBounds confidence is spectral prominence over median
 * frequency noise on the weaker axis (0..1 evidence score, not a probability).
 * A strong coherent lattice scores >=0.7; absent grids may return null.
 *
 * Invalid options, unknown/empty allowed palettes and degenerate quads throw RangeError.
 * Pixel coordinates describe cell edges; omitted quad spans [0,width] × [0,height].
 * estimateSkeins returns fractional skeins: two diagonals + 2 mm carry per stitch,
 * 15% handling allowance, divided by 48 strand-metres per skein.
 * Full photographs (emptyBackground=false) choose actual DMCs by deterministic
 * greedy coverage and constrained refinement in gamut-mapped OKLab distance.
 * Photo defaults recommended to callers: dither=0, cleanup=1, emptyBackground=false.
 * Omitted options retain dither=0/cleanup=0 for compatibility. Photo cleanup joins
 * four-connected confetti within source ΔE76 and OKLab error bounds.
 * Chart and foreground-on-fabric palette selection retain weighted k-means++;
 * CIEDE2000 maps those centres to DMC. Chart sampling and cleanup stay unchanged.
 */
import { DMC } from "./dmc.js";
import { rgbToLab, rgbToOKLab, deltaE2000 } from "./color.js";
import { validateImage } from "./geometry.js";
import { readCells } from "./sample.js";
import { quantize, ditherCells, cleanupCells, cleanupPhoto } from "./quantize.js";
export { DMC } from "./dmc.js";
export { detectGrid, detectGridBounds } from "./grid.js";
const palette = DMC.map(([code, name, hex]) => {
  const rgb = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return { code, name, hex, rgb, lab: rgbToLab(...rgb), oklab: rgbToOKLab(...rgb) };
});
const byCode = new Map(palette.map((c) => [c.code, c]));
export function dmcByCode(code) {
  const c = byCode.get(String(code));
  return c
    ? { code: c.code, name: c.name, hex: c.hex, rgb: [...c.rgb] }
    : undefined;
}
function pack(cols, rows, cells, colors) {
  const counts = new Uint32Array(colors.length);
  for (const c of cells) if (c !== 65535) counts[c]++;
  const order = Array.from(counts, (_, i) => i)
      .filter((i) => counts[i])
      .sort((a, b) => counts[b] - counts[a]),
    map = new Uint16Array(colors.length);
  const result = order.map((i, j) => {
    map[i] = j;
    const { code, name, hex } = colors[i];
    return { code, name, hex, count: counts[i] };
  });
  for (let i = 0; i < cells.length; i++)
    if (cells[i] !== 65535) cells[i] = map[cells[i]];
  return { cols, rows, cells, colors: result };
}
export function imageToPattern(img, opts) {
  validateImage(img);
  if (
    !opts ||
    ![opts.cols, opts.rows].every(
      (n) => Number.isInteger(n) && n >= 1 && n <= 400,
    ) ||
    !Number.isInteger(opts.maxColors) ||
    opts.maxColors < 2 ||
    opts.maxColors > 80 ||
    (opts.mode !== undefined && !["photo", "chart"].includes(opts.mode))
  )
    throw new RangeError("Invalid pattern options");
  const mode = opts.mode ?? "photo",
    dither = opts.dither ?? 0,
    cleanup = opts.cleanup ?? 0;
  if (
    !Number.isFinite(dither) ||
    dither < 0 ||
    dither > 1 ||
    !Number.isInteger(cleanup) ||
    cleanup < 0 ||
    cleanup > 3
  )
    throw new RangeError("Invalid dither/cleanup");
  let allowed = palette;
  if (opts.allowedCodes !== undefined) {
    if (!Array.isArray(opts.allowedCodes) || !opts.allowedCodes.length)
      throw new RangeError("Empty allowed palette");
    const codes = new Set(opts.allowedCodes.map(String));
    if ([...codes].some((c) => !byCode.has(c)))
      throw new RangeError("Unknown DMC code");
    allowed = palette.filter((c) => codes.has(c.code));
  }
  opts.onProgress?.(0);
  const symbolMask = mode === "chart" && opts.emptyBackground &&
    opts.allowedCodes !== undefined &&
    allowed.some((c) => ["B5200", "Blanc", "3865", "Ecru"].includes(c.code))
    ? new Uint8Array(opts.cols * opts.rows) : undefined;
  const rgb = readCells(img, { ...opts, mode }, symbolMask);
  opts.onProgress?.(0.35);
  const { indices, selected } = quantize(
    rgb,
    opts.maxColors,
    allowed,
    opts.emptyBackground,
    mode === "chart",
    symbolMask,
    opts.cols,
  );
  opts.onProgress?.(0.8);
  if (mode === "photo" && dither && selected.length)
    ditherCells(rgb, indices, selected, opts.cols, dither, allowed);
  if (cleanup) {
    if (mode === "photo") cleanupPhoto(rgb, indices, selected, opts.cols, opts.rows, cleanup);
    else cleanupCells(indices, opts.cols, opts.rows, cleanup);
  }
  const result = pack(opts.cols, opts.rows, indices, selected);
  opts.onProgress?.(1);
  return result;
}
export function replaceColor(pattern, fromCode, toCode) {
  const color = byCode.get(String(toCode));
  if (!color) throw new RangeError("Unknown DMC code");
  const colors = pattern.colors.map((c) => ({ ...c })),
    cells = pattern.cells.slice(),
    from = colors.findIndex((c) => c.code === String(fromCode));
  if (from < 0) return pack(pattern.cols, pattern.rows, cells, colors);
  let to = colors.findIndex((c) => c.code === String(toCode));
  if (to < 0) {
    to = colors.length;
    colors.push(color);
  }
  for (let i = 0; i < cells.length; i++) if (cells[i] === from) cells[i] = to;
  return pack(pattern.cols, pattern.rows, cells, colors);
}
export function removeColor(pattern, code) {
  const from = pattern.colors.findIndex((c) => c.code === String(code));
  if (from < 0)
    return pack(
      pattern.cols,
      pattern.rows,
      pattern.cells.slice(),
      pattern.colors,
    );
  const src = byCode.get(String(code));
  let best = null,
    md = Infinity;
  for (const c of pattern.colors) {
    if (c.code === String(code)) continue;
    const d = deltaE2000(src.lab, byCode.get(c.code).lab);
    if (d < md) {
      md = d;
      best = c;
    }
  }
  if (best) return replaceColor(pattern, code, best.code);
  return {
    cols: pattern.cols,
    rows: pattern.rows,
    cells: new Uint16Array(pattern.cells.length).fill(65535),
    colors: [],
  };
}
export function estimateSkeins(count, aidaCount, strands = 2) {
  if (
    !Number.isFinite(count) ||
    count < 0 ||
    ![11, 14, 16, 18].includes(aidaCount) ||
    !Number.isInteger(strands) ||
    strands < 1 ||
    strands > 6
  )
    throw new RangeError("Invalid thread estimate");
  return (
    (count * ((2 * Math.SQRT2 * 0.0254) / aidaCount + 0.002) * strands * 1.15) /
    48
  );
}
