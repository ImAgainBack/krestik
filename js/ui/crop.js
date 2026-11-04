import { $, $$ } from "./dom.js";

export function setupCrop() {
  const canvas = $("#crop-canvas");
  const magnifier = $("#magnifier");
  const ctx = canvas.getContext("2d");
  let image = null;
  let quad = null;
  let active = -1;
  let scale = 1;
  let offset = { x: 0, y: 0 };

  function draw() {
    if (!image) return;
    const rect = canvas.getBoundingClientRect();
    const maxHeight = Math.min(window.innerHeight * 0.55, 600);
    scale = Math.min(canvas.parentElement.clientWidth / image.width, maxHeight / image.height);
    const cssWidth = image.width * scale;
    const cssHeight = image.height * scale;
    canvas.dataset.displayScale = String(scale);
    canvas.dataset.imageSize = `${image.width},${image.height}`;
    canvas.dataset.quad = JSON.stringify(quad);
    const dpr = window.devicePixelRatio || 1;
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;
    if (canvas.width !== Math.round(cssWidth * dpr) || canvas.height !== Math.round(cssHeight * dpr)) {
      canvas.width = Math.round(cssWidth * dpr);
      canvas.height = Math.round(cssHeight * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.drawImage(image, 0, 0, cssWidth, cssHeight);
    ctx.fillStyle = "#0009";
    ctx.beginPath();
    ctx.rect(0, 0, cssWidth, cssHeight);
    quad.forEach(([x,y], i) => i ? ctx.lineTo(x*scale,y*scale) : ctx.moveTo(x*scale,y*scale));
    ctx.closePath(); ctx.fill("evenodd");
    ctx.fillStyle = "#365b4740";
    ctx.beginPath();
    quad.forEach(([x, y], index) =>
      index
        ? ctx.lineTo(x * scale, y * scale)
        : ctx.moveTo(x * scale, y * scale),
    );
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2;
    ctx.stroke();
    quad.forEach(([x, y]) => {
      ctx.beginPath();
      ctx.arc(x * scale, y * scale, 13, 0, Math.PI * 2);
      ctx.fillStyle = "#fff";
      ctx.fill();
      ctx.strokeStyle = "#365b47";
      ctx.lineWidth = 3;
      ctx.stroke();
    });
  }
  function setImage(blob) {
    return createImageBitmap(blob).then((bitmap) => {
      image?.close();
      image = bitmap;
      quad = [
        [0, 0],
        [bitmap.width, 0],
        [bitmap.width, bitmap.height],
        [0, bitmap.height],
      ];
      draw();
    });
  }
  function resetQuad() {
    if (!image) return;
    quad = [[0, 0], [image.width, 0], [image.width, image.height], [0, image.height]];
    draw();
  }
  // Redessine quand la largeur disponible change (rotation, éditeur révélé).
  new ResizeObserver(() => draw()).observe(canvas.parentElement);
  canvas.addEventListener("pointerdown", (event) => {
    const rect = canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left) / scale;
    const y = (event.clientY - rect.top) / scale;
    active = quad.reduce(
      (best, point, index) =>
        Math.hypot(point[0] - x, point[1] - y) <
        Math.hypot(quad[best][0] - x, quad[best][1] - y)
          ? index
          : best,
      0,
    );
    if (Math.hypot(quad[active][0] - x, quad[active][1] - y) * scale > 24) { active = -1; return; }
    canvas.setPointerCapture(event.pointerId);
    offset = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    magnifier.style.display = "block";
  });
  canvas.addEventListener("pointermove", (event) => {
    if (active < 0 || !image) return;
    const rect = canvas.getBoundingClientRect();
    const x = Math.max(
      0,
      Math.min(image.width, (event.clientX - rect.left) / scale),
    );
    const y = Math.max(
      0,
      Math.min(image.height, (event.clientY - rect.top) / scale),
    );
    quad[active] = [x, y];
    offset = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    const shellRect = canvas.parentElement.getBoundingClientRect();
    magnifier.style.left = `${Math.min(shellRect.width - 112, rect.left - shellRect.left + offset.x + 12)}px`;
    magnifier.style.top = `${Math.max(0, rect.top - shellRect.top + offset.y - 122)}px`;
    const mctx = magnifier.getContext("2d");
    mctx.clearRect(0, 0, 120, 120);
    mctx.drawImage(
      image,
      Math.max(0, x - 25),
      Math.max(0, y - 25),
      50,
      50,
      0,
      0,
      120,
      120,
    );
    draw();
  });
  const end = () => {
    active = -1;
    magnifier.style.display = "none";
  };
  canvas.addEventListener("pointerup", end);
  canvas.addEventListener("pointercancel", end);
  window.addEventListener("resize", draw);
  return {
    setImage,
    resetQuad,
    getQuad: () => quad?.map((point) => [...point]),
    setQuad(points) { if (points?.length === 4) { quad = points.map(point => [...point]); draw(); } },
    redraw: draw,
  };
}
