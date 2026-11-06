// Génère un vrai fichier PDF de la schéma, sans bibliothèque ni réseau.
// Chaque page A4 est dessinée sur un canvas (le texte russe est donc rendu
// par le système), puis intégrée comme image sans perte (FlateDecode via
// CompressionStream) ; repli en JPEG si CompressionStream manque.
import { symbolFor } from "./symbols.js";
import { crosses } from "../i18n/ru-stitch.js";
import { dmcNameRu } from "../i18n/dmc-names-ru.js";
import { estimateSkeins } from "../engine/index.js";

const DPI = 200;
const PAGE_W = Math.round((210 / 25.4) * DPI); // 1654
const PAGE_H = Math.round((297 / 25.4) * DPI); // 2339
const PT_W = 595.28;
const PT_H = 841.89;
const MARGIN = 90;
const LABEL = 56; // place des numéros autour de la grille
const TILE_COLS = 50;
const TILE_ROWS = 60;
const PAGE_KEY_H = 380; // place réservée sous la grille pour les fils de la page
const INK = "#1f2421";
const MUTED = "#535a56";
const FONT = '"Roboto", system-ui, "Segoe UI", sans-serif';
const EMPTY = 0xffff;

const hex = (value) => (value.startsWith("#") ? value : `#${value}`);
function isDark(value) {
  const h = hex(value).slice(1);
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.45;
}
const number = (value) => value.toLocaleString("ru-RU");

function tiles(pattern) {
  const list = [];
  for (let row = 0; row < pattern.rows; row += TILE_ROWS)
    for (let col = 0; col < pattern.cols; col += TILE_COLS)
      list.push({ col, row, endCol: Math.min(pattern.cols, col + TILE_COLS), endRow: Math.min(pattern.rows, row + TILE_ROWS) });
  return list;
}

function newPage(canvas) {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, PAGE_W, PAGE_H);
  context.textAlign = "left";
  context.textBaseline = "alphabetic";
  return context;
}

function footer(context, project, index, total) {
  context.fillStyle = MUTED;
  context.font = `28px ${FONT}`;
  context.textAlign = "center";
  context.textBaseline = "alphabetic";
  const sheet = ` · лист ${index} из ${total}`;
  const name = fitText(context, project.name, PAGE_W - MARGIN * 2 - context.measureText(sheet).width);
  context.fillText(`${name}${sheet}`, PAGE_W / 2, PAGE_H - 50);
  context.textAlign = "left";
}

function fitText(context, text, maxWidth) {
  if (context.measureText(text).width <= maxWidth) return text;
  let cut = text;
  while (cut.length > 1 && context.measureText(`${cut}…`).width > maxWidth) cut = cut.slice(0, -1);
  return `${cut}…`;
}

// Pastille façon légende de magazine : carré de la couleur avec son значок.
function swatch(context, x, y, size, color, index) {
  context.fillStyle = hex(color.hex);
  context.fillRect(x, y, size, size);
  context.strokeStyle = "#8a8a82";
  context.lineWidth = 2;
  context.strokeRect(x, y, size, size);
  context.fillStyle = isDark(color.hex) ? "#ffffff" : INK;
  context.font = `bold ${Math.round(size * 0.68)}px ${FONT}`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(symbolFor(index), x + size / 2, y + size / 2 + 1);
  context.textAlign = "left";
  context.textBaseline = "alphabetic";
}

const LEGEND_ROW = 52;
const LEGEND_HEAD = 60;
const legendColumns = [
  { title: "№", x: 0, width: 70 },
  { title: "Значок", x: 70, width: 130 },
  { title: "DMC", x: 200, width: 130 },
  { title: "Цвет", x: 330, width: 640 },
  { title: "Крестиков", x: 970, width: 260 },
  { title: "Мотков", x: 1230, width: 244 },
];
const LEGEND_W = 1474;

