import { DMC } from "../engine/dmc.js";
import { $, escapeHtml } from "./dom.js";
import { dmcNameRu, dmcSearchText } from "../i18n/dmc-names-ru.js";

export function setupInventory({ load, save }) {
  let owned = new Set();
  function render() {
    const query = $("#inventory-search").value.trim().toLowerCase();
    const filter = $("#inventory-filter").value;
    const items = DMC.filter(
      ([code, name]) =>
        dmcSearchText(code, name).toLowerCase().includes(query) &&
        (filter === "all" || (filter === "owned") === owned.has(code)),
    );
    $("#inventory-list").innerHTML = items
      .map(
        ([code, name, hex]) =>
          `<label class="inventory-row"><span class="swatch" style="background:#${hex}"></span><span>${escapeHtml(code)} <small>${escapeHtml(dmcNameRu(code, name))}</small></span><input type="checkbox" data-code="${code}" ${owned.has(code) ? "checked" : ""} aria-label="Есть в запасе: ${escapeHtml(code)}"></label>`,
      )
      .join("");
  }
  $("#inventory-list").addEventListener("change", async (event) => {
    const code = event.target.dataset.code;
    if (!code) return;
    event.target.checked ? owned.add(code) : owned.delete(code);
    await save([...owned]);
    render();
  });
  $("#inventory-search").addEventListener("input", render);
  $("#inventory-filter").addEventListener("change", render);
  $("#toggle-all").addEventListener("click", async () => {
    const visibleCodes = [
      ...$("#inventory-list").querySelectorAll("[data-code]"),
    ].map((input) => input.dataset.code);
    const allOwned = visibleCodes.every((code) => owned.has(code));
    visibleCodes.forEach((code) =>
      allOwned ? owned.delete(code) : owned.add(code),
    );
    await save([...owned]);
    render();
  });
  return {
    async open() {
      owned = new Set(await load());
      render();
    },
    getOwned: () => [...owned],
  };
}
