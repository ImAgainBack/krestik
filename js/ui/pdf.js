import { symbolFor } from "./symbols.js";
import { dmcNameRu } from "../i18n/dmc-names-ru.js";
import { plan, TOP, NUM, ROWH, legendLayout } from "./pdf-plan.js";
const PT_W = 595.28,
  PT_H = 841.89;
const FONT = (size, weight = "") => `${weight} ${size}px Roboto, "Segoe UI", "DejaVu Sans", sans-serif`;
const SYMFONT = (size) => `bold ${size}px "DejaVu Sans", "Segoe UI Symbol", Roboto, sans-serif`;

function isDark(hex) {
  const n = parseInt(hex.replace(/^#/, ""), 16);
  return ((n >> 16) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 1000 < 135;
}

export function thumb(p) {
  const t = document.createElement("canvas");
  t.width = p.cols;
  t.height = p.rows;
  const x = t.getContext("2d"),
    img = x.createImageData(p.cols, p.rows);
  p.cells.forEach((v, k) => {
    const n =
      v === 0xffff ? 0xffffff : parseInt(p.colors[v].hex.replace(/^#/, ""), 16);
    img.data.set([n >> 16, (n >> 8) & 255, n & 255, 255], k * 4);
  });
  x.putImageData(img, 0, 0);
  return t;
}

function fitText(x, text, max) {
  if (x.measureText(text).width <= max) return text;
  while (text.length > 1 && x.measureText(text + "…").width > max) text = text.slice(0, -1);
  return text + "…";
}

export function drawPage(canvas, s, project, pl, k, mode = "color", thumbnail = thumb(project.pattern), band = null) {
  const p = project.pattern;
  const { W, H, cell } = pl, part = pl.parts[k], n = pl.parts.length, M = pl.m;
  canvas.width = Math.round(W * s); canvas.height = band?.height ?? Math.round(H * s);
  const x = canvas.getContext("2d");
  if (!x) throw new Error("Canvas allocation failed");
  x.setTransform(s, 0, 0, s, 0, -(band?.top ?? 0));
  x.fillStyle = "#fff"; x.fillRect(0, 0, W, H);

  // Title only, plus the sheet number and the locator picture for multi-sheet patterns.
  let right = W - M;
  if (n > 1) {
    const th = 6, tw = Math.min(11, th * p.cols / p.rows), tx = W - M - tw, ty = M - 1;
    x.imageSmoothingEnabled = false;
    x.drawImage(thumbnail, tx, ty, tw, th);
    x.strokeStyle = "#0007"; x.lineWidth = 0.15; x.strokeRect(tx, ty, tw, th);
    x.strokeStyle = "#d4161c"; x.lineWidth = 0.6;
    x.strokeRect(tx + part.c0 / p.cols * tw, ty + part.r0 / p.rows * th, (part.c1 - part.c0) / p.cols * tw, (part.r1 - part.r0) / p.rows * th);
    x.fillStyle = "#1d1d1d"; x.font = FONT(3.2, "bold"); x.textAlign = "right"; x.textBaseline = "alphabetic";
    const label = `лист ${k + 1} из ${n}`;
    x.fillText(label, tx - 2, M + 3.4);
    right = tx - 2 - x.measureText(label).width - 4;
  }
  x.textAlign = "left"; x.textBaseline = "alphabetic"; x.fillStyle = "#1d1d1d"; x.font = FONT(4.6, "bold");
  x.fillText(fitText(x, project.name, right - M), M, M + 3.6);

  // Grid
  const vw = part.vc1 - part.vc0, vh = part.vr1 - part.vr0;
  const gx = M + NUM + Math.max(0, (pl.availW - vw * cell) / 2), gy = M + TOP + NUM;
  x.textAlign = "center"; x.textBaseline = "middle";
  x.font = SYMFONT(cell * (cell < 2 ? 0.86 : 0.78));
  for (let r = part.vr0; r < part.vr1; r++) for (let c = part.vc0; c < part.vc1; c++) {
    const ci = p.cells[r * p.cols + c]; if (ci === 0xffff) continue;
    const hex = p.colors[ci].hex, cx = gx + (c - part.vc0) * cell, cy = gy + (r - part.vr0) * cell;
    if (mode === "color") { x.fillStyle = "#" + hex.replace(/^#/, ""); x.fillRect(cx, cy, cell + 0.02, cell + 0.02); }
    x.fillStyle = mode === "color" && isDark(hex) ? "#fff" : "#000";
    x.fillText(symbolFor(ci), cx + cell / 2, cy + cell / 2 + cell * 0.05);
  }
  // Rows/columns repeated from the neighbouring sheet are faded.
  x.fillStyle = "rgba(255,255,255,0.6)";
  if (part.vc0 < part.c0) x.fillRect(gx, gy, (part.c0 - part.vc0) * cell, vh * cell);
  if (part.vc1 > part.c1) x.fillRect(gx + (part.c1 - part.vc0) * cell, gy, (part.vc1 - part.c1) * cell, vh * cell);
  if (part.vr0 < part.r0) x.fillRect(gx, gy, vw * cell, (part.r0 - part.vr0) * cell);
  if (part.vr1 > part.r1) x.fillRect(gx, gy + (part.r1 - part.vr0) * cell, vw * cell, (part.vr1 - part.r1) * cell);
  for (let c = part.vc0; c <= part.vc1; c++) {
    const tens = c % 10 === 0; x.strokeStyle = tens ? "#111" : "rgba(0,0,0,.3)"; x.lineWidth = tens ? 0.35 : 0.08;
    x.beginPath(); x.moveTo(gx + (c - part.vc0) * cell, gy); x.lineTo(gx + (c - part.vc0) * cell, gy + vh * cell); x.stroke();
  }
  for (let r = part.vr0; r <= part.vr1; r++) {
    const tens = r % 10 === 0; x.strokeStyle = tens ? "#111" : "rgba(0,0,0,.3)"; x.lineWidth = tens ? 0.35 : 0.08;
    x.beginPath(); x.moveTo(gx, gy + (r - part.vr0) * cell); x.lineTo(gx + vw * cell, gy + (r - part.vr0) * cell); x.stroke();
  }
  x.strokeStyle = "#111"; x.lineWidth = 0.4; x.strokeRect(gx, gy, vw * cell, vh * cell);
  if (n > 1) {
    x.strokeStyle = "#d4161c"; x.lineWidth = 0.4; x.setLineDash([1.5, 1]);
    x.strokeRect(gx + (part.c0 - part.vc0) * cell, gy + (part.r0 - part.vr0) * cell, (part.c1 - part.c0) * cell, (part.r1 - part.r0) * cell);
    x.setLineDash([]);
  }
  // Numbers every 10, top and left only (they continue across sheets).
  x.fillStyle = "#333"; x.font = FONT(2.3);
  x.textAlign = "center"; x.textBaseline = "alphabetic";
  for (let c = Math.ceil(part.vc0 / 10) * 10; c <= part.vc1; c += 10) if (c > 0) x.fillText(c, gx + (c - part.vc0) * cell, gy - 0.8);
  x.textAlign = "right"; x.textBaseline = "middle";
  for (let r = Math.ceil(part.vr0 / 10) * 10; r <= part.vr1; r += 10) if (r > 0) x.fillText(r, gx - 0.7, gy + (r - part.vr0) * cell);
  // Pointers to the neighbouring sheets.
  x.fillStyle = "#d4161c"; x.font = FONT(2.6, "bold");
  if (part.i < pl.sx - 1) {
    x.save(); x.translate(Math.min(W - 1.6, gx + vw * cell + 2.4), gy + vh * cell / 2); x.rotate(Math.PI / 2);
    x.textAlign = "center"; x.textBaseline = "middle"; x.fillText(`лист ${k + 2} →`, 0, 0); x.restore();
  }
  if (part.j < pl.sy - 1) { x.textAlign = "center"; x.textBaseline = "middle"; x.fillText(`↓ лист ${k + 1 + pl.sx}`, gx + vw * cell / 2, gy + vh * cell + 2.2); }

  // Key: only this sheet's colors, stretched to fill the space left on the sheet.
  const box = legendLayout(pl, part), pick = box;
  const f = Math.min(1.7, pick.rh / ROWH), colW = box.w / pick.c, sw = 3.8 * f;
  part.colors.forEach((ci, idx) => {
    const col = idx % pick.c, row = Math.floor(idx / pick.c);
    const lx = box.x + col * colW, ly = box.y + row * pick.rh, hex = p.colors[ci].hex;
    if (mode === "color") { x.fillStyle = "#" + hex.replace(/^#/, ""); x.fillRect(lx, ly, sw, sw); }
    x.strokeStyle = "#555"; x.lineWidth = 0.15; x.strokeRect(lx, ly, sw, sw);
    x.fillStyle = mode === "color" && isDark(hex) ? "#fff" : "#000";
    x.font = SYMFONT(3 * f); x.textAlign = "center"; x.textBaseline = "middle";
    x.fillText(symbolFor(ci), lx + sw / 2, ly + sw / 2 + 0.2 * f);
    x.textAlign = "left"; x.fillStyle = "#111"; x.font = FONT(3 * f, "bold");
    x.fillText(p.colors[ci].code, lx + sw + 1.4 * f, ly + sw / 2);
    const cw = x.measureText(p.colors[ci].code).width;
    const name = dmcNameRu(p.colors[ci].code, p.colors[ci].name);
    const nx = lx + sw + 2.6 * f + cw, max = colW - (nx - lx) - 2;
    const base = 2.5 * f, min = base * 0.7;
    x.fillStyle = "#555";
    let size = base;
    x.font = FONT(size);
    while (size > min && x.measureText(name).width > max) {
      size = Math.max(min, size - base * 0.05);
      x.font = FONT(size);
    }
    if (x.measureText(name).width <= max) {
      x.fillText(name, nx, ly + sw / 2 + 0.1);
    } else if (size * 2.4 <= pick.rh - 0.4) {
      // Break at spaces or hyphens, keeping every character of the name.
      const breaks = [...name.matchAll(/[ -]/g)].map(m => m.index + 1);
      const cut = breaks.filter(i => x.measureText(name.slice(0, i).trim()).width <= max && x.measureText(name.slice(i).trim()).width <= max)
        .sort((a, b) => Math.abs(a - name.length / 2) - Math.abs(b - name.length / 2))[0];
      if (cut) {
        x.fillText(name.slice(0, cut).trim(), nx, ly + sw / 2 - size * 0.6);
        x.fillText(name.slice(cut).trim(), nx, ly + sw / 2 + size * 0.6);
      }
    }
  });
}

// Printing keeps its original resolution; PDF export uses bounded high-resolution bands.
function drawExportPage(canvas, project, pl, k, mode, thumbnail) {
  const s = Math.max(8, Math.min(16, 16 / pl.cell));
  try { drawPage(canvas, s, project, pl, k, mode, thumbnail); }
  catch (error) {
    if (s === 10) throw error;
    canvas.width = canvas.height = 0;
    drawPage(canvas, 10, project, pl, k, mode, thumbnail);
  }
}
const ascii = (text) => new TextEncoder().encode(text);
function utf16Hex(text) {
  let out = "FEFF";
  for (let i = 0; i < text.length; i++)
    out += text.charCodeAt(i).toString(16).padStart(4, "0").toUpperCase();
  return `<${out}>`;
}

async function encodePage(canvas) {
  if (typeof CompressionStream === "function") {
    const { data } = canvas
      .getContext("2d")
      .getImageData(0, 0, canvas.width, canvas.height);
    const rgb = new Uint8Array(canvas.width * canvas.height * 3);
    for (let i = 0, j = 0; i < data.length; i += 4, j += 3) {
      rgb[j] = data[i];
      rgb[j + 1] = data[i + 1];
      rgb[j + 2] = data[i + 2];
    }
    const stream = new Blob([rgb])
      .stream()
      .pipeThrough(new CompressionStream("deflate"));
    return {
      filter: "FlateDecode",
      bytes: new Uint8Array(await new Response(stream).arrayBuffer()),
    };
  }
  const blob = await new Promise((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.92),
  );
  return {
    filter: "DCTDecode",
    bytes: new Uint8Array(await blob.arrayBuffer()),
  };
}

function writePdf(pages, title) {
  const parts = [];
  const offsets = [];
  let length = 0;
  const push = (chunk) => {
    const bytes = typeof chunk === "string" ? ascii(chunk) : chunk;
    parts.push(bytes);
    length += bytes.length;
  };
  const object = (id, body, stream) => {
    offsets[id] = length;
    push(`${id} 0 obj\n${body}\n`);
    if (stream) {
      push("stream\n");
      push(stream);
      push("\nendstream\n");
    }
    push("endobj\n");
  };
  push("%PDF-1.4\n");
  push(Uint8Array.of(0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a));
  let nextId = 4;
  const pageIds = pages.map(page => { const id = nextId; nextId += 2 + page.bands.length; return id; });
  object(1, "<< /Type /Catalog /Pages 2 0 R >>");
  object(
    2,
    `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`,
  );
  object(3, `<< /Title ${utf16Hex(title)} /Producer ${utf16Hex("Крестик")} >>`);
  pages.forEach((page, i) => {
    const id = pageIds[i];
    const pw = page.width > page.height ? PT_H : PT_W,
      ph = page.width > page.height ? PT_W : PT_H;
    const resources = page.bands.map((_, j) => `/Im${j} ${id + 2 + j} 0 R`).join(" ");
    const content = page.bands.map((band, j) => {
      const top = ph * band.top / page.height, bottom = ph * (band.top + band.height) / page.height;
      return `q ${pw} 0 0 ${(bottom - top).toFixed(8)} 0 ${(ph - bottom).toFixed(8)} cm /Im${j} Do Q`;
    }).join("\n");
    object(id, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw} ${ph}] /Resources << /XObject << ${resources} >> >> /Contents ${id + 1} 0 R >>`);
    object(id + 1, `<< /Length ${content.length} >>`, ascii(content));
    page.bands.forEach((band, j) => object(id + 2 + j,
      `<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${band.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /${band.filter} /Length ${band.bytes.length} >>`, band.bytes));
  });
  const size = nextId;
  const xref = length;
  let table = `xref\n0 ${size}\n0000000000 65535 f \n`;
  for (let id = 1; id < size; id++)
    table += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  push(table);
  push(
    `trailer\n<< /Size ${size} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xref}\n%%EOF\n`,
  );
  return new Blob(parts, { type: "application/pdf" });
}

export async function buildPatternPdf(
  project,
  onProgress = () => {},
  options = {},
) {
  const pl = plan(
    project.pattern,
    options.pages ?? 1,
  );
  const thumbnail = thumb(project.pattern),
    canvas = document.createElement("canvas"),
    pages = [];
  for (let k = 0; k < pl.total; k++) {
    let s = Math.max(12, Math.min(32, 40 / pl.cell));
    for (;;) {
      const width = Math.round(pl.W * s), height = Math.round(pl.H * s);
      const step = Math.floor(8_000_000 / width) - 1, bands = [];
      try {
        for (let y = 0; y < height; y += step) {
          // One shared pixel prevents seams from PDF viewer rounding.
          const top = Math.max(0, y - 1), h = Math.min(height, y + step) - top;
          try {
            drawPage(canvas, s, project, pl, k, options.mode, thumbnail, { top, height: h });
            bands.push({ ...(await encodePage(canvas)), top, height: h });
          } finally { canvas.width = canvas.height = 0; }
          await new Promise(r => setTimeout(r, 0));
        }
        pages.push({ width, height, bands });
        break;
      } catch (error) {
        if (s <= 10) throw error;
        s = Math.max(10, s / 2);
      }
    }
    onProgress(k + 1, pl.total);
    await new Promise((r) => setTimeout(r, 0));
  }
  canvas.width = canvas.height = 0;
  return writePdf(pages, project.name);
}
export async function printSheets(project, options) {
  const pl = plan(project.pattern, options.pages),
    thumbnail = thumb(project.pattern);
  const container = document.querySelector("#print-pages");
  container.replaceChildren();
  let style = document.querySelector("#pdf-page-style");
  if (!style) {
    style = document.createElement("style");
    style.id = "pdf-page-style";
    document.head.append(style);
  }
  const w = pl.orient === "land" ? 297 : 210,
    h = pl.orient === "land" ? 210 : 297;
  style.textContent = `@page {size: ${w}mm ${h}mm; margin:0} @media print { .print-page {width:${w}mm!important;height:${h}mm!important;} }`;
  for (let k = 0; k < pl.total; k++) {
    const page = document.createElement("section"),
      canvas = document.createElement("canvas");
    page.className = "print-page";
    drawExportPage(canvas, project, pl, k, options.mode, thumbnail);
    const img = document.createElement("img");
    img.alt = `Лист ${k + 1} из ${pl.total}`;
    img.src = canvas.toDataURL("image/png");
    await img.decode();
    page.append(img);
    container.append(page);
    canvas.width = canvas.height = 0;
    await new Promise((r) => setTimeout(r, 0));
  }
  window.print();
}
export function pdfFileName(project) {
  const base =
    String(project.name || "Схема")
      .replace(/[^\p{L}\p{N}-]+/gu, "-")
      .replace(/^-+|-+$/g, "") || "Схема";
  return `${base}.pdf`;
}