function drawLegend(context, colors, start, count, top, aida) {
  const left = (PAGE_W - LEGEND_W) / 2;
  context.lineWidth = 2;
  context.strokeStyle = "#8a8a82";
  context.fillStyle = "#efebe4";
  context.fillRect(left, top, LEGEND_W, LEGEND_HEAD);
  context.font = `500 30px ${FONT}`;
  context.fillStyle = INK;
  context.textBaseline = "middle";
  for (const column of legendColumns) {
    context.textAlign = "center";
    context.fillText(column.title, left + column.x + column.width / 2, top + LEGEND_HEAD / 2);
  }
  const rows = colors.slice(start, start + count);
  rows.forEach((color, offset) => {
    const index = start + offset;
    const y = top + LEGEND_HEAD + offset * LEGEND_ROW;
    context.font = `30px ${FONT}`;
    context.fillStyle = INK;
    context.textBaseline = "middle";
    context.textAlign = "center";
    const middle = y + LEGEND_ROW / 2;
    context.fillText(String(index + 1), left + legendColumns[0].x + legendColumns[0].width / 2, middle);
    swatch(context, left + legendColumns[1].x + legendColumns[1].width / 2 - 20, y + 6, 40, color, index);
    context.font = `500 30px ${FONT}`;
    context.fillStyle = INK;
    context.textBaseline = "middle";
    context.textAlign = "center";
    context.fillText(color.code, left + legendColumns[2].x + legendColumns[2].width / 2, middle);
    context.font = `30px ${FONT}`;
    context.textAlign = "left";
    context.fillText(fitText(context, dmcNameRu(color.code, color.name), legendColumns[3].width - 32), left + legendColumns[3].x + 16, middle);
    context.textAlign = "center";
    context.fillText(number(color.count), left + legendColumns[4].x + legendColumns[4].width / 2, middle);
    const skeins = color.count > 0 ? Math.max(1, Math.ceil(estimateSkeins(color.count, aida, 2))) : 0;
    context.fillText(String(skeins), left + legendColumns[5].x + legendColumns[5].width / 2, middle);
  });
  const height = LEGEND_HEAD + rows.length * LEGEND_ROW;
  context.strokeRect(left, top, LEGEND_W, height);
  context.lineWidth = 1;
  for (let i = 0; i <= rows.length; i++) {
    const y = top + LEGEND_HEAD + i * LEGEND_ROW;
    context.beginPath(); context.moveTo(left, y); context.lineTo(left + LEGEND_W, y); context.stroke();
  }
  for (const column of legendColumns.slice(1)) {
    context.beginPath(); context.moveTo(left + column.x, top); context.lineTo(left + column.x, top + height); context.stroke();
  }
  context.textAlign = "left";
  context.textBaseline = "alphabetic";
  return top + height;
}

function drawOverview(context, project, top) {
  const { pattern } = project;
  const cell = overviewCell(pattern);
  const width = cell * pattern.cols;
  const height = cell * pattern.rows;
  const left = (PAGE_W - width) / 2;
  const image = context.createImageData(pattern.cols, pattern.rows);
  for (let i = 0; i < pattern.cells.length; i++) {
    const colorIndex = pattern.cells[i];
    const value = colorIndex === EMPTY ? "f1efe9" : hex(pattern.colors[colorIndex].hex).slice(1);
    image.data[i * 4] = parseInt(value.slice(0, 2), 16);
    image.data[i * 4 + 1] = parseInt(value.slice(2, 4), 16);
    image.data[i * 4 + 2] = parseInt(value.slice(4, 6), 16);
    image.data[i * 4 + 3] = 255;
  }
  const small = document.createElement("canvas");
  small.width = pattern.cols;
  small.height = pattern.rows;
  small.getContext("2d").putImageData(image, 0, 0);
  context.imageSmoothingEnabled = false;
  context.drawImage(small, left, top, width, height);
  context.strokeStyle = "#8a8a82";
  context.lineWidth = 2;
  context.strokeRect(left, top, width, height);
  return top + height;
}

