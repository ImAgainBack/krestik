import * as engine from "./engine/index.js";

const errorMessages = {
  "Invalid quad": "Не удалось обработать область изображения.",
  "Quad must be convex and nondegenerate": "Выберите ровную область изображения.",
  "Invalid RGBA image": "Не удалось прочитать изображение.",
  "Invalid pattern options": "Проверьте параметры схемы.",
  "Invalid dither/cleanup": "Проверьте настройки обработки изображения.",
  "Empty allowed palette": "В запасе нет подходящих цветов DMC.",
  "Unknown DMC code": "Неизвестный код DMC.",
  "Invalid thread estimate": "Не удалось рассчитать расход мулине.",
};

self.onmessage = async ({ data }) => {
  const { id, type } = data;
  try {
    let result;
    if (type === "detect") result = engine.detectGrid(data.image, data.quad);
    if (type === "bounds") {
      result = engine.detectGridBounds
        ? engine.detectGridBounds(data.image, data.quad)
        : (() => { const grid = engine.detectGrid(data.image, data.quad); return grid ? { ...grid, quad: data.quad || [[0,0],[data.image.width,0],[data.image.width,data.image.height],[0,data.image.height]] } : null; })();
    }
    if (type === "convert") result = engine.imageToPattern(data.image, data.options);
    if (type === "replace")
      result = engine.replaceColor(data.pattern, data.from, data.to);
    if (type === "remove") result = engine.removeColor(data.pattern, data.code);
    if (type === "skeins")
      result = engine.estimateSkeins(data.count, data.aida, data.strands);
    self.postMessage({ id, result });
  } catch (error) {
    self.postMessage({ id, error: errorMessages[error.message] || "Не удалось выполнить расчёт схемы." });
  }
};
