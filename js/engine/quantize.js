import { rgbToOKLab, photoSpace, photoDistance, photoDistanceFrom, hueCompatible, rgbToLab, deltaE2000 } from "./color.js";
export function quantize(
  rgb,
  maxColors,
  palette,
  emptyBackground,
  chart = false,
  symbolMask,
  cols = rgb.length / 3,
) {
  const n = rgb.length / 3,
    keys = new Int32Array(n),
    weights = new Uint32Array(8192),
    sums = new Float64Array(24576),
    empty = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const p = i * 3,
      r = rgb[p],
      g = rgb[p + 1],
      b = rgb[p + 2];
    if (
      emptyBackground &&
      !symbolMask?.[i] &&
      Math.min(r, g, b) > (chart ? 232 : 205) &&
      Math.max(r, g, b) - Math.min(r, g, b) < (chart ? 14 : 26)
    ) {
      empty[i] = 1;
      continue;
    }
    const k = !chart && !emptyBackground && Math.max(r,g,b)<128 && Math.max(r,g,b)-Math.min(r,g,b)<40
      ? 4096 + (r>>3)*256 + (g>>3)*16 + (b>>3)
      : (r >> 4) * 256 + (g >> 4) * 16 + (b >> 4);
    keys[i] = k;
    weights[k]++;
    sums[k * 3] += r;
    sums[k * 3 + 1] += g;
    sums[k * 3 + 2] += b;
  }
  const labs = new Float64Array(24576),
    active = [];
  for (let k = 0; k < 8192; k++)
    if (weights[k]) {
      active.push(k);
      rgbToLab(
        sums[k * 3] / weights[k],
        sums[k * 3 + 1] / weights[k],
        sums[k * 3 + 2] / weights[k],
        labs,
        k * 3,
      );
    }

  // Keep foreground-on-fabric palette compatibility; full photographs use direct threads.
  if (!chart && !emptyBackground) return quantizePhoto(rgb, weights, sums, active, empty, maxColors, palette, cols);

  // A supplied small legend defines the colours; clustering first would erase rare inks.
  if (chart && palette.length <= maxColors) {
    const map = new Uint16Array(8192);
    for (const k of active) {
      let md = Infinity;
      for (let c = 0; c < palette.length; c++) {
        const d = deltaE2000(labs.subarray(k * 3, k * 3 + 3), palette[c].lab);
        if (d < md) {
          md = d;
          map[k] = c;
        }
      }
    }
    return {
      indices: Uint16Array.from(keys, (k, i) => (empty[i] ? 65535 : map[k])),
      selected: palette,
    };
  }
  const K = Math.min(maxColors, active.length, palette.length),
    centers = new Float64Array(K * 3),
    dist = new Float64Array(8192).fill(Infinity),
    assign = new Uint16Array(8192);
  if (!K) return { indices: new Uint16Array(n).fill(65535), selected: [] };
  let seed = active.reduce((a, b) => (weights[a] > weights[b] ? a : b)),
    rng = 1234567;
  for (let c = 0; c < K; c++) {
    centers.set(labs.subarray(seed * 3, seed * 3 + 3), c * 3);
    let total = 0;
    for (const k of active) {
      let d = 0;
      for (let j = 0; j < 3; j++)
        d += (labs[k * 3 + j] - centers[c * 3 + j]) ** 2;
      dist[k] = Math.min(dist[k], d);
      total += dist[k] * (chart ? Math.sqrt(weights[k]) : weights[k]);
    }
    rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0;
    let target = (total * rng) / 4294967296;
    for (const k of active) {
      target -= dist[k] * (chart ? Math.sqrt(weights[k]) : weights[k]);
      if (target <= 0) {
        seed = k;
        break;
      }
    }
    // Reserve the last chart seed for a rare, distant ink (e.g. yellow stamens).
    if (chart && c === K - 2) {
      let max = -1;
      for (const k of active) {
        const score = dist[k] * weights[k] ** 0.15;
        if (score > max) {
          max = score;
          seed = k;
        }
      }
    }
  }
  const acc = new Float64Array(K * 3),
    counts = new Float64Array(K);
  for (let iter = 0; iter < 10; iter++) {
    acc.fill(0);
    counts.fill(0);
    let changed = 0;
    for (const k of active) {
      let best = 0,
        md = Infinity;
      const p = k * 3;
      for (let c = 0; c < K; c++) {
        const t = c * 3,
          d =
            (labs[p] - centers[t]) ** 2 +
            (labs[p + 1] - centers[t + 1]) ** 2 +
            (labs[p + 2] - centers[t + 2]) ** 2;
        if (d < md) {
          md = d;
          best = c;
        }
      }
      if (assign[k] !== best) changed++;
      assign[k] = best;
      counts[best] += chart ? Math.sqrt(weights[k]) : weights[k];
      for (let j = 0; j < 3; j++)
        acc[best * 3 + j] +=
          labs[p + j] * (chart ? Math.sqrt(weights[k]) : weights[k]);
    }
    for (let c = 0; c < K; c++)
      if (counts[c])
        for (let j = 0; j < 3; j++)
          centers[c * 3 + j] = acc[c * 3 + j] / counts[c];
    if (iter > 0 && !changed) break;
  }
  const selected = [],
    mapping = new Uint16Array(K),
    used = new Set(),
    order = Array.from({ length: K }, (_, i) => i).sort(
      (a, b) => counts[b] - counts[a],
    );
  for (const c of order) {
    if (!counts[c]) continue;
    const lab = centers.subarray(c * 3, c * 3 + 3);
    let best = palette[0],
      md = Infinity,
      unused = null,
      ud = Infinity;
    for (const color of palette) {
      const d = deltaE2000(lab, color.lab);
      if (d < md) {
        md = d;
        best = color;
      }
      if (!used.has(color.code) && d < ud) {
        ud = d;
        unused = color;
      }
    }
    // Preserve distinct clusters when the alternative is perceptually comparable.
    if (used.has(best.code) && unused && ud <= md + 3) best = unused;
    let ix = selected.indexOf(best);
    if (ix < 0) {
      ix = selected.length;
      selected.push(best);
      used.add(best.code);
    }
    mapping[c] = ix;
  }
  const indices = new Uint16Array(n);
  for (let i = 0; i < n; i++)
    indices[i] = empty[i] ? 65535 : mapping[assign[keys[i]]];
  return { indices, selected };
}
export function ditherCells(rgb, indices, selected, cols, amount, palette = selected) {
  const work = new Float32Array(rgb),
    n = indices.length,
    labs = new Float64Array(3);
  const rows = Math.ceil(n / cols);
  const space=photoSpace(palette);
  // Diffused error cannot relax source constraints.
  const original=new Float64Array(3);
  const selectedOK=selected.map(c=>c.oklab ?? rgbToOKLab(...c.rgb));
  for (let y = 0; y < rows; y++) {
    const direction = y % 2 ? -1 : 1;
    for (let step = 0; step < cols; step++) {
      const x = direction > 0 ? step : cols - 1 - step, i = y * cols + x;
      if (i >= n || indices[i] === 65535) continue;
      const p = i * 3;
      rgbToOKLab(work[p], work[p + 1], work[p + 2], labs);
      rgbToOKLab(rgb[p],rgb[p+1],rgb[p+2],original);
      const mapped=space.map(labs);
      let best = 0, md = Infinity;
      const distance = photoDistanceFrom(mapped);
      for (let c = 0; c < selected.length; c++) {
        const l = selectedOK[c];
        const penalty=hueCompatible(original,l)?0:1e6;
        if (penalty > md) continue;
        const lower=10000*((mapped[0]<.45 && mapped.chroma<.06)?.45:.21)*(mapped[0]-l[0])**2;
        if (lower+penalty > md+1e-9) continue;
        const d = distance(l) + penalty;
        if (d < md) { md = d; best = c; }
      }
      indices[i] = best;
      const targets = [[x + direction, y, 7], [x - direction, y + 1, 3],
        [x, y + 1, 5], [x + direction, y + 1, 1]];
      for (const [xx, yy, weight] of targets) {
        if (xx < 0 || xx >= cols || yy >= rows) continue;
        const j = yy * cols + xx;
        if (j >= n || indices[j] === 65535) continue;
        // Flat patches never accumulate error into a checkerboard; edges don't bleed.
        const gradient = Math.hypot(rgb[p] - rgb[j*3], rgb[p+1] - rgb[j*3+1], rgb[p+2] - rgb[j*3+2]);
        if (gradient < 2 || gradient > 60) continue;
        for (let c = 0; c < 3; c++) {
          const e = Math.max(-16, Math.min(16, work[p+c] - selected[best].rgb[c]));
          work[j*3+c] += e * amount * weight / 16;
        }
      }
    }
  }
}