function drawGridTile(context, project, tile, cell, sheet, sheetCount, legendSheets) {
  const { pattern } = project;
  const cols = tile.endCol - tile.col;
  const rows = tile.endRow - tile.row;
  const width = cols * cell;
  const height = rows * cell;
  const left = Math.round((PAGE_W - width) / 2);
  const top = MARGIN + 70 + LABEL;

  context.fillStyle = INK;
  context.font = `500 34px ${FONT}`;
  context.fillText(`Столбцы ${tile.col + 1}–${tile.endCol} · строки ${tile.row + 1}–${tile.endRow}`, MARGIN, MARGIN + 34);

  const symbolFont = `bold ${Math.round(cell * 0.66)}px ${FONT}`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  for (let row = tile.row; row < tile.endRow; row++) {
    for (let col = tile.col; col < tile.endCol; col++) {
      const colorIndex = pattern.cells[row * pattern.cols + col];
      if (colorIndex === EMPTY) continue;
      const color = pattern.colors[colorIndex];
      const x = left + (col - tile.col) * cell;
      const y = top + (row - tile.row) * cell;
      context.fillStyle = hex(color.hex);
      context.fillRect(x, y, cell, cell);
      context.fillStyle = isDark(color.hex) ? "#ffffff" : INK;
      context.font = symbolFont;
      context.fillText(symbolFor(colorIndex), x + cell / 2, y + cell / 2 + 1);
    }
  }

  // Lignes fines partout, puis épaisses toutes les 10 cases (numérotation globale) et au bord.
  for (const bold of [false, true]) {
    context.strokeStyle = bold ? "#2b2e2b" : "#b9b8b0";
    context.lineWidth = bold ? 3 : 1;
    context.beginPath();
    for (let col = tile.col; col <= tile.endCol; col++) {
      if (bold && col % 10 && col !== tile.col && col !== tile.endCol) continue;
      const x = left + (col - tile.col) * cell;
      context.moveTo(x, top); context.lineTo(x, top + height);
    }
    for (let row = tile.row; row <= tile.endRow; row++) {
      if (bold && row % 10 && row !== tile.row && row !== tile.endRow) continue;
      const y = top + (row - tile.row) * cell;
      context.moveTo(left, y); context.lineTo(left + width, y);
    }
    context.stroke();
  }

  // Numéros tous les 10 sur les quatre côtés, comme dans les livrets.
  context.fillStyle = INK;
  context.font = `28px ${FONT}`;
  for (let col = tile.col + 1; col <= tile.endCol; col++) {
    if (col % 10) continue;
    const x = left + (col - tile.col) * cell;
    context.fillText(String(col), x, top - LABEL / 2);
    context.fillText(String(col), x, top + height + LABEL / 2);
  }
  for (let row = tile.row + 1; row <= tile.endRow; row++) {
    if (row % 10) continue;
    const y = top + (row - tile.row) * cell;
    context.textAlign = "right";
    context.fillText(String(row), left - 12, y);
    context.textAlign = "left";
    context.fillText(String(row), left + width + 12, y);
    context.textAlign = "center";
  }

  // Flèches du milieu de la schéma.
  const midCol = Math.floor(pattern.cols / 2);
  const midRow = Math.floor(pattern.rows / 2);
  const arrow = 16;
  if (midCol >= tile.col && midCol < tile.endCol) {
    const x = left + (midCol - tile.col) * cell + cell / 2;
    for (const [y, dir] of [[top - 6, 1], [top + height + 6, -1]]) {
      context.beginPath(); context.moveTo(x, y); context.lineTo(x - arrow, y - dir * arrow * 1.4); context.lineTo(x + arrow, y - dir * arrow * 1.4); context.closePath(); context.fill();
    }
  }
  if (midRow >= tile.row && midRow < tile.endRow) {
    const y = top + (midRow - tile.row) * cell + cell / 2;
    for (const [x, dir] of [[left - 6, 1], [left + width + 6, -1]]) {
      context.beginPath(); context.moveTo(x, y); context.lineTo(x - dir * arrow * 1.4, y - arrow); context.lineTo(x - dir * arrow * 1.4, y + arrow); context.closePath(); context.fill();
    }
  }
  context.textAlign = "left";
  context.textBaseline = "alphabetic";
  drawPageKey(context, pattern, tile, top + height + LABEL + 20, legendSheets);
  footer(context, project, sheet, sheetCount);
}

