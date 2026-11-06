// 80 значков distincts (max de couleurs d'une schéma) : les 16 premiers ne changent pas,
// pour que les broderies existantes gardent leurs значки.
const BASE = ["×", "○", "△", "□", "＋", "◇", "/", "•", "☆", "∧", "⊙", "⌁", "∩", "Ｘ", "▽", "◆"];
const EXTRA = [
  ..."ABCDEFGHJKLMNPRSTUVWYZ",
  ..."23456789",
  ..."abdefghkmnqrstuy",
  ..."БГДЖИЛПФЦЧШЩЭЮЯЫЪЬ",
];
export const SYMBOLS = [...BASE, ...EXTRA];
export const symbolFor = (index) => SYMBOLS[index % SYMBOLS.length];
