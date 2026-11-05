import { $, escapeHtml, askToConfirm, showDialog, makeId } from "./dom.js";
import { formatNumber, formatSchemes, formatStitches } from "../i18n/ru.js";

let outsideClickBound = false;

export function renderProjects(projects, { open, save, remove }) {
  const list = $("#project-list");
  projects.sort((a, b) => b.updated - a.updated);
  list.innerHTML = projects.map((project) => {
    const checked = new Set(project.checked || []);
    const cells = project.pattern?.cells || [];
    const total = cells.reduce((count, value) => count + (value === 0xffff ? 0 : 1), 0);
    const done = [...checked].filter((index) => Number.isInteger(index) && index >= 0 && index < cells.length && cells[index] !== 0xffff).length;
    const value = total ? (done / total) * 100 : 0;
    const percent = formatNumber(value, { minimumFractionDigits: value < 10 ? 1 : 0, maximumFractionDigits: 1 });
    return `<article class="project-card" data-id="${escapeHtml(project.id)}" tabindex="0" role="button" aria-label="Открыть вышивку ${escapeHtml(project.name)}"><img src="${project.thumbnail || ""}" alt="Схема ${escapeHtml(project.name)}"><div class="project-info"><strong>${escapeHtml(project.name)}</strong><small>${percent} % готово · ${formatStitches(total)}</small></div><div class="project-actions"><button class="menu-button" data-action="menu" aria-label="Дополнительные действия" aria-expanded="false"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></svg></button><div class="project-menu hidden"><button data-action="rename">Переименовать</button><button data-action="duplicate">Создать копию</button><button class="danger-text" data-action="delete">Удалить</button></div></div></article>`;
  }).join("");
  $("#project-count").textContent = formatSchemes(projects.length);
  $("#empty-state").classList.toggle("hidden", projects.length > 0);
  list.onclick = async (event) => {
    const card = event.target.closest("[data-id]");
    if (!card) return;
    const project = projects.find((item) => item.id === card.dataset.id);
    const button = event.target.closest("[data-action]");
    if (!button) { open(project.id); return; }
    if (button.dataset.action === "menu") {
      const menu = card.querySelector(".project-menu");
      menu.classList.toggle("hidden"); button.setAttribute("aria-expanded", String(!menu.classList.contains("hidden"))); return;
    }
    if (button.dataset.action === "rename") {
      const result = await showDialog({ title: "Переименовать вышивку", message: "Введите новое название", fields: [{ label: "Название", value: project.name }], actions: [{ value: "cancel", label: "Отмена" }, { value: "save", label: "Сохранить" }] });
      const name = result.text?.trim();
      if (result.value === "save" && name) { project.name = name.slice(0, 60); project.updated = Date.now(); await save(project); }
    }
    if (button.dataset.action === "duplicate") await save({ ...project, id: makeId(), name: `${project.name} — копия`, checked: [], updated: Date.now() });
    if (button.dataset.action === "delete" && await askToConfirm(`Удалить вышивку «${project.name}»? Эту операцию нельзя отменить.`)) await remove(project.id);
  };
  if (!outsideClickBound) {
    outsideClickBound = true;
    document.addEventListener("click", (event) => {
      if (event.target.closest(".project-actions")) return;
      document.querySelectorAll(".project-menu:not(.hidden)").forEach((menu) => {
        menu.classList.add("hidden");
        menu.parentElement.querySelector(".menu-button")?.setAttribute("aria-expanded", "false");
      });
    });
  }
  list.onkeydown = (event) => {
    if ((event.key === "Enter" || event.key === " ") && event.target.matches(".project-card")) { event.preventDefault(); open(event.target.dataset.id); }
  };
}
