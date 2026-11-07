import { $, $$ } from "./dom.js";
import { DMC } from "../engine/dmc.js";
import { ru, formatNumber, formatStitches } from "../i18n/ru.js";
import { dmcNameRu } from "../i18n/dmc-names-ru.js";

export function setupSettings({ getImage, getQuad, getOptions, calculate }) {
  let timer, version = 0, detected = false;
  const cols = $("#cols"), rows = $("#rows");
  let currentMode = $("input[name=mode]:checked")?.value || "chart";
  const modeSettings = new Map();
  const fields = ["cols", "rows", "max-colors", "aida", "dither", "empty-background", "cleanup"];
  const readModeSettings = () => Object.fromEntries(fields.map(id => {
    const input = $(`#${id}`);
    return [id, id === "dither" ? input.checked : input.type === "checkbox" ? input.checked : input.value];
  }));
  const writeModeSettings = state => {
    fields.forEach(id => {
      const input = $(`#${id}`);
    if (id === "dither") input.checked = Boolean(state[id]);
    else if (input.type === "checkbox") input.checked = Boolean(state[id]);
      else input.value = String(state[id]);
    });
    $("#max-colors-out").value = $("#max-colors").value;
  };
  modeSettings.set(currentMode, readModeSettings());
  const lookup = new Map(DMC.map(([code, name, hex]) => [code.toUpperCase(), { code, name: dmcNameRu(code, name), hex: `#${hex}` }]));
  const legendCodes = () => {
    const tokens = $("#legend-codes").value.trim().split(/[\s,;]+/).filter(Boolean);
    const codes = [], unknown = [];
    for (const token of tokens) {
      const key = /^(blanc|white)$/i.test(token) ? "BLANC" : token.toUpperCase();
      const color = lookup.get(key);
      if (color) { if (!codes.includes(color.code)) codes.push(color.code); }
      else unknown.push(token);
    }
    const box = $("#legend-swatches");
    box.innerHTML = codes.map(code => { const color = lookup.get(code.toUpperCase()); return `<span title="${color.code} · ${color.name}" style="background:${color.hex}"></span>`; }).join("") + (unknown.length ? `<small>${ru.unknownCodes} ${unknown.join(", ")}</small>` : "");
    return codes;
  };
  function updatePhysicalSize() {
    const n = Number($("#aida").value);
    const format = { format: (value) => formatNumber(value, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) };
    $("#physical-size").textContent = `${format.format((Number(cols.value) / n) * 2.54)} × ${format.format((Number(rows.value) / n) * 2.54)} см`;
    $("#size-summary").textContent = `${formatNumber(Number(cols.value))} × ${formatNumber(Number(rows.value))} крестиков · примерно ${format.format((Number(cols.value) / n) * 2.54)} × ${format.format((Number(rows.value) / n) * 2.54)} см`;
    const cm = (Number(cols.value) / n) * 2.54;
    const closestSize = [10, 20, 30].reduce((best, item) => Math.abs(item - cm) < Math.abs(best - cm) ? item : best, 10);
    $$("#photo-size-options [data-size]").forEach((button) => { const active = Number(button.dataset.size) === closestSize; button.classList.toggle("active", active); button.setAttribute("aria-pressed", String(active)); });
    const colors = Number($("#max-colors").value);
    const closestColors = [10, 20, 35].reduce((best, item) => Math.abs(item - colors) < Math.abs(best - colors) ? item : best, 10);
    $$("#color-options [data-colors]").forEach((button) => { const active = Number(button.dataset.colors) === closestColors; button.classList.toggle("active", active); button.setAttribute("aria-pressed", String(active)); });
    $("#stitch-count").textContent = formatStitches(Number(cols.value) * Number(rows.value));
  }
  function ratio() {
    const quad = getQuad();
    if (!quad) return 1;
    const dist = (a,b) => Math.hypot(a[0]-b[0], a[1]-b[1]);
    const width = (dist(quad[0],quad[1])+dist(quad[3],quad[2]))/2;
    const height = (dist(quad[0],quad[3])+dist(quad[1],quad[2]))/2;
    return width / Math.max(1,height);
  }
  function schedule() {
    updatePhysicalSize(); clearTimeout(timer);
    if (!getImage()) return;
    $("#preview-summary").textContent = "Готовим схему…";
    $("#create-pattern").disabled = true;
    const current = ++version;
    timer = setTimeout(async () => {
      try {
        const pattern = await calculate(getImage(), getOptions());
        if (current !== version) return;
        $("#create-pattern").disabled = false;
        $("#preview-summary").textContent = "";
        const canvas = $("#preview-canvas"), context = canvas.getContext("2d");
        const scale = Math.min(240 / pattern.cols, 240 / pattern.rows);
        canvas.width = Math.max(1, Math.round(pattern.cols * scale)); canvas.height = Math.max(1, Math.round(pattern.rows * scale));
        const paper = getComputedStyle(document.documentElement).getPropertyValue("--paper");
        for (let y=0;y<pattern.rows;y++) for(let x=0;x<pattern.cols;x++) {
          const color = pattern.cells[y*pattern.cols+x] === 0xffff ? null : pattern.colors[pattern.cells[y*pattern.cols+x]];
          context.fillStyle = color ? (color.hex.startsWith("#") ? color.hex : `#${color.hex}`) : paper;
          context.fillRect(x*scale,y*scale,Math.ceil(scale),Math.ceil(scale));
        }
        $("#preview-color-count").textContent = `${formatNumber(pattern.colors.length)} цветов`;
        $("#preview-palette").innerHTML = pattern.colors.map(c => `<span title="${c.code} · ${c.name}" style="background:${c.hex.startsWith("#")?c.hex:`#${c.hex}`}"></span>`).join("");
      } catch { if (current === version) { $("#preview-summary").textContent = "Не удалось подготовить схему. Проверьте настройки."; $("#create-pattern").disabled = false; } }
    }, 250);
  }
  function clampFields() {
    cols.value = String(Math.max(1, Math.min(400, Number(cols.value) || 1)));
    rows.value = String(Math.max(1, Math.min(400, Number(rows.value) || 1)));
  }
  const remember = () => modeSettings.set(currentMode, readModeSettings());
  cols.addEventListener("input", () => { detected = false; remember(); schedule(); });
  rows.addEventListener("input", () => { detected = false; remember(); schedule(); });
  cols.addEventListener("change", () => { clampFields(); if($("#lock-ratio").checked && !detected) rows.value=String(Math.max(1,Math.min(400,Math.round(Number(cols.value)/ratio())))); remember(); schedule(); });
  rows.addEventListener("change", () => { clampFields(); if($("#lock-ratio").checked && !detected) cols.value=String(Math.max(1,Math.min(400,Math.round(Number(rows.value)*ratio())))); remember(); schedule(); });
  $("#legend-codes").addEventListener("input", () => { legendCodes(); schedule(); });
  $("#max-colors").addEventListener("input", e => { $("#max-colors-out").value=e.target.value; remember(); schedule(); });
  ["aida","dither","empty-background","cleanup"].forEach(id => $(`#${id}`).addEventListener("change", () => { remember(); schedule(); }));
  $("#photo-size-options").addEventListener("click", (event) => {
    const button = event.target.closest("[data-size]"); if (!button) return;
    const stitches = Math.max(1, Math.round(Number(button.dataset.size) / 2.54 * Number($("#aida").value)));
    cols.value = String(stitches); rows.value = String(Math.max(1, Math.round(stitches / ratio()))); detected = false; remember(); schedule(); cols.dispatchEvent(new Event("input", { bubbles: true }));
  });
  $("#color-options").addEventListener("click", (event) => { const button = event.target.closest("[data-colors]"); if (!button) return; $("#max-colors").value = button.dataset.colors; $("#max-colors-out").value = button.dataset.colors; remember(); schedule(); $("#max-colors").dispatchEvent(new Event("input", { bubbles: true })); });
  $("#only-stock").addEventListener("change", schedule);
  $$("input[name=mode]").forEach(input => input.addEventListener("change", () => {
    if (!input.checked) return;
    modeSettings.set(currentMode, readModeSettings());
    currentMode = input.value;
    if (!modeSettings.has(currentMode)) modeSettings.set(currentMode, currentMode === "photo"
      ? { ...readModeSettings(), cols: 100, rows: 100, "max-colors": 30, dither: false, "empty-background": false, cleanup: 1 }
      : { ...readModeSettings(), "empty-background": true, "max-colors": 20, dither: false, cleanup: 1 });
    writeModeSettings(modeSettings.get(currentMode));
    const grid = input.value === "chart" && input.checked;
    detected = false;
    $("#grid-crop-wrap").classList.remove("hidden");
    $("#crop-heading").textContent = input.value === "photo" ? "Обрежьте фотографию" : "Проверьте рамку схемы";
    $("#grid-detection").classList.toggle("hidden", input.value !== "chart");
    $("#dither-row").classList.toggle("hidden", input.value !== "photo" || !input.checked);
    $("#photo-size-options").classList.toggle("hidden", input.value !== "photo");
    $("#color-options").classList.toggle("hidden", input.value !== "photo");
    $("#detect-grid").classList.toggle("hidden", !grid); $("#legend-row").classList.toggle("hidden", !grid);
    schedule();
  }));
  const selected = $("input[name=mode]:checked");
  $("#dither-row").classList.toggle("hidden", selected?.value !== "photo");
  $("#grid-crop-wrap").classList.remove("hidden");
  $("#crop-heading").textContent = selected?.value === "photo" ? "Обрежьте фотографию" : "Проверьте рамку схемы";
  $("#grid-detection").classList.toggle("hidden", selected?.value !== "chart");
  $("#photo-size-options").classList.toggle("hidden", selected?.value !== "photo");
  $("#color-options").classList.toggle("hidden", selected?.value !== "photo");
  $("#legend-row").classList.toggle("hidden", selected?.value !== "chart");
  $("#detect-grid").classList.toggle("hidden", selected?.value !== "chart");
  updatePhysicalSize();
  return {
    schedule,
    setDetected(value) { detected = value; remember(); },
    setPhotoDimensions(width, height) {
      const photo = {
        ...(modeSettings.get("photo") || readModeSettings()), cols: 100,
        rows: Math.max(1, Math.min(400, Math.round(100 * height / Math.max(1, width)))),
        "max-colors": 30, dither: false, "empty-background": false, cleanup: 1,
      };
      modeSettings.set("photo", photo);
      if (currentMode === "photo") { writeModeSettings(photo); schedule(); }
    },
    selectMode(mode) {
      const input = $(`input[name=mode][value=${mode}]`);
      if (!input || input.checked) return;
      input.checked = true;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    },
    legendCodes,
  };
}