// Petite légende sous la grille, comme dans les livrets : seulement les fils de cette page.
const KEY_COLS = 3;
const KEY_ROW = 46;
function drawPageKey(context, pattern, tile, top, legendSheets) {
  const used = new Set();
  for (let row = tile.row; row < tile.endRow; row++)
    for (let col = tile.col; col < tile.endCol; col++) {
      const value = pattern.cells[row * pattern.cols + col];
      if (value !== EMPTY) used.add(value);
    }
  const indexes = [...used].sort((a, b) => a - b);
  if (!indexes.length) return;
  const left = (PAGE_W - LEGEND_W) / 2;
  const columnWidth = LEGEND_W / KEY_COLS;
  const maxRows = Math.floor((PAGE_H - 110 - top - 50) / KEY_ROW);
  const capacity = maxRows * KEY_COLS;
  const shown = indexes.length > capacity ? indexes.slice(0, capacity - 1) : indexes;
  context.fillStyle = INK;
  context.font = `500 32px ${FONT}`;
  context.fillText("Нитки на этом листе", left, top + 30);
  const rows = Math.ceil((shown.length + (shown.length < indexes.length ? 1 : 0)) / KEY_COLS);
  shown.forEach((colorIndex, i) => {
    const color = pattern.colors[colorIndex];
    const x = left + Math.floor(i / rows) * columnWidth;
    const y = top + 50 + (i % rows) * KEY_ROW;
    swatch(context, x, y, 36, color, colorIndex);
    context.fillStyle = INK;
    context.font = `500 28px ${FONT}`;
    context.textBaseline = "middle";
    const code = `${color.code}`;
    context.fillText(code, x + 50, y + 19);
    const codeWidth = context.measureText(code).width;
    context.font = `28px ${FONT}`;
    context.fillText(fitText(context, dmcNameRu(color.code, color.name), columnWidth - 70 - codeWidth - 16), x + 50 + codeWidth + 14, y + 19);
    context.textBaseline = "alphabetic";
  });
  if (shown.length < indexes.length) {
    const i = shown.length;
    context.fillStyle = MUTED;
    context.font = `28px ${FONT}`;
    context.textBaseline = "middle";
    context.fillText(`и ещё ${indexes.length - shown.length} — см. ${legendSheets > 1 ? `листы 1–${legendSheets}` : "лист 1"}`, left + Math.floor(i / rows) * columnWidth, top + 50 + (i % rows) * KEY_ROW + 19);
    context.textBaseline = "alphabetic";
  }
}

// ---------- écriture du fichier PDF ----------
const ascii = (text) => new TextEncoder().encode(text);
function utf16Hex(text) {
  let out = "FEFF";
  for (let i = 0; i < text.length; i++) out += text.charCodeAt(i).toString(16).padStart(4, "0").toUpperCase();
  return `<${out}>`;
}

async function encodePage(canvas) {
  if (typeof CompressionStream === "function") {
    const { data } = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height);
    const rgb = new Uint8Array(canvas.width * canvas.height * 3);
    for (let i = 0, j = 0; i < data.length; i += 4, j += 3) { rgb[j] = data[i]; rgb[j + 1] = data[i + 1]; rgb[j + 2] = data[i + 2]; }
    const stream = new Blob([rgb]).stream().pipeThrough(new CompressionStream("deflate"));
    return { filter: "FlateDecode", bytes: new Uint8Array(await new Response(stream).arrayBuffer()) };
  }
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
  return { filter: "DCTDecode", bytes: new Uint8Array(await blob.arrayBuffer()) };
}

