import { validateImage, imageMap } from "./geometry.js";
import { sample } from "./sample.js";
function period(profile) {
  const n = profile.length;
  let mean = 0;
  for (const v of profile) mean += v / n;
  let variance = 0;
  for (const v of profile) variance += (v - mean) ** 2;
  if (variance < 0.05 * n) return null;
  // Search directly in cell-count space. Grid lines repeat with common phase;
  // motifs and lettering generally do not. Harmonics require an explicit penalty.
  let best = null;
  const scores = [];
  for (let count = 4; count <= Math.min(400, Math.floor(n / 2)); count++) {
    const step = n / count;
    let cos = 0,
      sin = 0;
    for (let i = 0; i < n; i++) {
      const v = profile[i] - mean,
        a = (2 * Math.PI * i) / step;
      cos += v * Math.cos(a);
      sin += v * Math.sin(a);
    }
    const score = (cos * cos + sin * sin) / variance / n;
    scores[count] = score;
    if (!best || score > best.score) best = { count, score };
  }
  if (!best || best.score < 0.012) return null;
  // Broad lines can yield a stronger second harmonic; prefer supported fundamental.
  for (let div = 2; div <= 3; div++) {
    const c = Math.round(best.count / div);
    if (scores[c] > 0.6 * best.score) {
      best = { count: c, score: scores[c] };
      break;
    }
  }
  const background = scores.filter(Number.isFinite).sort((a, b) => a - b);
  const noise = background[Math.floor(background.length / 2)];
  // Spectral prominence above the noise floor, not fraction of all ink energy.
  // This is an evidence score, not a probability of correct cell counts.
  best.confidence = 1 - Math.exp(-Math.max(0, best.score / noise - 5) / 18);
  return best;
}
function detectCropped(img, quad) {
  validateImage(img);
  const h = imageMap(img, quad),
    q = quad ?? [
      [0, 0],
      [img.width, 0],
      [img.width, img.height],
      [0, img.height],
    ];
  const w = Math.min(
    1800,
    Math.round(
      (Math.hypot(q[1][0] - q[0][0], q[1][1] - q[0][1]) +
        Math.hypot(q[2][0] - q[3][0], q[2][1] - q[3][1])) /
        2,
    ),
  );
  const ht = Math.min(
    1800,
    Math.round(
      (Math.hypot(q[3][0] - q[0][0], q[3][1] - q[0][1]) +
        Math.hypot(q[2][0] - q[1][0], q[2][1] - q[1][1])) /
        2,
    ),
  );
  const px = new Float64Array(w),
    py = new Float64Array(ht),
    tmp = new Float64Array(3);
  // Dark line projections, with RGB neutrality suppressing coloured embroidery.
  for (let y = 0; y < ht; y++)
    for (let x = 0; x < w; x++) {
      sample(img, h, (x + 0.5) / w, (y + 0.5) / ht, tmp);
      const min = Math.min(...tmp),
        max = Math.max(...tmp),
        lum = (tmp[0] + tmp[1] + tmp[2]) / 3;
      const ink =
        lum < 220 && max - min < 30 ? (255 - lum) * (1 - (max - min) / 30) : 0;
      px[x] += ink / ht;
      py[y] += ink / w;
    }
  if (Math.max(...px) < 30 || Math.max(...py) < 30) return null;
  const a = period(px),
    b = period(py);
  return a && b
    ? {
        cols: a.count,
        rows: b.count,
        confidence: Math.min(a.confidence, b.confidence),
      }
    : null;
}

// Outer borders must span most of both axes. Short legend boxes cannot qualify.
export function detectGridBounds(img, hintQuad) {
  validateImage(img);
  if (hintQuad) imageMap(img, hintQuad); // Same validation contract as detectGrid.
  const { width: w, height: h, data: d } = img;
  const horizontal = new Float64Array(h),
    vertical = new Float64Array(w);
  for (let axis = 0; axis < 2; axis++) {
    const lines = axis ? w : h,
      length = axis ? h : w,
      out = axis ? vertical : horizontal;
    for (let a = 0; a < lines; a++) {
      let start = 0,
        last = -10,
        best = 0;
      for (let b = 0; b < length; b++) {
        const p = (axis ? b * w + a : a * w + b) * 4;
        const lo = Math.min(d[p], d[p + 1], d[p + 2]),
          hi = Math.max(d[p], d[p + 1], d[p + 2]);
        if (hi - lo < 30 && hi < 190 && d[p + 3] > 200) {
          if (b - last > 3) start = b;
          last = b;
          best = Math.max(best, b - start + 1);
        }
      }
      out[a] = best;
    }
  }
  function extent(p, min, ratio = 0.9) {
    const max = p.reduce((a, b) => Math.max(a, b), 0);
    if (max < min) return null;
    const indices = [];
    for (let i = 0; i < p.length; i++) if (p[i] >= max * ratio) indices.push(i);
    return [indices[0], indices.at(-1)];
  }
  const xs = extent(vertical, h * 0.45, 0.7),
    ys = extent(horizontal, w * 0.65);
  if (!xs || !ys || xs[1] - xs[0] < w * 0.5 || ys[1] - ys[0] < h * 0.45)
    return null;
  const quad = [
    [xs[0], ys[0]],
    [xs[1], ys[0]],
    [xs[1], ys[1]],
    [xs[0], ys[1]],
  ];
  const grid = detectCropped(img, quad);
  return grid ? { quad, ...grid } : null;
}
export function detectGrid(img, quad) {
  validateImage(img);
  if (quad) imageMap(img, quad);
  const bounds = detectGridBounds(img);
  const full =
    !quad ||
    quad.every(
      (p, i) =>
        Math.abs(p[0] - (i === 1 || i === 2 ? img.width : 0)) <
          img.width * 0.06 &&
        Math.abs(p[1] - (i >= 2 ? img.height : 0)) < img.height * 0.06,
    );
  if (
    bounds &&
    (full ||
      quad.every(
        (p, i) =>
          Math.hypot(p[0] - bounds.quad[i][0], p[1] - bounds.quad[i][1]) <
          Math.max(img.width, img.height) * 0.06,
      ))
  ) {
    const { cols, rows, confidence } = bounds;
    return { cols, rows, confidence };
  }
  return detectCropped(img, quad);
}
