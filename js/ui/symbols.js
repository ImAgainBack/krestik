export const SYMBOLS = [
  "×",
  "○",
  "△",
  "□",
  "＋",
  "◇",
  "/",
  "•",
  "☆",
  "∧",
  "⊙",
  "⌁",
  "∩",
  "Ｘ",
  "▽",
  "◆",
];
export const symbolFor = (index) => SYMBOLS[index % SYMBOLS.length];
