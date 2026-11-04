import { symbolFor } from "./symbols.js";
import { formatNumber } from "../i18n/ru.js";
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
      `${symbolFor(index)}  ${color.code} ${dmcNameRu(color.code, color.name)} · ${formatNumber(color.count)} крестиков`,
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

export function printPattern(project) {
  const pages = document.querySelector("#print-pages");
  const { pattern } = project;
  const columnsPerPage = 50;
  const rowsPerPage = 70;
  const cellSize = 14;
  pages.replaceChildren();

  for (let startRow = 0; startRow < pattern.rows; startRow += rowsPerPage) {
    for (
      let startCol = 0;
      startCol < pattern.cols;
      startCol += columnsPerPage
    ) {
      const endRow = Math.min(pattern.rows, startRow + rowsPerPage);
      const endCol = Math.min(pattern.cols, startCol + columnsPerPage);
      const page = document.createElement("section");
      page.className = "print-page";
      const heading = document.createElement("p");
      heading.textContent = `Крестик · ${project.name} · столбцы ${startCol + 1}–${endCol} · строки ${startRow + 1}–${endRow}`;
      page.append(heading);
      const canvas = document.createElement("canvas");
      canvas.width = (endCol - startCol) * cellSize;
      canvas.height = (endRow - startRow) * cellSize;
      drawPageTile(
        canvas,
        pattern,
        startCol,
        startRow,
        endCol,
        endRow,
        cellSize,
      );
      page.append(canvas);
      pages.append(page);
    }
  }

  for (let start = 0; start < pattern.colors.length; start += 32) {
    const page = document.createElement("section");
    page.className = "print-page print-legend";
    const heading = document.createElement("h2");
    heading.textContent = `Крестик · ${project.name} · ключ к ниткам`;
    page.append(heading);
    pattern.colors.slice(start, start + 32).forEach((color, offset) => {
      const row = document.createElement("p");
      const swatch = document.createElement("span");
      swatch.className = "print-swatch";
      swatch.style.backgroundColor = colorValue(color.hex);
      swatch.textContent = symbolFor(start + offset);
      row.append(
        swatch,
        document.createTextNode(
          `${color.code} · ${dmcNameRu(color.code, color.name)} · ${formatNumber(color.count)} крестиков`,
        ),
      );
      page.append(row);
    });
    pages.append(page);
  }
  window.print();
}

function drawPageTile(
  canvas,
  pattern,
  startCol,
  startRow,
  endCol,
  endRow,
  cellSize,
) {
  const context = canvas.getContext("2d");
  context.fillStyle = "#fffdf8";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#20231f";
  context.font = "bold 16px sans-serif";
  context.fillText(`Крестик · ${project.name}`, margin, 28);
  for (let row = startRow; row < endRow; row++) {
    for (let col = startCol; col < endCol; col++) {
      const index = row * pattern.cols + col;
      const colorIndex = pattern.cells[index];
      const x = (col - startCol) * cellSize;
      const y = (row - startRow) * cellSize;
      if (colorIndex !== 0xffff) {
        context.fillStyle = colorValue(pattern.colors[colorIndex].hex);
        context.fillRect(x, y, cellSize, cellSize);
        context.fillStyle = "#20231f";
        context.font = "bold 9px sans-serif";
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.fillText(
          symbolFor(colorIndex),
          x + cellSize / 2,
          y + cellSize / 2,
        );
      }
      context.strokeStyle =
        col % 10 === 0 || row % 10 === 0 ? "#605f57" : "#aaa99f";
      context.lineWidth = col % 10 === 0 || row % 10 === 0 ? 1.5 : 0.6;
      context.strokeRect(x, y, cellSize, cellSize);
    }
  }
}