export function cleanupCells(cells, cols, rows, level) {
  for (let pass = 0; pass < level; pass++) {
    const src = cells.slice();
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < cols; x++) {
        const i = y * cols + x,
          own = src[i];
        if (own === 65535) continue;
        let same = 0,
          best = own,
          count = 0;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            if (
              (!dx && !dy) ||
              x + dx < 0 ||
              x + dx >= cols ||
              y + dy < 0 ||
              y + dy >= rows
            )
              continue;
            const c = src[(y + dy) * cols + x + dx];
            if (c === own) same++;
            if (c === 65535) continue;
            let votes = 0;
            for (
              let yy = Math.max(0, y - 1);
              yy <= Math.min(rows - 1, y + 1);
              yy++
            )
              for (
                let xx = Math.max(0, x - 1);
                xx <= Math.min(cols - 1, x + 1);
                xx++
              )
                if ((xx !== x || yy !== y) && src[yy * cols + xx] === c)
                  votes++;
            if (votes > count) {
              count = votes;
              best = c;
            }
          }
        if (same === 0 && count >= 3) cells[i] = best;
      }
  }
}

// Select real threads after hue-preserving radial gamut compression.
function quantizePhoto(rgb, weights, sums, active, empty, maxColors, palette, cols) {
  const H = active.length, P = palette.length, K = Math.min(maxColors, P, H);
  if (!K) return { indices: new Uint16Array(empty.length).fill(65535), selected: [] };
  const space=photoSpace(palette);
  const source=active.map(k=>rgbToOKLab(sums[k*3]/weights[k],sums[k*3+1]/weights[k],sums[k*3+2]/weights[k]));
  const mapped=source.map(a=>space.map(a));
  const histogramWeights = Float64Array.from(active, k => weights[k] ** 0.75);
  const costs = new Float32Array(H * P), best = new Float32Array(H).fill(Infinity);
  for (let h = 0; h < H; h++) {
    const distance = photoDistanceFrom(mapped[h]);
    for (let c = 0; c < P; c++) {
      const l = space.colors[c];
      // Selection anticipates final cell eligibility.
      costs[h * P + c] = distance(l) + (hueCompatible(source[h],l)?0:300);
    }
  }
  const byThread = new Float32Array(H * P);
  for (let c = 0; c < P; c++) for (let h = 0; h < H; h++) byThread[c * H + h] = costs[h * P + c];
  const chosen = [], used = new Uint8Array(P);
  // Reserve coverage for significant dark hue regions, independently of bright detail.
  // Adjacent hue bins share candidates; never reserve unavailable thread codes.
  const regions=new Map();
  for(let h=0;h<H;h++) {
    const a=source[h];
    if(a[0]>=.45 || a.chroma<=.02 || a.chroma>=.06) continue;
    const key=Math.floor(((Math.atan2(a[2],a[1])*180/Math.PI+360)%360)/30);
    if(!regions.has(key)) regions.set(key,[]);
    regions.get(key).push(h);
  }
  const significant=[...regions.values()].filter(hs=>hs.reduce((n,h)=>n+weights[active[h]],0)>=Math.max(8,empty.length*.003))
    .sort((a,b)=>b.reduce((n,h)=>n+weights[active[h]]*source[h].chroma,0)-a.reduce((n,h)=>n+weights[active[h]]*source[h].chroma,0));
  // Diminishing coverage gains bound the next gain. Re-evaluate only candidates
  // that can still win; exact errors and original palette order decide all ties.
  const gains = new Float64Array(P).fill(Infinity);
  const candidates = Array.from({length:P},(_,i)=>i);
  for (let step = chosen.length; step < K; step++) {
    let total=0;
    for(let h=0;h<H;h++) total+=histogramWeights[h]*best[h];
    const slack=Number.isFinite(total)?Math.max(1,total)*1e-10:0;
    candidates.sort((a,b)=>gains[b]-gains[a] || a-b);
    let winner = 0, score = Infinity;
    for (const c of candidates) {
      if (used[c]) continue;
      if (Number.isFinite(total) && gains[c]+slack < total-score) break;
      let error = 0;
      for (let h = 0; h < H; h++) {
        error += histogramWeights[h] * Math.min(best[h], byThread[c * H + h]);
        if (step === 0 && error > score) break;
      }
      // A partial sum gives an upper bound too. Slack covers summation roundoff.
      if(Number.isFinite(total)) gains[c]=Math.min(gains[c],total-error+slack);
      if (error < score || (error === score && c < winner)) { score = error; winner = c; }
    }
    chosen.push(winner); used[winner] = 1;
    for (let h = 0; h < H; h++) best[h] = Math.min(best[h], costs[h * P + winner]);
  }
  // Constrained updates: each cluster chooses the real thread minimizing its error.
  for (let pass = 0; pass < 4; pass++) {
    const errors = new Float64Array(K * P), counts = new Float64Array(K);
    for (let h = 0; h < H; h++) {
      let md = Infinity, ix = 0;
      for (let c = 0; c < K; c++) {
        const d = costs[h * P + chosen[c]];
        if (d < md) { md = d; ix = c; }
      }
      const w = histogramWeights[h]; counts[ix] += w;
      if (pass < 3) for (let p = 0; p < P; p++) errors[ix * P + p] += costs[h * P + p] * w;
    }
    if (pass === 3) break;
    used.fill(0);
    let changed = false;
    for (let c = 0; c < K; c++) {
      if (!counts[c]) { used[chosen[c]] = 1; continue; }
      let md = Infinity, winner = chosen[c];
      for (let p = 0; p < P; p++) {
        if (used[p]) continue;
        const d = errors[c * P + p];
        if (d < md) { md = d; winner = p; }
      }
      if (chosen[c] !== winner) changed = true;
      chosen[c] = winner; used[winner] = 1;
    }
    if (!changed) break;
  }
  // Connected muted shadows count as regions, rather than many tiny histogram bins.
  const cellOK=Array.from(empty,(_,i)=>rgbToOKLab(rgb[i*3],rgb[i*3+1],rgb[i*3+2]));
  const weak=new Int8Array(empty.length).fill(-1), seen=new Uint8Array(empty.length), regional=new Uint8Array(empty.length);
  for(let i=0;i<weak.length;i++) {
    const a=cellOK[i];
    if(a[0]<.45 && a.chroma>.001 && a.chroma<.03)
      weak[i]=Math.floor((Math.atan2(a[2],a[1])*180/Math.PI+360)%360/60);
  }
  const patches=[];
  for(let i=0;i<weak.length;i++) {
    if(weak[i]<0 || seen[i]) continue;
    const queue=[i], mean=[0,0,0]; seen[i]=1;
    for(let t=0;t<queue.length;t++) {
      const j=queue[t], a=cellOK[j];
      for(let c=0;c<3;c++) mean[c]+=a[c];
      for(const k of [j%cols?j-1:-1,(j+1)%cols?j+1:-1,j-cols,j+cols]) {
        if(k<0 || k>=weak.length || seen[k] || weak[k]!==weak[i] || Math.abs(a[0]-cellOK[k][0])>.05) continue;
        seen[k]=1;queue.push(k);
      }
    }
    if(queue.length>=Math.max(16,weak.length*.01)) patches.push({cells:queue,mean:mean.map(v=>v/queue.length)});
  }
  const protectedColors=new Set();
  function reserve(winner) {
    if(winner<0) return;
    if(chosen.includes(winner)) {protectedColors.add(winner);return;}
    const nearest=new Float32Array(H), runnerUp=new Float32Array(H), owner=new Uint16Array(H);
    for(let h=0;h<H;h++) {
      let first=Infinity,second=Infinity,ix=0;
      for(let c=0;c<K;c++) {
        const d=costs[h*P+chosen[c]];
        if(d<first) {second=first;first=d;ix=c;} else if(d<second) second=d;
      }
      nearest[h]=first;runnerUp[h]=second;owner[h]=ix;
    }
    let slot=-1, loss=Infinity;
    for(let c=0;c<K;c++) {
      if(protectedColors.has(chosen[c])) continue;
      let error=0;
      for(let h=0;h<H;h++) {
        const d=Math.min(costs[h*P+winner],owner[h]===c?runnerUp[h]:nearest[h]);
        error+=histogramWeights[h]*d;
      }
      if(error<loss) {loss=error;slot=c;}
    }
    if(slot>=0) {chosen[slot]=winner;protectedColors.add(winner);}
  }
  const regionCompatible=(a,b)=> {
    const ca=a.chroma??Math.hypot(a[1],a[2]);
    return b.chroma<=1.3*ca+(a[0]<.3?.015:.03) && b.chroma>=.4*ca && Math.abs(a[0]-b[0])<.16 &&
      a[1]*b[1]+a[2]*b[2]>=ca*b.chroma*Math.cos(ca<.008 ? Math.PI/3 : Math.PI/4);
  };
  for(const patch of patches.sort((a,b)=>b.cells.length-a.cells.length).slice(0,Math.max(1,Math.floor(K/6)))) {
    let winner=-1, score=Infinity;
    for(let c=0;c<P;c++) if(regionCompatible(patch.mean,space.colors[c])) {
      const d=photoDistance(patch.mean,space.colors[c]);
      if(d<score) {winner=c;score=d;}
    }
    reserve(winner);
    if(winner>=0) for(const i of patch.cells) regional[i]=1;
  }
  for(const hs of significant.slice(0,Math.max(1,Math.floor(K/5)))) {
    let covered=0, total=0;
    for(const h of hs) {
      const w=weights[active[h]]; total+=w;
      if(chosen.some(c=>regionCompatible(source[h],space.colors[c]))) covered+=w;
    }
    if(covered>=.9*total) continue;
    let winner=-1, score=Infinity;
    for(let c=0;c<P;c++) {
      let error=0;
      for(const h of hs) error+=weights[active[h]]*(photoDistance(source[h],space.colors[c])+(regionCompatible(source[h],space.colors[c])?0:10000));
      if(error<score) {score=error;winner=c;}
    }
    reserve(winner);
  }
  const selected = [...new Set(chosen)].map(c => palette[c]);
  const indices = new Uint16Array(empty.length);
  const selectedOK=selected.map(c=>c.oklab ?? rgbToOKLab(...c.rgb));
  for (let i = 0; i < indices.length; i++) {
    if (empty[i]) { indices[i] = 65535; continue; }
    const lab=cellOK[i], mapped=space.map(lab);
    let md = Infinity;
    const distance = photoDistanceFrom(mapped);
    for (let c = 0; c < selected.length; c++) {
      // Regional support never overrides eligibility.
      const preference=regional[i] && !regionCompatible(lab,selectedOK[c]) ? 28 : 0;
      const penalty=hueCompatible(lab,selectedOK[c])?0:1e6;
      if (preference+penalty > md) continue;
      const lower=10000*((mapped[0]<.45 && mapped.chroma<.06)?.45:.21)*(mapped[0]-selectedOK[c][0])**2;
      if (lower+preference+penalty > md+1e-9) continue;
      const d = preference + distance(selectedOK[c]) + penalty;
      if (d < md) { md = d; indices[i] = c; }
    }
  }
  return { indices, selected };
}

