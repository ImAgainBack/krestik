import { threadPalette, brandName, inventoryKey, normalizeInventory, ownedCodes } from "../engine/palettes.js";
import { $, escapeHtml } from "./dom.js";
import { dmcNameRu, dmcSearchText } from "../i18n/dmc-names-ru.js";

export function setupInventory({ load, save }) {
  let owned = new Set(), brand = "dmc";
  const has = code => owned.has(inventoryKey(code, brand));
  const nameFor = (code,name) => brand === "gamma" ? name : dmcNameRu(code,name);
  function render() {
    $("#inventory-title").textContent = `Мои нитки ${brandName(brand)}`;
    document.querySelectorAll("#inventory-brand [data-brand]").forEach(b => { b.classList.toggle("active", b.dataset.brand === brand); b.setAttribute("aria-pressed", String(b.dataset.brand === brand)); });
    const query = $("#inventory-search").value.trim().toLowerCase();
    const filter = $("#inventory-filter").value;
    const items = threadPalette(brand).filter(
      ([code, name]) =>
        (brand === "gamma" ? `${code} ${name}` : dmcSearchText(code, name)).toLowerCase().includes(query) &&
        (filter === "all" || (filter === "owned") === has(code)),
    );
    $("#inventory-list").innerHTML = items
      .map(
        ([code, name, hex]) =>
          `<label class="inventory-row"><span class="swatch" style="background:#${hex}"></span><span>${escapeHtml(code)} <small>${escapeHtml(nameFor(code, name))}</small></span><input type="checkbox" data-code="${code}" ${has(code) ? "checked" : ""} aria-label="Есть в запасе: ${escapeHtml(code)}"></label>`,
      )
      .join("");
  }
  $("#inventory-list").addEventListener("change", async (event) => {
    const code = event.target.dataset.code;
    if (!code) return;
    event.target.checked ? owned.add(inventoryKey(code, brand)) : owned.delete(inventoryKey(code, brand));
    await save([...owned]);
    render();
  });
  $("#inventory-search").addEventListener("input", render);
  $("#inventory-filter").addEventListener("change", render);
  $("#toggle-all").addEventListener("click", async () => {
    const visibleCodes = [
      ...$("#inventory-list").querySelectorAll("[data-code]"),
    ].map((input) => input.dataset.code);
    const allOwned = visibleCodes.every((code) => has(code));
    visibleCodes.forEach((code) =>
      allOwned ? owned.delete(inventoryKey(code, brand)) : owned.add(inventoryKey(code, brand)),
    );
    await save([...owned]);
    render();
  });
  $("#inventory-brand").addEventListener("click", event => { const b = event.target.closest("[data-brand]"); if(b) {brand=b.dataset.brand;render();} });
  return {
    async open(value) {
      if(value) brand=value;
      owned = new Set(normalizeInventory(await load()));
      render();
    },
    getOwned: (value = "dmc") => ownedCodes([...owned], value),
  };
}
