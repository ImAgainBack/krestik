import { symbolFor } from "./symbols.js";
import { crosses } from "../i18n/ru-stitch.js";
import { dmcNameRu } from "../i18n/dmc-names-ru.js";

const colorValue = (color) => (color.startsWith("#") ? color : `#${color}`);

export function exportPattern(project) {
  const pattern = project.pattern;
  const cellSize = Math.max(
    5,
    Math.min(14, 1400 / Math.max(pattern.cols, pattern.rows)),
  );
  const margin = 48;
  const canvas = document.createElement("canvas");
  canvas.width = pattern.cols * cellSize + margin * 2;
  canvas.height =
    pattern.rows * cellSize + margin * 2 + pattern.colors.length * 24 + 30;
  const context = canvas.getContext("2d");
  context.fillStyle = "#fffdf8";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#20231f";
  context.font = "bold 16px sans-serif";
  context.fillText(`Крестик · ${project.name}`, margin, 28);

  pattern.cells.forEach((colorIndex, index) => {
    const col = index % pattern.cols;
    const row = Math.floor(index / pattern.cols);
    const x = margin + col * cellSize;
    const y = margin + row * cellSize;
    const color = pattern.colors[colorIndex];
    if (colorIndex !== 0xffff) {
      context.fillStyle = colorValue(color.hex);
      context.fillRect(x, y, cellSize, cellSize);
      {
        context.fillStyle = "#20231f";
        context.font = `bold ${Math.max(4, cellSize * 0.65)}px sans-serif`;
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.fillText(
          symbolFor(colorIndex),
          x + cellSize / 2,
          y + cellSize / 2,
        );
      }
    }
    context.strokeStyle =
      col % 10 === 0 || row % 10 === 0 ? "#605f57" : "#aaa99f";
    context.lineWidth = col % 10 === 0 || row % 10 === 0 ? 1.2 : 0.5;
    context.strokeRect(x, y, cellSize, cellSize);
  });

  let y = margin + pattern.rows * cellSize + 30;
  pattern.colors.forEach((color, index) => {
    context.fillStyle = colorValue(color.hex);
    context.fillRect(margin, y - 12, 16, 16);
    context.fillStyle = "#20231f";
    context.font = "14px sans-serif";
    context.fillText(
      `${symbolFor(index)}  ${color.code} ${project.settings?.brand === "gamma" ? color.name : dmcNameRu(color.code, color.name)} · ${crosses(color.count)}`,
      margin + 26,
      y,
    );
    y += 24;
  });

  const link = document.createElement("a");
  link.download = `${project.name.replace(/[^\p{L}\p{N}-]+/gu, "-")}.png`;
  link.href = canvas.toDataURL("image/png");
  link.click();
}
