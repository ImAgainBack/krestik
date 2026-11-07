// Public createStitchView API retained; draw schedules a frame.
// Both named exports and view methods: setDisplayMode(mode), getDisplayMode()
// mode: 'all' | 'colors' | 'symbols'; setColorFilter(code|null), getColorFilter().
// isBusy(): true while marking mode, gestures, or unsaved work require staying here.
let currentView;
export const setDisplayMode = mode => currentView?.setDisplayMode(mode);
export const getDisplayMode = () => currentView?.getDisplayMode() ?? 'all';
export const setColorFilter = code => currentView?.setColorFilter(code);
export const getColorFilter = () => currentView?.getColorFilter() ?? null;
export const isBusy = () => currentView?.isBusy() ?? false;
import { $ } from "./dom.js";
import { symbolFor } from "./symbols.js";
import { stitchRu, stitchProgress } from "../i18n/ru-stitch.js";
import { onSaveStatus, reportSaveStatus, exportBackup, setBackupProjectProvider } from "./backup.js";

export function createStitchView({ save, getSkeins }) {
  const canvas = $("#stitch-canvas");
  const context = canvas.getContext("2d");
  let project = null;
  let checked = new Set();
  let history = [];
  let zoom = 1;
  let panX = 0;
  let panY = 0;
  let pointers = new Map();
  let gesture = null;
  let touched = new Set();
  let gestureCheck = null;
  let filterCode = null;
  let saveTimer;
  let showMode = "all";
  let zoomHintShown = false;
  let total = 0;
  let frame = 0;
  let dirty = false;
  let saving = null;
  let pendingSaves = 0;
  onSaveStatus(status => {
    const label = $("#stitch-save-status");
    label.textContent = stitchRu[status];
    label.classList.toggle("save-error", status === "error");
    $("#stitch-backup").classList.toggle("hidden", status !== "error");
  });

  setBackupProjectProvider(() => project ? structuredClone({...project, checked: [...checked], updated: Date.now()}) : null);
  $("#stitch-backup").addEventListener('click', () => exportBackup());
  function setDisplayMode(mode) {
    if (!['all', 'colors', 'symbols'].includes(mode)) return;
    showMode = mode;
    if ($("#display-mode")) $("#display-mode").value = mode;
    draw();
  }
  function setColorFilter(code) {
    filterCode = code || null;
    if ($("#color-filter")) $("#color-filter").value = filterCode || '';
    draw();
  }
  function symbolColor(hex) {
    const value = hex.startsWith("#") ? hex.slice(1) : hex;
    const channels = [0, 2, 4].map((index) => {
      const channel = parseInt(value.slice(index, index + 2), 16) / 255;
      return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });
    const luminance = channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
    const blackContrast = (luminance + 0.05) / 0.05;
    const whiteContrast = 1.05 / (luminance + 0.05);
    return blackContrast >= whiteContrast ? "#000" : "#fff";
  }
  function setCheckMode(active) {
    const button = $("#check-toggle");
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
    button.setAttribute("aria-checked", String(active));
    button.querySelector("small").textContent = stitchRu.paint;
    $("#check-hint").classList.toggle("hidden", !active);
  }

  function geometry() {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const base = Math.max(
      0.001,
      Math.min(
        (width - 56) / project.pattern.cols,
        (height - 48) / project.pattern.rows,
      ),
    );
    const size = base * zoom;
    return {
      width,
      height,
      size,
      left: 40 + (width - 48 - size * project.pattern.cols) / 2 + panX,
      top: 32 + panY,
    };
  }
  function draw() {
    if (!frame) frame = requestAnimationFrame(() => { frame = 0; render(); });
  }
  function boundPan() {
    const g = geometry();
    const boundX = g.width / 2 + g.size * project.pattern.cols * .2;
    const boundY = g.height / 2 + g.size * project.pattern.rows * .2;
    panX = Math.max(-boundX, Math.min(boundX, panX));
    panY = Math.max(-boundY, Math.min(boundY, panY));
  }
  function zoomAt(next, x, y) {
    const before = geometry(), base = before.size / zoom;
    const previousZoom = zoom;
    zoom = Math.max(1, Math.min(Math.max(1, 56 / base), next));
    const after = geometry();
    panX += x - after.left - (x - before.left) * zoom / previousZoom;
    panY += y - after.top - (y - before.top) * zoom / previousZoom;
    boundPan(); draw();
  }
  function render() {
    if (!project?.pattern) return;
    canvas.dataset.zoom = String(zoom);
    canvas.dataset.panX = String(panX);
    canvas.dataset.panY = String(panY);
    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (!width || !height) return;
    if (
      canvas.width !== Math.round(width * dpr) ||
      canvas.height !== Math.round(height * dpr)
    ) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
    }
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--paper");
    context.fillRect(0, 0, width, height);
    const { size, left, top } = geometry();
    context.save();
    context.beginPath();
    context.rect(40, 32, width - 40, height - 32);
    context.clip();
    const firstCol = Math.max(0, Math.floor((40 - left) / size));
    const lastCol = Math.min(
      project.pattern.cols,
      Math.ceil((width - left) / size),
    );
    const firstRow = Math.max(0, Math.floor((32 - top) / size));
    const lastRow = Math.min(
      project.pattern.rows,
      Math.ceil((height - top) / size),
    );
    for (let row = firstRow; row < lastRow; row++)
      for (let col = firstCol; col < lastCol; col++) {
        const index = row * project.pattern.cols + col;
        const colorIndex = project.pattern.cells[index];
        const x = left + col * size;
        const y = top + row * size;
        const color =
          colorIndex === 0xffff ? null : project.pattern.colors[colorIndex];
        context.fillStyle = checked.has(index)
          ? "#d1d6cc"
          : colorIndex === 0xffff
            ? "#f5f1e8"
            : filterCode && color?.code !== filterCode
              ? "#e5e4de"
              : showMode === "symbols" ? "#fffdf8" : color.hex.startsWith("#")
                ? color.hex
                : `#${color.hex}`;
        context.fillRect(x, y, size, size);
        if (showMode !== "colors" && color && size >= 9) {
          context.fillStyle = showMode === "symbols" ? "#000" : symbolColor(color.hex.startsWith("#") ? color.hex : `#${color.hex}`);
          context.font = `700 ${Math.min(14, size * 0.65)}px sans-serif`;
          context.textAlign = "center";
          context.textBaseline = "middle";
          context.fillText(symbolFor(colorIndex), x + size / 2, y + size / 2);
        }
        if (checked.has(index)) {
          context.strokeStyle = "#20372a";
          context.lineWidth = Math.max(1.5, size * 0.12);
          context.beginPath();
          context.moveTo(x + size * 0.22, y + size * 0.5);
          context.lineTo(x + size * 0.43, y + size * 0.72);
          context.lineTo(x + size * 0.8, y + size * 0.28);
          context.stroke();
        }
      }
    if (size >= 6) {
      context.strokeStyle = "#0003"; context.lineWidth = Math.max(.45, Math.min(1, size / 16));
      for(let col=firstCol; col<=lastCol; col++){ context.beginPath(); context.moveTo(left+col*size,top+firstRow*size); context.lineTo(left+col*size,top+lastRow*size); context.stroke(); }
      for(let row=firstRow; row<=lastRow; row++){ context.beginPath(); context.moveTo(left+firstCol*size,top+row*size); context.lineTo(left+lastCol*size,top+row*size); context.stroke(); }
    }
    context.strokeStyle = "#6d6b60";
    for (let col = Math.ceil(firstCol / 10) * 10; col <= lastCol; col += 10) {
      context.lineWidth = 1.5;
      context.beginPath();
      context.moveTo(left + col * size, top);
      context.lineTo(left + col * size, top + project.pattern.rows * size);
      context.stroke();
    }
    for (let row = Math.ceil(firstRow / 10) * 10; row <= lastRow; row += 10) {
      context.lineWidth = 1.5;
      context.beginPath();
      context.moveTo(left, top + row * size);
      context.lineTo(left + project.pattern.cols * size, top + row * size);
      context.stroke();
    }
    context.restore();
    // Rulers follow the grid, then stick to the viewport. Partial labels are skipped.
    context.font = `500 13px ${getComputedStyle(document.body).fontFamily}`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    const labelWidth = context.measureText("000").width;
    const step = [10, 20, 50, 100].find(value => value * size >= labelWidth + 8) || 100;
    const rulerX = Math.max(0, left - 40), rulerY = Math.max(0, top - 32);
    const theme = getComputedStyle(document.documentElement);
    context.fillStyle = theme.getPropertyValue("--card");
    if (rulerX + 40 <= width && rulerY + 32 <= height) context.fillRect(rulerX, rulerY, 40, 32);
    context.fillRect(Math.max(40, left), rulerY, Math.max(0, Math.min(width, left + project.pattern.cols * size) - Math.max(40, left)), 32);
    context.fillRect(rulerX, Math.max(32, top), 40, Math.max(0, Math.min(height, top + project.pattern.rows * size) - Math.max(32, top)));
    context.fillStyle = theme.getPropertyValue("--muted");
    for (let col = Math.max(step, Math.ceil(firstCol / step) * step); col <= Math.min(project.pattern.cols, lastCol); col += step) {
      const x = left + (col - .5) * size;
      const half = context.measureText(String(col)).width / 2;
      if (x - half < Math.max(40, left) || x + half > width || rulerY + 32 > height) continue;
      context.fillText(String(col), x, rulerY + 16);
    }
    for (let row = Math.max(step, Math.ceil(firstRow / step) * step); row <= Math.min(project.pattern.rows, lastRow); row += step) {
      const y = top + (row - .5) * size;
      if (y - 7 < Math.max(32, top) || y + 7 > height || rulerX + 40 > width) continue;
      context.fillText(String(row), rulerX + 20, y);
    }
    updateProgress();
  }
  function updateProgress() {
    const value = total ? checked.size / total * 100 : 0;
    $("#progress-label").textContent = stitchProgress(checked.size, total);
    $("#progress-bar").style.width = `${value}%`;
  }
  function scheduleSave() {
    dirty = true;
    // Do not debounce forever during a long stroke.
    if (!saveTimer) saveTimer = setTimeout(() => { saveTimer = null; flush(); }, 300);
  }
  async function flush() {
    if (!project || !dirty) return;
    const target = project;
    const snapshot = { ...target, checked: [...checked], updated: Date.now() };
    target.checked = snapshot.checked;
    target.updated = snapshot.updated;
    dirty = false;
    const previous = saving;
    pendingSaves++;
    saving = (async () => {
      if (previous) await previous;
      reportSaveStatus('saving');
      for (let attempt = 0; attempt < 3; attempt++) {
        try { await save(snapshot); reportSaveStatus('saved'); return; }
        catch {
          if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 250 * (attempt + 1)));
        }
      }
      if (project === target) dirty = true;
      reportSaveStatus('error');
    })();
    try { await saving; } finally { pendingSaves--; }
  }
  function cellAt(x, y) {
    const { size, left, top } = geometry();
    const col = Math.floor((x - left) / size);
    const row = Math.floor((y - top) / size);
    return col >= 0 &&
      row >= 0 &&
      col < project.pattern.cols &&
      row < project.pattern.rows
      ? row * project.pattern.cols + col
      : -1;
  }
  function applyCell(index) {
    if (index < 0 || project.pattern.cells[index] === 0xffff || touched.has(index)) return;
    touched.add(index);
    if (checked.has(index) === gestureCheck) return;
    gesture.delta.push([index, checked.has(index)]);
    if (gestureCheck) checked.add(index); else checked.delete(index);
    scheduleSave();
  }
  function finishStroke() {
    if (gesture?.delta?.length) {
      history.push(gesture.delta);
      if (history.length > 50) history.shift();
      gesture.delta = [];
    }
  }
  function stroke(from, to) {
    const {size, left, top} = geometry();
    const x0 = (from.x-left)/size, y0 = (from.y-top)/size;
    const dx = (to.x-from.x)/size, dy = (to.y-from.y)/size;
    // Grid traversal includes even a tiny corner crossing between samples.
    let col=Math.floor(x0), row=Math.floor(y0);
    const endCol=Math.floor(x0+dx), endRow=Math.floor(y0+dy);
    const stepX=Math.sign(dx), stepY=Math.sign(dy);
    const deltaX=dx ? Math.abs(1/dx) : Infinity, deltaY=dy ? Math.abs(1/dy) : Infinity;
    let nextX=dx ? (stepX>0 ? col+1-x0 : x0-col)*deltaX : Infinity;
    let nextY=dy ? (stepY>0 ? row+1-y0 : y0-row)*deltaY : Infinity;
    while (true) {
      if (col>=0 && col<project.pattern.cols && row>=0 && row<project.pattern.rows) applyCell(row*project.pattern.cols+col);
      if (col===endCol && row===endRow) break;
      if (nextX<nextY) {col+=stepX;nextX+=deltaX;}
      else if (nextY<nextX) {row+=stepY;nextY+=deltaY;}
      else {col+=stepX;row+=stepY;nextX+=deltaX;nextY+=deltaY;}
    }
  }
  const pointOf = event => {
    const rect = canvas.getBoundingClientRect();
    return {x: event.clientX-rect.left, y: event.clientY-rect.top};
  };
  function beginSingle(point, blocked = false) {
    gesture = {type: 'single', start: point, last: point, time: performance.now(), moved: false, blocked, delta: []};
    touched = new Set();
    gestureCheck = !checked.has(cellAt(point.x, point.y));
  }
  function beginPinch() {
    if (gesture?.delta?.length) {
      for (const [index, wasChecked] of gesture.delta) { if (wasChecked) checked.add(index); else checked.delete(index); }
      scheduleSave();
    }
    const [a,b] = [...pointers.values()];
    gesture = {type: 'pinch', distance: Math.max(1, Math.hypot(a.x-b.x,a.y-b.y)), zoom, panX, panY, x:(a.x+b.x)/2, y:(a.y+b.y)/2};
  }
  canvas.addEventListener('pointerdown', event => {
    if (!project) return;
    event.preventDefault();
    canvas.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, pointOf(event));
    if (pointers.size === 1) beginSingle(pointOf(event));
    else beginPinch();
  });
  canvas.addEventListener('pointermove', event => {
    if (!pointers.has(event.pointerId) || !gesture) return;
    const point = pointOf(event);
    pointers.set(event.pointerId, point);
    if (pointers.size >= 2) {
      const [a,b] = [...pointers.values()];
      const x=(a.x+b.x)/2, y=(a.y+b.y)/2;
      zoom = gesture.zoom; panX=gesture.panX; panY=gesture.panY;
      zoomAt(gesture.zoom*Math.hypot(a.x-b.x,a.y-b.y)/gesture.distance, gesture.x, gesture.y);
      panX += x-gesture.x; panY += y-gesture.y;
    } else {
      gesture.moved ||= Math.hypot(point.x-gesture.start.x, point.y-gesture.start.y) >= 18;
      if (gesture.moved) {
        if (!gesture.blocked && geometry().size >= 20 && $("#check-toggle").classList.contains('active')) stroke(gesture.last, point);
        else { panX+=point.x-gesture.last.x; panY+=point.y-gesture.last.y; }
        gesture.last=point;
      }
    }
    boundPan(); draw();
  });
  function endPointer(event) {
    if (!pointers.has(event.pointerId)) return;
    if (gesture?.type === 'single') {
      if (event.type === 'pointerup' && !gesture.blocked && !gesture.moved) {
        if (geometry().size < 20) {
          if (!zoomHintShown) {
            zoomHintShown = true;
            $("#zoom-hint").textContent = stitchRu.zoomHint;
            $("#zoom-hint").classList.remove('hidden');
            setTimeout(() => $("#zoom-hint").classList.add('hidden'), 5000);
          }
          zoomAt(zoom * 32 / geometry().size, gesture.start.x, gesture.start.y);
        } else applyCell(cellAt(gesture.start.x, gesture.start.y));
      }
      finishStroke();
    }
    pointers.delete(event.pointerId);
    if (pointers.size >= 2) beginPinch();
    else if (pointers.size === 1) beginSingle([...pointers.values()][0], true);
    else gesture=null;
    draw();
  }
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);
  canvas.addEventListener('wheel', event => {
    event.preventDefault();
    const p = pointOf(event);
    zoomAt(zoom*Math.exp(-event.deltaY*.002), p.x, p.y);
  }, {passive:false});
  // Repeated −/+ presses keep the same screen anchor until the view is moved another way.
  let buttonAnchor = null;
  function zoomVisibleGrid(next) {
    if (!buttonAnchor || buttonAnchor.zoom !== zoom || buttonAnchor.panX !== panX || buttonAnchor.panY !== panY) {
      const g = geometry();
      buttonAnchor = {
        x: (Math.max(40, g.left) + Math.min(g.width, g.left + project.pattern.cols * g.size)) / 2,
        y: (Math.max(32, g.top) + Math.min(g.height, g.top + project.pattern.rows * g.size)) / 2,
      };
    }
    zoomAt(next, buttonAnchor.x, buttonAnchor.y);
    Object.assign(buttonAnchor, { zoom, panX, panY });
  }
  $("#zoom-in").addEventListener('click', () => zoomVisibleGrid(zoom * 1.4));
  $("#zoom-out").addEventListener('click', () => zoomVisibleGrid(zoom / 1.4));
  $("#zoom-fit").addEventListener('click', () => {zoom=1;panX=panY=0;draw();});
  $("#check-toggle").addEventListener("click", () => setCheckMode(!$("#check-toggle").classList.contains("active")));
  function openOverlay({ fromHistory = false } = {}) {
    $("#palette-panel").classList.remove("hidden");
    if (!fromHistory && window.history.state?.overlay !== "palette") {
      window.history.pushState({ pointCroix: true, screen: "stitch", overlay: "palette" }, "", `${location.pathname}${location.search}#stitch`);
    }
  }
  function closeOverlays({ fromHistory = false } = {}) {
    const wasOpen = !$("#palette-panel").classList.contains("hidden");
    $("#palette-panel").classList.add("hidden");
    $("#palette-filter-wrap").classList.add("hidden");
    if (!fromHistory && wasOpen && window.history.state?.overlay === "palette") window.history.back();
  }
  $("#open-palette").addEventListener("click", () => { $("#palette-filter-wrap").classList.add("hidden"); openOverlay(); });
  $("#color-filter-open")?.addEventListener("click", () => { $("#palette-filter-wrap").classList.remove("hidden"); openOverlay(); });
  $("#palette-filter-toggle")?.addEventListener("click", () => $("#palette-filter-wrap").classList.toggle("hidden"));
  $("#close-palette").addEventListener("click", () => closeOverlays());
  $("#color-filter").addEventListener("change", event => { setColorFilter(event.target.value); });
  $("#display-mode")?.addEventListener("change", (event) => {
    setDisplayMode(event.target.value);
  });
  $("#undo").addEventListener("click", () => {
    if (history.length) {
      for (const [index, wasChecked] of history.pop()) { if (wasChecked) checked.add(index); else checked.delete(index); }
      scheduleSave();
      draw();
    }
  });
  $("#palette-list").addEventListener("click", (event) => {
    const button = event.target.closest('[data-action="highlight"]');
    if (!button) return;
    filterCode =
      filterCode === button.closest("[data-code]").dataset.code
        ? null
        : button.closest("[data-code]").dataset.code;
    $("#color-filter").value = filterCode || "";
    draw();
  });
  window.addEventListener("resize", draw);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      clearTimeout(saveTimer); saveTimer = null;
      flush();
    }
  });
  window.addEventListener("pagehide", () => {
    clearTimeout(saveTimer); saveTimer = null;
    flush();
  });
  currentView = {
    setDisplayMode,
    getDisplayMode: () => showMode,
    setColorFilter,
    getColorFilter: () => filterCode,
    isBusy: () => !!(dirty || pendingSaves || pointers.size || $("#check-toggle").classList.contains('active')),
    open(nextProject) {
      if (dirty && project) { project.checked = [...checked]; flush(); }
      project = nextProject;
      checked = new Set(project.checked || []);
      if (!project.checked?.length && project.checkedBits)
        project.checkedBits.forEach((byte, byteIndex) => {
          for (let bit = 0; bit < 8; bit++)
            if (byte & (1 << bit)) checked.add(byteIndex * 8 + bit);
        });
      checked = new Set([...checked].filter(index => Number.isInteger(index) && index >= 0 && index < project.pattern.cells.length && project.pattern.cells[index] !== 0xffff));
      total = project.pattern.cells.reduce((count, value) => count + (value === 0xffff ? 0 : 1), 0);
      pointers.clear(); gesture = null;
      history = [];
      setCheckMode(false);
      zoom = 1;
      panX = 0;
      panY = 0;
      filterCode = null;
      $("#check-toggle").classList.remove("active");
      $("#color-filter").innerHTML = `<option value="">${stitchRu.allColors}</option>` + project.pattern.colors.map(color => `<option value="${color.code}">${color.code}</option>`).join("");
      closeOverlays({ fromHistory: true });
      $("#stitch-title").textContent = project.name;
      draw();
    },
    draw,
    get checked() {
      return checked;
    },
    openOverlay,
    closeOverlays,
    refreshPalette() {
      draw();
    },
  };
  return currentView;
}
