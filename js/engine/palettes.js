import { DMC } from "./dmc.js";
import { GAMMA } from "./gamma.js";
export function threadPalette(brand = "dmc") {
  if (brand === "gamma") return GAMMA;
  if (brand === "dmc") return DMC;
  throw new RangeError("Invalid thread brand");
}
export const brandName = brand => brand === "gamma" ? "Гамма" : "DMC";
// Bare inventory codes remain DMC. Normalize without dropping any entries.
export const inventoryKey = (code, brand = "dmc") => `${brand}:${code}`;
export const normalizeInventory = codes => [...new Set(codes.map(code => code.includes(":") ? code : inventoryKey(code)))];
export const ownedCodes = (codes, brand = "dmc") => normalizeInventory(codes).filter(code => code.startsWith(`${brand}:`)).map(code => code.slice(brand.length + 1));
