import { $, escapeHtml, askToConfirm, makeId } from "./dom.js";
import { ru, formatNumber, formatSchemes, formatStitches } from "../i18n/ru.js";

export function renderProjects(projects, { open, save, remove }) {
  const list = $("#project-list");
  projects.sort((a, b) => b.updated - a.updated);
  list.innerHTML = projects
    .map((project) => {
      const checked = new Set(project.checked || []);
      const cells = project.pattern?.cells || [];
      const total = cells.reduce((count, value) => count + (value === 0xffff ? 0 : 1), 0);
      const done = [...checked].filter((index) => Number.isInteger(index) && index >= 0 && index < cells.length && cells[index] !== 0xffff).length;
      const value = total ? (done / total) * 100 : 0;
      const percent = formatNumber(value, { minimumFractionDigits: value < 10 ? 1 : 0, maximumFractionDigits: 1 });
      const thumb = project.thumbnail || "";
      return `<article class="project-card" data-id="${escapeHtml(project.id)}">
      <img src="${thumb}" alt="Схема: ${escapeHtml(project.name)}">
      <div class="project-info"><strong>${escapeHtml(project.name)}</strong><small>${percent} % готово · ${formatStitches(total)}</small></div>
      <div class="project-actions"><button class="button secondary" data-action="open">${ru.open}</button><button class="button secondary" data-action="rename">${ru.rename}</button><button class="button secondary" data-action="duplicate">${ru.copy}</button><button class="button secondary" data-action="delete">${ru.delete}</button></div>
    </article>`;
    })
    .join("");
  $("#project-count").textContent =
    formatSchemes(projects.length);
  $("#empty-state").classList.toggle("hidden", projects.length > 0);
  list.onclick = async (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const project = projects.find(
      (item) => item.id === button.closest("[data-id]").dataset.id,
    );
    if (button.dataset.action === "open") return open(project.id);
    if (button.dataset.action === "rename") {
      const name = prompt(ru.errors.renamePrompt, project.name)?.trim();
      if (name) {
        project.name = name.slice(0, 60);
        project.updated = Date.now();
        await save(project);
      }
    }
    if (button.dataset.action === "duplicate") {
      await save({
        ...project,
        id: makeId(),
        name: `${project.name} (копия)`,
        checked: [],
        updated: Date.now(),
      });
    }
    if (
      button.dataset.action === "delete" &&
      askToConfirm(`Удалить схему « ${project.name} »?`)
    )
      await remove(project.id);
  };
}
