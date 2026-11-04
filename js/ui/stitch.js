import { $, escapeHtml } from "./dom.js";
import { symbolFor } from "./symbols.js";
import { ru, formatNumber } from "../i18n/ru.js";

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
  let paintMode = false;
  let filterCode = null;
  let saveTimer;
  let showMode = "both";
  let lastTap = 0;

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
    button.querySelector("small").textContent = active ? ru.mark : ru.move;
    $("#check-hint").classList.toggle("hidden", !active);
  }

  function geometry() {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const base = Math.max(
      0.25,
      Math.min(
        (width - 42) / project.pattern.cols,
        (height - 42) / project.pattern.rows,
      ),
    );
    const size = base * zoom;
    return {
      width,
      height,
      size,
      left: (width - size * project.pattern.cols) / 2 + panX,
      top: (height - size * project.pattern.rows) / 2 + panY,
    };
  }
  function draw() {
    if (!project?.pattern) return;
    canvas.dataset.zoom = String(zoom);
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
    context.fillStyle = "#fffdf8";
    context.fillRect(0, 0, width, height);
    const { size, left, top } = geometry();
    context.save();
    context.beginPath();
    context.rect(28, 24, width - 30, height - 26);
    context.clip();
    const firstCol = Math.max(0, Math.floor((28 - left) / size));
    const lastCol = Math.min(
      project.pattern.cols,
      Math.ceil((width - left) / size),
    );
    const firstRow = Math.max(0, Math.floor((24 - top) / size));
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
              : color.hex.startsWith("#")
                ? color.hex
                : `#${color.hex}`;
        context.fillRect(x, y, size, size);
        if (showMode !== "colors" && color && size >= 9) {
          context.fillStyle = symbolColor(color.hex.startsWith("#") ? color.hex : `#${color.hex}`);
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
    context.fillStyle = "#6d6b60";
    context.font = "11px sans-serif";
    context.textAlign = "center";
    for (let col = Math.max(10, Math.ceil(firstCol / 10) * 10); col <= Math.min(project.pattern.cols, lastCol); col += 10) {
      const rawX = left + (col - 0.5) * size;
      if (rawX + 18 < 28 || rawX - 18 > width) continue;
      context.textAlign = rawX < 46 ? "left" : rawX > width - 46 ? "right" : "center";
      context.fillText(String(col), Math.max(28 + 2, Math.min(width - 2, rawX)), 15);
    }
    context.textAlign = "center";
    for (let row = Math.max(10, Math.ceil(firstRow / 10) * 10); row <= Math.min(project.pattern.rows, lastRow); row += 10) {
      const rawY = top + (row - 0.5) * size + 4;
      if (rawY + 8 < 24 || rawY - 8 > height) continue;
      context.textBaseline = "middle";
      context.fillText(String(row), 15, Math.max(25, Math.min(height - 2, rawY)));
    }
    updateProgress();
  }
  function updateProgress() {
    const total = project.pattern.cells.reduce(
      (count, value) => count + (value === 0xffff ? 0 : 1),
      0,
    );
    const done = [...checked].filter(
      (index) => Number.isInteger(index) && index >= 0 && index < project.pattern.cells.length && project.pattern.cells[index] !== 0xffff,
    ).length;
    const value = total ? (done / total) * 100 : 0;
    const percent = new Intl.NumberFormat("ru-RU", {
      minimumFractionDigits: value < 10 ? 1 : 0,
      maximumFractionDigits: 1,
    }).format(value);
    $("#progress-label").textContent = `${percent} %`;
    $("#progress-bar").style.width = `${value}%`;
  }
  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => flush(), 80);
  }
  function flush() {
    if (!project) return;
    project.checked = [...checked];
    project.updated = Date.now();
    save(project);
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
    if (
      index < 0 ||
      project.pattern.cells[index] === 0xffff ||
      touched.has(index)
    )
      return;
    touched.add(index);
    if (!gesture?.historySaved) {
      history.push(new Set(checked));
      if (gesture) gesture.historySaved = true;
    }
    if (gestureCheck) checked.add(index);
    else checked.delete(index);
  }
  canvas.addEventListener("pointerdown", (event) => {
    canvas.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, { x: event.offsetX, y: event.offsetY });
    if (pointers.size === 1) {
      gesture = {
        x: event.offsetX,
        y: event.offsetY,
        lastX: event.offsetX,
        lastY: event.offsetY,
        moved: false,
      };
      touched = new Set();
      const cell = cellAt(event.offsetX, event.offsetY);
      if ($("#check-toggle").classList.contains("active") && cell >= 0) {
        gestureCheck = !checked.has(cell);
        gesture.startCell = cell;
        paintMode = true;
      }
    } else {
      paintMode = false;
      gestureCheck = null;
      gesture = null;
    }
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!pointers.has(event.pointerId)) return;
    const previous = pointers.get(event.pointerId);
    const point = { x: event.offsetX, y: event.offsetY };
    pointers.set(event.pointerId, point);
    if (pointers.size >= 2) {
      const pair = [...pointers.values()].slice(0, 2);
      if (!gesture)
        gesture = {
          distance: Math.hypot(pair[0].x - pair[1].x, pair[0].y - pair[1].y),
          zoom,
          panX,
          panY,
          center: {
            x: (pair[0].x + pair[1].x) / 2,
            y: (pair[0].y + pair[1].y) / 2,
          },
        };
      else if (gesture.distance) {
        const distance = Math.hypot(
          pair[0].x - pair[1].x,
          pair[0].y - pair[1].y,
        );
        const centerX = (pair[0].x + pair[1].x) / 2;
        const centerY = (pair[0].y + pair[1].y) / 2;
        zoom = Math.max(
          0.5,
          Math.min(
            12,
            (gesture.zoom * distance) / Math.max(1, gesture.distance),
          ),
        );
        const ratio = zoom / gesture.zoom;
        panX =
          centerX -
          canvas.clientWidth / 2 -
          (gesture.center.x - canvas.clientWidth / 2 - gesture.panX) * ratio;
        panY =
          centerY -
          canvas.clientHeight / 2 -
          (gesture.center.y - canvas.clientHeight / 2 - gesture.panY) * ratio;
      }
    } else if (gesture) {
      const dx = point.x - previous.x;
      const dy = point.y - previous.y;
      if (
        paintMode &&
        Math.hypot(point.x - gesture.x, point.y - gesture.y) > 2
      ) {
        if (!gesture.moved) applyCell(gesture.startCell);
        gesture.moved = true;
        applyCell(cellAt(point.x, point.y));
      } else if (!$("#check-toggle").classList.contains("active")) {
        panX += dx;
        panY += dy;
        gesture.moved ||= Math.abs(dx) + Math.abs(dy) > 2;
      }
    }
    draw();
  });
  const endPointer = (event) => {
    pointers.delete(event.pointerId);
    if (!pointers.size) {
      if (paintMode) {
        if (!gesture?.moved) applyCell(gesture?.startCell ?? -1);
        scheduleSave();
      }
      paintMode = false;
      gestureCheck = null;
      gesture = null;
    } else if (pointers.size === 1) {
      gesture = null;
    }
    draw();
  };
  canvas.addEventListener("pointerup", endPointer);
  canvas.addEventListener("pointercancel", endPointer);
  canvas.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      const before = zoom;
      zoom = Math.max(0.5, Math.min(12, zoom * (event.deltaY < 0 ? 1.1 : 0.9)));
      panX =
        ((panX - event.offsetX + canvas.clientWidth / 2) * zoom) / before +
        event.offsetX -
        canvas.clientWidth / 2;
      panY =
        ((panY - event.offsetY + canvas.clientHeight / 2) * zoom) / before +
        event.offsetY -
        canvas.clientHeight / 2;
      draw();
    },
    { passive: false },
  );
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
  $("#color-filter-open").addEventListener("click", () => { $("#palette-filter-wrap").classList.remove("hidden"); openOverlay(); });
  $("#palette-filter-toggle").addEventListener("click", () => $("#palette-filter-wrap").classList.toggle("hidden"));
  $("#close-palette").addEventListener("click", () => closeOverlays());
  $("#color-filter").addEventListener("change", event => { filterCode = event.target.value || null; draw(); });
  canvas.addEventListener("pointerup", () => {
    const now = Date.now();
    if (now - lastTap < 320) { zoom = Math.min(12, zoom < 1.3 ? 2 : zoom * 1.6); panX = 0; panY = 0; draw(); }
    lastTap = now;
  });
  $("#display-mode").addEventListener("change", (event) => {
    showMode = event.target.value;
    draw();
  });
  $("#undo").addEventListener("click", () => {
    if (history.length) {
      checked = history.pop();
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
      clearTimeout(saveTimer);
      flush();
    }
  });
  window.addEventListener("pagehide", () => {
    clearTimeout(saveTimer);
    flush();
  });
  return {
    open(nextProject) {
      project = nextProject;
      checked = new Set(project.checked || []);
      if (!project.checked?.length && project.checkedBits)
        project.checkedBits.forEach((byte, byteIndex) => {
          for (let bit = 0; bit < 8; bit++)
            if (byte & (1 << bit)) checked.add(byteIndex * 8 + bit);
        });
      history = [];
      setCheckMode(false);
      zoom = 1;
      panX = 0;
      panY = 0;
      filterCode = null;
      $("#check-toggle").classList.remove("active");
      $("#color-filter").innerHTML = '<option value="">Toutes</option>' + project.pattern.colors.map(color => `<option value="${color.code}">${color.code}</option>`).join("");
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
}
