// Existing symbols keep their indices; additions cover 80 solids + 25 blends.
// pour que les broderies existantes gardent leurs значки.
const BASE = ["×", "○", "△", "□", "＋", "◇", "/", "•", "☆", "∧", "⊙", "⌁", "∩", "Ｘ", "▽", "◆"];
const EXTRA = [
  ..."ABCDEFGHJKLMNPRSTUVWYZ",
  ..."23456789",
  ..."abdefghkmnqrstuy",
  ..."БГДЖИЛПФЦЧШЩЭЮЯЫЪЬ",
];
const ADDED = [..."012356789CEFLMNPRSTUVWXYZceijlopvwxzβγδεζηθικλμνξπρστυφχψω"].filter(c => ![...BASE, ...EXTRA].includes(c));
export const SYMBOLS = [...BASE, ...EXTRA, ...ADDED];
export const symbolFor = (index) => SYMBOLS[index % SYMBOLS.length];
