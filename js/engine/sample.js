import { imageMap } from "./geometry.js";
// Pixel-centred bilinear sampling, alpha composited onto white paper.
export function sample(img, h, u, v, out) {
  const w = h[6] * u + h[7] * v + 1,
    x = Math.max(
      0,
      Math.min(img.width - 1, (h[0] * u + h[1] * v + h[2]) / w - 0.5),
    ),
    y = Math.max(
      0,
      Math.min(img.height - 1, (h[3] * u + h[4] * v + h[5]) / w - 0.5),
    );
  const ix = Math.floor(x),
    iy = Math.floor(y),
    fx = x - ix,
    fy = y - iy,
    d = img.data;
  out.fill(0);
  for (let j = 0; j < 2; j++)
    for (let i = 0; i < 2; i++) {
      const p =
          (Math.min(img.height - 1, iy + j) * img.width +
            Math.min(img.width - 1, ix + i)) *
          4,
        t = (i ? fx : 1 - fx) * (j ? fy : 1 - fy),
        a = d[p + 3] / 255;
      for (let c = 0; c < 3; c++) out[c] += t * (d[p + c] * a + 255 * (1 - a));
    }
}
export function readCells(img, opts, symbolMask) {
  const { cols, rows, mode } = opts,
    h = imageMap(img, opts.quad),
    rgb = new Float32Array(cols * rows * 3),
    tmp = new Float64Array(3);
  const q = opts.quad ?? [
    [0, 0],
    [img.width, 0],
    [img.width, img.height],
    [0, img.height],
  ];
  const nx = Math.min(
    32,
    Math.max(
      2,
      Math.ceil(
        Math.max(
          Math.hypot(q[1][0] - q[0][0], q[1][1] - q[0][1]),
          Math.hypot(q[2][0] - q[3][0], q[2][1] - q[3][1]),
        ) / cols,
      ),
    ),
  );
  const ny = Math.min(
    32,
    Math.max(
      2,
      Math.ceil(
        Math.max(
          Math.hypot(q[3][0] - q[0][0], q[3][1] - q[0][1]),
          Math.hypot(q[2][0] - q[1][0], q[2][1] - q[1][1]),
        ) / rows,
      ),
    ),
  );
  const bins = new Uint16Array(4096),
    sums = new Float64Array(4096 * 3),
    used = new Uint16Array(1024),
    luminance = new Float64Array(nx * ny),
    rowLight = new Float64Array(ny),
    colLight = new Float64Array(nx);
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++) {
      const p = (y * cols + x) * 3;
      if (mode === "chart") {
        let n = 0,
          best = 0,
          bestScore = -1,
          low = 255, high = 0, chromatic = 0;
        for (let j = 0; j < ny; j++)
          for (let i = 0; i < nx; i++) {
            const sx = (i + 0.5) / nx,
              sy = (j + 0.5) / ny;
            const diagonal = nx >= 4 && ny >= 4 &&
              (Math.abs(sx - sy) < 0.16 || Math.abs(sx + sy - 1) < 0.16);
            if (diagonal && !symbolMask) continue;
            sample(
              img,
              h,
              (x + 0.18 + 0.64 * sx) / cols,
              (y + 0.18 + 0.64 * sy) / rows,
              tmp,
            );
            // Inspect diagonals for occupancy even when excluded from fill voting.
            if (symbolMask) {
              const lum = (tmp[0] + tmp[1] + tmp[2]) / 3;
              luminance[j * nx + i] = lum;
              if (Math.max(...tmp) - Math.min(...tmp) > 25) chromatic++;
              low = Math.min(low, lum);
              high = Math.max(high, lum);
            }
            if (diagonal) continue;
            const key =
              (tmp[0] >> 4) * 256 + (tmp[1] >> 4) * 16 + (tmp[2] >> 4);
            if (!bins[key]) used[n++] = key;
            bins[key]++;
            for (let c = 0; c < 3; c++) sums[key * 3 + c] += tmp[c];
          }
        if (symbolMask) {
          // Inspect the central half: neighbouring outlines can enter cell edges.
          const x0 = Math.floor(nx / 4), x1 = nx - x0,
            y0 = Math.floor(ny / 4), y1 = ny - y0,
            area = (x1 - x0) * (y1 - y0);
          rowLight.fill(0); colLight.fill(0);
          let mean = 0, energy = 0;
          for (let j = y0; j < y1; j++)
            for (let i = x0; i < x1; i++) {
              const v = luminance[j * nx + i];
              mean += v / area;
              rowLight[j] += v / (x1 - x0);
              colLight[i] += v / (y1 - y0);
            }
          // Remove straight grid rules: their intensity depends on one axis only.
          for (let j = y0; j < y1; j++)
            for (let i = x0; i < x1; i++)
              energy += (luminance[j * nx + i] - rowLight[j] - colLight[i] + mean) ** 2;
          symbolMask[y * cols + x] = chromatic === 0 && high - low > 28 &&
            energy / area > 36 ? 1 : 0;
        }

        // White X strokes and black outlines must not outvote coloured fill.
        let colored = 0,
          total = 0;
        for (let k = 0; k < n; k++) {
          const b = used[k],
            chroma =
              (Math.max(sums[b * 3], sums[b * 3 + 1], sums[b * 3 + 2]) -
                Math.min(sums[b * 3], sums[b * 3 + 1], sums[b * 3 + 2])) /
              bins[b];
          total += bins[b];
          if (chroma > 25) colored += bins[b];
        }
        for (let k = 0; k < n; k++) {
          const b = used[k],
            chroma =
              (Math.max(sums[b * 3], sums[b * 3 + 1], sums[b * 3 + 2]) -
                Math.min(sums[b * 3], sums[b * 3 + 1], sums[b * 3 + 2])) /
              bins[b];
          if (colored > total * 0.12 && chroma <= 25) continue;
          const score = bins[b] * (1 + chroma / 255);
          if (score > bestScore) {
            bestScore = score;
            best = b;
          }
        }
        for (let c = 0; c < 3; c++)
          rgb[p + c] = sums[best * 3 + c] / bins[best];
        for (let k = 0; k < n; k++) {
          const b = used[k];
          bins[b] = 0;
          sums[b * 3] = sums[b * 3 + 1] = sums[b * 3 + 2] = 0;
        }
      } else if (
        Math.abs(h[1]) + Math.abs(h[3]) + Math.abs(h[6]) + Math.abs(h[7]) <
        1e-10
      ) {
        // Exact source-pixel area weights for rectangular crops (no sampling alias).
        const left = Math.max(0, (h[0] * x) / cols + h[2]),
          right = Math.min(img.width, (h[0] * (x + 1)) / cols + h[2]);
        const top = Math.max(0, (h[4] * y) / rows + h[5]),
          bottom = Math.min(img.height, (h[4] * (y + 1)) / rows + h[5]);
        let area = 0;
        for (let yy = Math.floor(top); yy < Math.ceil(bottom); yy++)
          for (let xx = Math.floor(left); xx < Math.ceil(right); xx++) {
            const weight =
              (Math.min(xx + 1, right) - Math.max(xx, left)) *
              (Math.min(yy + 1, bottom) - Math.max(yy, top));
            const k = (yy * img.width + xx) * 4,
              a = img.data[k + 3] / 255;
            area += weight;
            for (let c = 0; c < 3; c++)
              rgb[p + c] += weight * (img.data[k + c] * a + 255 * (1 - a));
          }
        for (let c = 0; c < 3; c++) rgb[p + c] = area ? rgb[p + c] / area : 255;
      } else {
        // Stratified area integration; many source pixels contribute to every output stitch.
        for (let j = 0; j < ny; j++)
          for (let i = 0; i < nx; i++) {
            sample(
              img,
              h,
              (x + (i + 0.5) / nx) / cols,
              (y + (j + 0.5) / ny) / rows,
              tmp,
            );
            for (let c = 0; c < 3; c++) rgb[p + c] += tmp[c] / (nx * ny);
          }
      }
    }
  // Estimate channel gains from bright, neutral paper, never from coloured fill.
  if (mode === "chart") {
    const hist = new Uint32Array(256),
      white = new Float64Array(3);
    let total = 0;
    for (let p = 0; p < rgb.length; p += 3) {
      const lo = Math.min(rgb[p], rgb[p + 1], rgb[p + 2]),
        hi = Math.max(rgb[p], rgb[p + 1], rgb[p + 2]);
      if (lo > 180 && hi - lo < 30) {
        hist[Math.round((rgb[p] + rgb[p + 1] + rgb[p + 2]) / 3)]++;
        total++;
      }
    }
    let sum = 0,
      threshold = 255;
    while (threshold > 180 && sum < total * 0.3) sum += hist[threshold--];
    let count = 0;
    for (let p = 0; p < rgb.length; p += 3) {
      const lo = Math.min(rgb[p], rgb[p + 1], rgb[p + 2]),
        hi = Math.max(rgb[p], rgb[p + 1], rgb[p + 2]);
      if (
        lo > 180 &&
        hi - lo < 30 &&
        (rgb[p] + rgb[p + 1] + rgb[p + 2]) / 3 > threshold
      ) {
        for (let c = 0; c < 3; c++) white[c] += rgb[p + c];
        count++;
      }
    }
    if (count > Math.max(4, cols * rows * 0.01))
      for (let p = 0; p < rgb.length; p += 3)
        for (let c = 0; c < 3; c++)
          rgb[p + c] = Math.min(255, (rgb[p + c] * 255) / (white[c] / count));
  }
  if (mode === "chart") {
    // Bounded chroma expansion compensates paper dilution; preserve neutral paper.
    for (let p = 0; p < rgb.length; p += 3) {
      const gray = (rgb[p] + rgb[p + 1] + rgb[p + 2]) / 3;
      for (let c = 0; c < 3; c++)
        rgb[p + c] = Math.max(
          0,
          Math.min(255, gray + (rgb[p + c] - gray) * 1.35),
        );
    }
  }

  return rgb;
}