// Sequential four-connected cleanup cannot swap adjacent confetti back and forth.
// Retain high-contrast detail when joining a neighbour would add too much error.
export function cleanupPhoto(rgb, cells, selected, cols, rows, level) {
  const labs = new Float64Array(rgb.length), ready = new Uint8Array(cells.length);
  const selectedOK=selected.map(c=>c.oklab ?? rgbToOKLab(...c.rgb)), targets=new Array(cells.length);
  function prepare(i) {
    if (ready[i]) return;
    rgbToLab(rgb[i*3],rgb[i*3+1],rgb[i*3+2],labs,i*3);
    ready[i]=1;
  }
  const distance = (i, c) => Math.hypot(labs[i*3]-selected[c].lab[0],
    labs[i*3+1]-selected[c].lab[1], labs[i*3+2]-selected[c].lab[2]);
  for (let pass = 0; pass < level * 4; pass++) {
    let changed = false;
    for (let t = 0; t < cells.length; t++) {
      const i = pass % 2 ? cells.length - 1 - t : t, own = cells[i];
      if (own === 65535) continue;
      const x = i % cols, y = Math.floor(i / cols);
      if ((x && cells[i-1] === own) || (x+1<cols && cells[i+1] === own) ||
          (y && cells[i-cols] === own) || (y+1<rows && cells[i+cols] === own)) continue;
      prepare(i);
      targets[i] ??= rgbToOKLab(rgb[i*3],rgb[i*3+1],rgb[i*3+2]);
      const neighbours = [];
      if (x) neighbours.push(i - 1);
      if (x + 1 < cols) neighbours.push(i + 1);
      if (y) neighbours.push(i - cols);
      if (y + 1 < rows) neighbours.push(i + cols);

      let best = own, score = Infinity;
      const original = distance(i, own);
      for (const j of neighbours) {
        const c = cells[j];
        if (c === 65535) continue;
        prepare(j);
        const d = distance(i, c);
        let votes = 0;
        for (const k of neighbours) if (cells[k] === c) votes++;
        // Texture may straddle quantizer boundaries without a real source edge.
        const sourceGap=Math.hypot(labs[i*3]-labs[j*3],labs[i*3+1]-labs[j*3+1],labs[i*3+2]-labs[j*3+2]);
        if (d - original <= 5 + level * 2 + (sourceGap<(targets[i][0]<.45 ? 14 : 10) ? 4 : 0) &&
          (!hueCompatible(targets[i],selectedOK[own]) || hueCompatible(targets[i],selectedOK[c])) &&
          photoDistance(targets[i],selectedOK[c]) <= photoDistance(targets[i],selectedOK[own]) + 150 &&
          d - votes * 2 < score) {
          best = c; score = d - votes * 2;
        }
      }
      if (best !== own) changed = true;
      cells[i] = best;
    }
    if (!changed) break;
  }
}