function writePdf(pages, title) {
  const parts = [];
  const offsets = [];
  let length = 0;
  const push = (chunk) => { const bytes = typeof chunk === "string" ? ascii(chunk) : chunk; parts.push(bytes); length += bytes.length; };
  const object = (id, body, stream) => {
    offsets[id] = length;
    push(`${id} 0 obj\n${body}\n`);
    if (stream) { push("stream\n"); push(stream); push("\nendstream\n"); }
    push("endobj\n");
  };
  push("%PDF-1.4\n");
  push(Uint8Array.of(0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a));
  const pageIds = pages.map((_, i) => 4 + i * 3);
  object(1, "<< /Type /Catalog /Pages 2 0 R >>");
  object(2, `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`);
  object(3, `<< /Title ${utf16Hex(title)} /Producer ${utf16Hex("Крестик")} >>`);
  pages.forEach((page, i) => {
    const id = pageIds[i];
    const content = `q ${PT_W} 0 0 ${PT_H} 0 0 cm /Im0 Do Q`;
    object(id, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PT_W} ${PT_H}] /Resources << /XObject << /Im0 ${id + 2} 0 R >> >> /Contents ${id + 1} 0 R >>`);
    object(id + 1, `<< /Length ${content.length} >>`, ascii(content));
    object(id + 2, `<< /Type /XObject /Subtype /Image /Width ${PAGE_W} /Height ${PAGE_H} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /${page.filter} /Length ${page.bytes.length} >>`, page.bytes);
  });
  const size = 4 + pages.length * 3;
  const xref = length;
  let table = `xref\n0 ${size}\n0000000000 65535 f \n`;
  for (let id = 1; id < size; id++) table += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  push(table);
  push(`trailer\n<< /Size ${size} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(parts, { type: "application/pdf" });
}

// Géométrie de la page 1 : en-tête, aperçu en couleurs, puis légende.
const OVERVIEW_TOP = MARGIN + 230;
const OVERVIEW_MAX_H = 1030;
function overviewCell(pattern) {
  return Math.max(1, Math.min((PAGE_W - MARGIN * 2) / pattern.cols, OVERVIEW_MAX_H / pattern.rows, 24));
}
function firstLegendTop(pattern) {
  return OVERVIEW_TOP + overviewCell(pattern) * pattern.rows + 80;
}

// Plan des pages : 1 page d'ensemble (aperçu + légende), suite de légende, puis la grille.
export function planPdf(pattern) {
  const firstRows = Math.min(pattern.colors.length, Math.floor((PAGE_H - firstLegendTop(pattern) - LEGEND_HEAD - 110) / LEGEND_ROW));
  const moreRows = Math.floor((PAGE_H - MARGIN - 80 - LEGEND_HEAD - 110) / LEGEND_ROW);
  const legendPages = Math.ceil((pattern.colors.length - firstRows) / moreRows);
  const list = tiles(pattern);
  return { firstRows, moreRows, legendPages, tiles: list, total: 1 + legendPages + list.length };
}

export async function buildPatternPdf(project, onProgress = () => {}) {
  const { pattern } = project;
  const aida = [11, 14, 16, 18].includes(Number(project.settings?.aida)) ? Number(project.settings.aida) : 14;
  const plan = planPdf(pattern);
  const canvas = document.createElement("canvas");
  canvas.width = PAGE_W;
  canvas.height = PAGE_H;
  const pages = [];
  let sheet = 0;
  const finish = async () => { pages.push(await encodePage(canvas)); onProgress(pages.length, plan.total); await new Promise((r) => setTimeout(r, 0)); };

  // Page 1 : titre, explications simples, aperçu, légende.
  let context = newPage(canvas);
  sheet++;
  context.fillStyle = INK;
  context.font = `500 54px ${FONT}`;
  context.fillText(fitText(context, project.name, PAGE_W - MARGIN * 2), MARGIN, MARGIN + 50);
  const cm = (count) => (count * 2.54 / aida).toLocaleString("ru-RU", { maximumFractionDigits: 1 });
  context.font = `32px ${FONT}`;
  context.fillStyle = MUTED;
  context.fillText(`${number(pattern.cols)} × ${number(pattern.rows)} крестиков · канва Аида ${aida}: ${cm(pattern.cols)} × ${cm(pattern.rows)} см · цветов: ${pattern.colors.length}`, MARGIN, MARGIN + 105);
  context.fillText("Один значок на схеме — один крестик нитью этого цвета. Клетки без значка не вышиваются.", MARGIN, MARGIN + 150);
  context.fillText("Толстые линии — через каждые 10 клеток. Треугольники показывают середину.", MARGIN, MARGIN + 192);
  drawOverview(context, project, OVERVIEW_TOP);
  const legendTop = firstLegendTop(pattern);
  context.fillStyle = INK;
  context.font = `500 36px ${FONT}`;
  context.fillText("Нитки DMC", (PAGE_W - LEGEND_W) / 2, legendTop - 24);
  const firstRows = plan.firstRows;
  drawLegend(context, pattern.colors, 0, firstRows, legendTop, aida);
  footer(context, project, sheet, plan.total);
  await finish();

  for (let start = firstRows; start < pattern.colors.length; start += plan.moreRows) {
    context = newPage(canvas);
    sheet++;
    context.fillStyle = INK;
    context.font = `500 40px ${FONT}`;
    context.fillText("Нитки DMC (продолжение)", (PAGE_W - LEGEND_W) / 2, MARGIN + 40);
    drawLegend(context, pattern.colors, start, plan.moreRows, MARGIN + 80, aida);
    footer(context, project, sheet, plan.total);
    await finish();
  }

  const availableW = PAGE_W - MARGIN * 2 - LABEL * 2;
  const availableH = PAGE_H - (MARGIN + 70 + LABEL) - LABEL - PAGE_KEY_H - 110;
  const tileCols = Math.min(TILE_COLS, pattern.cols);
  const tileRows = Math.min(TILE_ROWS, pattern.rows);
  const cell = Math.floor(Math.min(availableW / tileCols, availableH / tileRows, 48));
  for (const tile of plan.tiles) {
    context = newPage(canvas);
    sheet++;
    drawGridTile(context, project, tile, cell, sheet, plan.total, 1 + plan.legendPages);
    await finish();
  }
  return writePdf(pages, project.name);
}

export function pdfFileName(project) {
  const base = String(project.name || "Схема").replace(/[^\p{L}\p{N}-]+/gu, "-").replace(/^-+|-+$/g, "") || "Схема";
  return `${base}.pdf`;
}
