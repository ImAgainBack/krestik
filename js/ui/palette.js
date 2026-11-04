import { DMC } from "../engine/dmc.js";
import { estimateSkeins } from "../engine/index.js";
import { $, escapeHtml } from "./dom.js";
import { symbolFor } from "./symbols.js";
import { ru, formatNumber, formatSkeins, formatStitches } from "../i18n/ru.js";
import { dmcNameRu, dmcSearchText } from "../i18n/dmc-names-ru.js";

export function renderPalette(pattern, { checked, onAction, skeins }) {
  const list = $("#palette-list");
  const completedCounts = new Map();
  checked.forEach((index) => {
    const color = pattern.cells[index];
    if (color !== 0xffff)
      completedCounts.set(color, (completedCounts.get(color) || 0) + 1);
  });
  list.innerHTML = pattern.colors
    .map((color, index) => {
      const completed = completedCounts.get(index) || 0;
      const total = color.count || 0;
      const selected = DMC.map((item) => ({
        code: item[0],
        name: dmcNameRu(item[0], item[1]),
        english: item[1],
        hex: `#${item[2]}`,
      }));
      const suggestions = selected
        .map((item) => ({
          ...item,
          distance: colorDistance(item.hex, color.hex),
        }))
        .sort((a, b) => a.distance - b.distance)
        .slice(0, 8);
      const skeinCount = Math.max(1, Math.ceil(skeins ? skeins(total) : estimateSkeins(total, 14)));
      return `<article class="palette-row" data-code="${escapeHtml(color.code)}"><span class="swatch" style="background:${escapeHtml(color.hex.startsWith("#") ? color.hex : `#${color.hex}`)}">${symbolFor(index)}</span>
      <div class="palette-meta"><b>${escapeHtml(color.code)} · ${escapeHtml(dmcNameRu(color.code, color.name))}</b><small>${formatStitches(total)} · ${formatNumber(completed)} готово · ${formatSkeins(skeinCount)}</small></div>
      <div class="palette-actions"><button class="button secondary" data-action="highlight">${ru.highlight}</button><button class="button secondary" data-action="exclude">${ru.missingColor}</button><button class="button secondary" data-action="replace">${ru.replace}</button>
      <select aria-label="Похожие оттенки для ${escapeHtml(color.code)}" class="replace-select"><option value="">Похожий цвет DMC…</option>${suggestions.map((item) => `<option value="${item.code}">${item.code} ${escapeHtml(item.name)}</option>`).join("")}</select><input class="replace-search" list="dmc-options" placeholder="Код или название…" aria-label="Поиск цвета DMC"></div></article>`;
    })
    .join("");
  const datalist = document.createElement("datalist");
  datalist.id = "dmc-options";
  datalist.innerHTML = DMC.map(
    ([code, name]) => `<option value="${code}" data-search="${escapeHtml(dmcSearchText(code, name))}">${escapeHtml(dmcNameRu(code, name))} · ${escapeHtml(name)}</option>`,
  ).join("");
  list.append(datalist);
  let dialog = document.querySelector("#replace-dialog");
  if (!dialog) { dialog = document.createElement("dialog"); dialog.id = "replace-dialog"; document.body.append(dialog); }
  list.onclick = (event) => {
    const rowTap = event.target.closest(".palette-row");
    if (rowTap && !event.target.closest("[data-action]")) rowTap.classList.toggle("selected");
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const row = button.closest("[data-code]");
    if (button.dataset.action === "replace") {
      const choices = [...row.querySelector(".replace-select").options].slice(1);
      dialog.innerHTML = `<form method="dialog"><h2>Заменить ${escapeHtml(row.dataset.code)}</h2><label>Поиск<input id="replace-query" list="dmc-options" placeholder="Код или название DMC"></label><label>Похожие оттенки<select id="replace-choice">${choices.map(option => `<option value="${option.value}">${escapeHtml(option.textContent)}</option>`).join("")}</select></label><div class="replace-suggestions">${choices.map(option => `<button type="button" data-code="${option.value}">${escapeHtml(option.textContent)}</button>`).join("")}</div><button value="cancel">Отмена</button><button id="replace-confirm" value="confirm">${ru.replace}</button></form>`;
      dialog.querySelector("form").addEventListener("submit", event => {
        if (event.submitter?.id !== "replace-confirm") return;
        event.preventDefault();
        const query = dialog.querySelector("#replace-query").value.trim();
        const match = query ? DMC.find(([item, name]) => item.toUpperCase() === query.toUpperCase() || dmcSearchText(item, name).toLowerCase().includes(query.toLowerCase())) : null;
        const code = match?.[0] || (query ? query.split(/\s+/)[0] : dialog.querySelector("#replace-choice").value);
        if (DMC.some(([item]) => item === code)) { dialog.close(); onAction("replace", row.dataset.code, code); }
      });
      dialog.querySelector(".replace-suggestions").addEventListener("click", event => {
        const item = event.target.closest("[data-code]"); if (!item) return;
        dialog.querySelector("#replace-choice").value = item.dataset.code;
        dialog.querySelector("#replace-query").value = "";
      });
      dialog.showModal();
      if (history.state?.overlay !== "replace") {
        history.pushState({ pointCroix: true, screen: "stitch", overlay: "replace" }, "", `${location.pathname}${location.search}#stitch`);
      }
    } else onAction(button.dataset.action, row.dataset.code);
  };
  dialog.onclose = () => {
    if (history.state?.overlay === "replace") history.back();
  };
  list.onchange = (event) => {
    if (!event.target.matches(".replace-select, .replace-search")) return;
    const row = event.target.closest("[data-code]");
    const selectedCode = event.target.value.trim().split(" ")[0];
    if (DMC.some(([code]) => code === selectedCode)) {
      onAction("replace", row.dataset.code, selectedCode);
    }
  };
}

function colorDistance(left, right) {
  const a = [1, 3, 5].map((index, channel) => {
    const x = parseInt(left.slice(index, index + 2), 16) / 255;
    return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  });
  const b = [1, 3, 5].map((index, channel) => {
    const x = parseInt(right.slice(index, index + 2), 16) / 255;
    return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  });
  return Math.hypot(...a.map((value, index) => value - b[index]));
}
