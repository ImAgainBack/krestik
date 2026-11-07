import { ru } from "./i18n/ru.js";
import {
  allProjects,
  saveProject,
  deleteProject,
  getSetting,
  saveSetting,
} from "./storage.js";
import { threadPalette } from "./engine/palettes.js";
import { estimateSkeins } from "./engine/index.js";
import { $, $$, escapeHtml, makeId, showDialog } from "./ui/dom.js";
import { renderProjects } from "./ui/projects.js";
import { readImageFile } from "./ui/import.js";
import { setupCrop } from "./ui/crop.js";
import { setupSettings } from "./ui/settings.js";
import { renderPalette } from "./ui/palette.js";
import { setupInventory } from "./ui/inventory.js";
import { createStitchView, isBusy as stitchBusy } from "./ui/stitch.js";
import { exportPattern } from "./ui/export.js";
import { buildPatternPdf, pdfFileName } from "./ui/pdf.js";
import { createPdfDialog } from "./ui/pdf-dialog.js";
import { dmcNameRu } from "./i18n/dmc-names-ru.js";

const worker = new Worker("./js/worker.js", { type: "module" });
const requests = new Map();
let requestId = 0;
let projects = [];
let currentProject = null;
let currentImage = null;
let sourceBlob = null;
let thumbnail = "";
let excludedCodes = new Set();
let manualReplacements = new Map();
let importSession = false;
let manualModeVersion = 0;
let photoCropInitialized = false;
let cameraStream = null;
let cameraFileFallback = false;
let draftTimer = 0;

worker.addEventListener("message", ({ data }) => {
  const pending = requests.get(data.id);
  if (!pending) return;
  requests.delete(data.id);
  data.error
    ? pending.reject(new Error(data.error))
    : pending.resolve(data.result);
});
function ask(type, payload = {}) {
  const id = ++requestId;
  return new Promise((resolve, reject) => {
    requests.set(id, { resolve, reject });
    worker.postMessage({ id, type, ...payload });
  });
}
let activeScreen = "home";
let handlingHistory = false;
function renderScreen(screen) {
  activeScreen = screen;
  $$(".bottom-nav a,.bottom-nav button").forEach(element => {
    const target = element.id === "nav-stitch" ? "stitch" : element.id === "nav-create" ? "wizard" : element.hash?.slice(1);
    if (target === screen) element.setAttribute("aria-current", "page");
    else element.removeAttribute("aria-current");
  });
  $$(".screen").forEach((element) =>
    element.classList.toggle("hidden", element.id !== `${screen}-screen`),
  );
  if (screen !== "stitch") stitch.closeOverlays?.({ fromHistory: true });
  if (screen !== "wizard") stopCamera();
  window.scrollTo(0, 0);
}
function showScreen(screen, { replace = false } = {}) {
  if (screen === activeScreen) return;
  const hash = screen === "stitch" && currentProject ? "#stitch/" + currentProject.id : "#" + screen;
  history[replace ? "replaceState" : "pushState"]({ pointCroix: true, screen, projectId: currentProject?.id }, "", `${location.pathname}${location.search}${hash}`);
  renderScreen(screen);
}
window.addEventListener("popstate", (event) => {
  if (["pdf", "pdf-zoom"].includes(event.state?.overlay)) return;
  if (event.state?.pointCroix && event.state.overlay === "palette") {
    const dialog = document.querySelector("#replace-dialog");
    if (dialog?.open) dialog.close();
    renderScreen("stitch");
    stitch.openOverlay?.({ fromHistory: true });
    return;
  }
  const route = location.hash.slice(1).split("/");
  const screen = event.state?.pointCroix ? event.state.screen : route[0];
  const projectId = event.state?.projectId || route[1];
  if (screen === "stitch" && projectId && currentProject?.id !== projectId) { openProject(projectId, { replace: true }); return; }
  if (["home", "wizard", "stitch", "inventory"].includes(screen)) {
    handlingHistory = true;
    renderScreen(screen);
    stitch.closeOverlays?.({ fromHistory: true });
    handlingHistory = false;
  } else if (!location.hash) renderScreen("home");
});
window.addEventListener("hashchange", () => {
  if (handlingHistory) return;
  const route = location.hash.slice(1).split("/");
  const screen = route[0];
  if (screen === "stitch" && route[1] && currentProject?.id !== route[1]) { openProject(route[1], { replace: true }); return; }
  if (["home", "wizard", "stitch", "inventory"].includes(screen) && screen !== activeScreen) renderScreen(screen);
});
function selectedMode() {
  return $('input[name="mode"]:checked').value;
}
function settings() {
  const cols = Math.max(1, Math.min(400, Number($("#cols").value) || 40));
  const rows = Math.max(1, Math.min(400, Number($("#rows").value) || 40));
  const options = {
    brand: $("#brand-options").dataset.brand || "dmc",
    maxBlends: selectedMode() === "photo" ? Number($("#max-blends").value) : 0,
    excludedCodes: [...excludedCodes],
    mode: selectedMode(),
    cols,
    rows,
    maxColors: Number($("#max-colors").value),
    aida: Number($("#aida").value),
    dither: $("#dither").checked ? 0.35 : 0,
    emptyBackground: $("#empty-background").checked,
    cleanup: Number($("#cleanup").value),
    quad: crop.getQuad(),
  };
  const legend = selectedMode() === "chart" ? settingsUI?.legendCodes() || [] : [];
  if (legend.length) { options.allowedCodes = legend; options.maxColors = legend.length; }
  else if ($("#only-stock").checked) options.allowedCodes = inventory.getOwned(options.brand);
  if (excludedCodes.size)
    options.allowedCodes = (options.allowedCodes || threadPalette(options.brand).map(c => c[0])).filter(
      (code) => !excludedCodes.has(code),
    );
  return options;
}
let inventory;
const crop = setupCrop();
const stitch = createStitchView({ save: saveProject, getSkeins: () => "" });
inventory = setupInventory({
  load: () => getSetting("ownedDmc", []),
  save: (codes) => saveSetting("ownedDmc", codes),
});
const settingsUI = setupSettings({
  getImage: () => currentImage,
  getQuad: crop.getQuad,
  getOptions: settings,
  calculate: async (image, options) => ask("convert", { image, options }),
});
crop.onChange(() => { settingsUI.schedule(); persistDraft(); });

async function refreshProjects() {
  projects = await allProjects();
  renderProjects(projects, {
    open: openProject,
    save: async (project) => {
      await saveProject(project);
      await refreshProjects();
    },
    remove: async (id) => {
      await deleteProject(id);
      await refreshProjects();
    },
  });
}
function startNew() {
  importSession = true;
  currentImage = null;
  sourceBlob = null;
  thumbnail = "";
  excludedCodes = new Set();
  manualReplacements = new Map();
  settingsUI.setDetected(false);
  $("#step-label").textContent = "Шаг 1 из 2";
  $("#project-name").value = "";
  $("#project-name-error").textContent = "";
  $("#project-name").removeAttribute("aria-invalid");
  $("#editor").classList.add("hidden");
  $("#upload-options").classList.remove("hidden");
  $("#loaded-source").classList.add("hidden");
  $("#camera-input").value = "";
  $("#gallery-input").value = "";
  showScreen("wizard");
}
function persistDraft() {
  if (!sourceBlob) return;
  clearTimeout(draftTimer);
  draftTimer = setTimeout(flushDraft, 120);
}
async function flushDraft() {
  if (!sourceBlob) return;
  clearTimeout(draftTimer); draftTimer = 0;
  const draft = { source: sourceBlob, thumbnail, name: $("#project-name").value, mode: selectedMode(), settings: settings() };
  await saveSetting("draft", draft);
  renderDraftCard(draft);
}
window.addEventListener("pagehide", flushDraft);
document.addEventListener("visibilitychange", () => { if (document.hidden) flushDraft(); });
function renderDraftCard(draft) {
  const card = $("#draft-card");
  if (!draft?.source) { card.classList.add("hidden"); card.replaceChildren(); return; }
  const preview = typeof draft.thumbnail === "string" && draft.thumbnail.startsWith("data:image/") ? draft.thumbnail : "";
  card.innerHTML = `<h2>Продолжить начатую вышивку?</h2><div class="draft-content">${preview ? `<img src="${escapeHtml(preview)}" alt="Предварительный просмотр начатой вышивки">` : ""}<div><b>${escapeHtml(draft.name || "Вышивка")}</b><p>Работа ещё не закончена</p></div></div><div class="draft-actions"><button class="button primary" data-action="continue">Продолжить</button><button class="button secondary danger-text" data-action="delete">Удалить</button></div>`;
  card.classList.remove("hidden");
  card.onclick = async (event) => {
    const action = event.target.closest("[data-action]")?.dataset.action;
    if (action === "continue") await restoreDraft(draft);
    if (action === "delete") {
      const result = await showDialog({ title: "Удалить начатую вышивку?", message: "Фотография и настройки будут удалены.", actions: [{ value: "cancel", label: "Отмена" }, { value: "delete", label: "Удалить", danger: true }] });
      if (result.value === "delete") { await saveSetting("draft", null); renderDraftCard(null); }
    }
  };
}
async function restoreDraft(draft) {
  // Comme startNew : la création remplacera l'assistant dans l'historique (sinon « retour » y ramène).
  importSession = true;
  showScreen("wizard");
  $("#project-name").value = draft.name ?? "";
  await loadFile(new File([draft.source], "черновик.jpg", { type: draft.source.type || "image/jpeg" }));
  thumbnail = draft.thumbnail || thumbnail;
  if (draft.settings) {
    settingsUI.setBrand(draft.settings.brand || "dmc");
    $("#max-blends").value = String(draft.settings.maxBlends ?? 0);
    settingsUI.selectMode(draft.mode === "chart" ? "chart" : "photo");
    $("#cols").value = String(draft.settings.cols || 40); $("#rows").value = String(draft.settings.rows || 40);
    $("#max-colors").value = String(draft.settings.maxColors || 20); $("#max-colors-out").value = $("#max-colors").value;
    $("#aida").value = String(draft.settings.aida || 14); $("#dither").checked = Number(draft.settings.dither || 0) > 0;
    $("#empty-background").checked = Boolean(draft.settings.emptyBackground); $("#cleanup").value = String(draft.settings.cleanup ?? 1);
    if (draft.settings.quad) crop.setQuad(draft.settings.quad);
    $("#legend-codes").value = (draft.settings.allowedCodes || []).join(" ");
    settingsUI.schedule(); persistDraft();
  }
  $("#editor").scrollIntoView({ block: "start" });
}
$("#wizard-screen").addEventListener("input", persistDraft);
$("#wizard-screen").addEventListener("change", persistDraft);
async function loadFile(file) {
  const startingModeVersion = manualModeVersion;
  try {
    const loaded = await readImageFile(file);
    currentImage = loaded.image;
    sourceBlob = loaded.source;
    $("#step-label").textContent = "Шаг 2 из 2";
    crop.setRectangular(selectedMode() === "photo");
    $("#upload-options").classList.add("hidden");
    $("#loaded-source").classList.remove("hidden");
    // L'éditeur doit être visible avant de dessiner : sinon le canvas mesure 0 px de large.
    $("#editor").classList.remove("hidden");
    await crop.setImage(sourceBlob);
    photoCropInitialized = false;
    settingsUI.setPhotoDimensions(loaded.image.width, loaded.image.height);
    thumbnail = await createThumbnail(sourceBlob);
    $("#loaded-thumbnail").src = thumbnail;
    await saveSetting("draft", { source: sourceBlob, thumbnail, name: $("#project-name").value, mode: selectedMode(), settings: settings() });
    renderDraftCard({ source: sourceBlob, thumbnail, name: $("#project-name").value, mode: selectedMode(), settings: settings() });
    settingsUI.schedule();
    await detectGridBounds(true, startingModeVersion);
    persistDraft();
    $("#editor").scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    $("#upload-options").classList.remove("hidden");
    $("#loaded-source").classList.add("hidden");
    await showDialog({ title: "Не удалось открыть изображение", message: "Выберите фотографию или схему в формате изображения", actions: [{ value: "ok", label: "Понятно" }] });
  }
}
async function detectGridBounds(automatic = false, startingModeVersion = manualModeVersion) {
  if (!currentImage) return;
  try {
    const result = await ask("bounds", { image: currentImage, quad: crop.getQuad() });
    if (automatic && startingModeVersion !== manualModeVersion && selectedMode() !== "chart") return;
    const confidentGrid = result && Number(result.confidence) >= 0.35;
    const canChooseAutomatically = automatic && startingModeVersion === manualModeVersion;
    if (confidentGrid) {
      if (canChooseAutomatically) settingsUI.selectMode("chart");
      crop.setQuad(result.quad);
      $("#cols").value = result.cols; $("#rows").value = result.rows;
      settingsUI.setDetected(true);
      $("#grid-detection").textContent = `${new Intl.NumberFormat("ru-RU").format(result.cols)} × ${new Intl.NumberFormat("ru-RU").format(result.rows)} ${ru.detected}`;
      settingsUI.schedule();
    } else {
      settingsUI.setDetected(false);
      if (canChooseAutomatically) {
        settingsUI.selectMode("photo");
        $("#grid-detection").textContent = ru.photoAuto;
      } else if (automatic && selectedMode() === "chart") $("#grid-detection").textContent = ru.uncertain;
    }
  } catch {
    if (automatic && startingModeVersion !== manualModeVersion && selectedMode() !== "chart") return;
    settingsUI.setDetected(false);
    if (automatic && startingModeVersion === manualModeVersion) {
      settingsUI.selectMode("photo");
      $("#grid-detection").textContent = ru.photoAuto;
    } else if (automatic && selectedMode() === "chart") $("#grid-detection").textContent = ru.uncertain;
  }
}
async function createThumbnail(blob) {
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = 180;
  canvas.height = 130;
  const scale = Math.min(
    canvas.width / bitmap.width,
    canvas.height / bitmap.height,
  );
  const width = bitmap.width * scale;
  const height = bitmap.height * scale;
  canvas
    .getContext("2d")
    .drawImage(
      bitmap,
      (canvas.width - width) / 2,
      (canvas.height - height) / 2,
      width,
      height,
    );
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.75);
}
async function imageFromBlob(blob) {
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  return { width: canvas.width, height: canvas.height, data: pixels.data };
}
async function patternWithReplacements(image, options) {
  let pattern = await ask("convert", { image, options });
  for (const [from, to] of manualReplacements) {
    if (pattern.colors.some((color) => color.code === from))
      pattern = await ask("replace", { pattern, from, to, brand: options.brand });
  }
  return pattern;
}
async function makePattern() {
  const name = $("#project-name").value.trim();
  if (!name) {
    $("#project-name-error").textContent = "Напишите название вышивки";
    $("#project-name").setAttribute("aria-invalid", "true");
    $("#project-name").focus();
    $("#project-name").scrollIntoView({ block: "center" });
    return;
  }
  $("#project-name-error").textContent = "";
  $("#project-name").removeAttribute("aria-invalid");
  if (!currentImage || !sourceBlob) return;
  $("#create-pattern").disabled = true;
  $("#create-pattern").textContent = "Создание схемы…";
  try {
    const pattern = await patternWithReplacements(currentImage, settings());
    const project = {
      id: makeId(),
      name,
      source: sourceBlob,
      thumbnail,
      settings: settings(),
      pattern,
      checked: [],
      excludedCodes: [...excludedCodes],
      replacements: [...manualReplacements],
      updated: Date.now(),
    };
    await saveProject(project);
    await saveSetting("draft", null);
    renderDraftCard(null);
    await refreshProjects();
    openProject(project.id);
  } catch (error) {
    await showDialog({ title: "Не удалось создать схему", message: "Попробуйте выбрать другое изображение или изменить настройки", actions: [{ value: "ok", label: "Понятно" }] });
  } finally {
    $("#create-pattern").disabled = false;
    $("#create-pattern").textContent = "Готово — показать схему";
  }
}
async function openProject(id, { replace = false } = {}) {
  currentProject =
    projects.find((project) => project.id === id) || (await findProject(id));
  if (!currentProject) return;
  await saveSetting("lastProjectId", currentProject.id);
  currentImage = null;
  sourceBlob = currentProject.source;
  excludedCodes = new Set(currentProject.excludedCodes || []);
  manualReplacements = new Map(currentProject.replacements || []);
  stitch.open(currentProject);
  renderProjectPalette();
  showScreen("stitch", { replace: replace || importSession });
  importSession = false;
  requestAnimationFrame(stitch.draw);
}
async function findProject(id) {
  return (await allProjects()).find((project) => project.id === id);
}
async function renderProjectPalette() {
  if (!currentProject) return;
  renderPalette(currentProject.pattern, {
    checked: stitch.checked,
    brand: currentProject.settings.brand || "dmc",
    aida: currentProject.settings.aida || 14,
    skeins: (count) => Math.ceil(estimateSkeins(
        count,
        Number(currentProject.settings?.aida || 14),
        2,
      )),
    onAction: async (action, code, replacement) => {
      if (action === "highlight") { stitch.closeOverlays(); return; }
      if (action === "replace") {
        const confirm = await showDialog({ title: "Заменить цвет?", message: `Цвет ${code} будет заменён на ${replacement}.`, actions: [{ value: "cancel", label: "Отмена" }, { value: "confirm", label: "Заменить", danger: true }] });
        if (confirm.value !== "confirm") return;
      }
      const previousPattern = structuredClone(currentProject.pattern);
      const previousReplacements = [...manualReplacements];
      const actions = $$("#palette-list .palette-actions button");
      actions.forEach((button) => { button.disabled = true; });
      const status = $("#palette-status");
      try {
        if (action === "replace") {
          manualReplacements.set(code, replacement);
          currentProject.replacements = [...manualReplacements];
          currentProject.pattern = await ask("replace", { pattern: currentProject.pattern, from: code, to: replacement, brand: currentProject.settings.brand });
        }
        if (action === "exclude") {
          status.textContent = "Пересчитываем…";
          excludedCodes.add(code);
          currentProject.excludedCodes = [...excludedCodes];
          if (code.includes("+") || !currentProject.source) {
            currentProject.pattern = await ask("remove", {pattern: currentProject.pattern, code, brand: currentProject.settings.brand});
          } else {
          currentImage = await imageFromBlob(currentProject.source);
          currentProject.pattern = await patternWithReplacements(currentImage, {
            ...currentProject.settings,
            excludedCodes: [...excludedCodes],
            allowedCodes: (currentProject.settings.allowedCodes || threadPalette(currentProject.settings.brand).map(c => c[0])).filter((item) => !excludedCodes.has(item)),
          });
          }
        }
        currentProject.updated = Date.now();
        await saveProject(currentProject);
        await refreshProjects();
        stitch.open(currentProject);
        renderProjectPalette();
        stitch.openOverlay({ fromHistory: true });
        if (action === "exclude" || action === "replace") {
          const choice = await showDialog({ title: action === "exclude" ? "Схема пересчитана" : "Цвет заменён", message: "Уже отмеченные крестики остались на своих местах.", actions: [{ value: "undo", label: action === "exclude" ? "Отменить" : "Отменить замену" }, { value: "done", label: "Готово" }] });
          if (choice.value === "undo") {
            if (action === "exclude") { excludedCodes.delete(code); currentProject.excludedCodes = [...excludedCodes]; }
            else { manualReplacements = new Map(previousReplacements); currentProject.replacements = previousReplacements; }
            currentProject.pattern = previousPattern;
            await saveProject(currentProject); await refreshProjects(); stitch.open(currentProject); renderProjectPalette(); stitch.openOverlay({ fromHistory: true });
          }
        }
      } catch (error) {
        if (action === "exclude") { excludedCodes.delete(code); currentProject.excludedCodes = [...excludedCodes]; currentProject.pattern = previousPattern; }
        status.textContent = "Не удалось пересчитать схему";
        throw error;
      } finally { actions.forEach((button) => { button.disabled = false; }); if (status?.textContent === "Пересчитываем…") status.textContent = ""; }
    },
  });
  $("#palette-color-filter").innerHTML = `<option value="">Все цвета</option>` + currentProject.pattern.colors.map(item => `<option value="${escapeHtml(item.code)}">${escapeHtml(item.code)} · ${escapeHtml(currentProject.settings.brand === "gamma" ? item.name : dmcNameRu(item.code, item.name))}</option>`).join("");
  $("#palette-display-mode").value = stitch.getDisplayMode?.() || "all";
  $("#palette-color-filter").value = stitch.getColorFilter?.() || "";
}
$("#new-project").addEventListener("click", startNew);
$("#nav-create")?.addEventListener("click", startNew);
$("#choose-other-photo").addEventListener("click", () => { $("#upload-options").classList.remove("hidden"); $("#loaded-source").classList.add("hidden"); });
$("#camera-input").addEventListener("change", (event) =>
  loadFile(event.target.files[0]),
);
$("#camera-input").addEventListener("click", (event) => { if (cameraFileFallback) { cameraFileFallback = false; return; } event.preventDefault(); startCamera(); });
$("#gallery-input").addEventListener("change", (event) =>
  loadFile(event.target.files[0]),
);
$("#create-pattern").addEventListener("click", makePattern);
$("#detect-grid").addEventListener("click", () => detectGridBounds(false));
$$('input[name="mode"]').forEach(input => input.addEventListener("change", () => {
  manualModeVersion++;
  crop.setRectangular(input.value === "photo" && input.checked);
  if (input.checked && input.value === "photo" && !photoCropInitialized) {
    crop.resetQuad();
    photoCropInitialized = true;
  }
}));
$("#open-inventory").addEventListener("click", async () => {
  await inventory.open();
  showScreen("inventory");
});
$("#export-png").addEventListener("click", () => exportPattern(currentProject));
$("#palette-export-png").addEventListener("click", () => currentProject && exportPattern(currentProject));
const pdfDialog = createPdfDialog(savePdf);
$("#open-pdf").addEventListener("click", () => currentProject && pdfDialog.open(currentProject));
async function savePdf(project, options) {
  const button = $("#pdf-save");
  if (button.disabled) return;
  button.disabled = true;
  button.textContent = "Готовим PDF…";
  let file = null;
  try {
    const blob = await buildPatternPdf(project, (done, total) => { button.textContent = `Готовим PDF… ${done} из ${total}`; }, options);
    file = new File([blob], pdfFileName(project), { type: "application/pdf" });
  } catch {}
  button.disabled = false;
  button.textContent = "Сохранить PDF";
  if (!file) {
    await showDialog({ title: "Не удалось сделать PDF", message: "Попробуйте ещё раз или выберите «Печать»", actions: [{ value: "ok", label: "Понятно" }] });
    return;
  }
  // Le téléchargement part d'un bouton du dialogue : Chrome n'accepte un fichier que juste
  // après un toucher, et une grande schéma peut prendre plus de quelques secondes.
  const canShare = Boolean(navigator.share && navigator.canShare?.({ files: [file] }));
  const actions = [{ value: "save", label: "Сохранить в телефон", primary: true }];
  if (canShare) actions.push({ value: "share", label: "Отправить" });
  actions.push({ value: "cancel", label: "Закрыть" });
  const choice = await showDialog({ title: "PDF готов", message: `Файл «${file.name}» попадёт в папку «Загрузки». Его можно открыть, распечатать или отправить`, actions, stacked: true });
  if (choice.value === "save") {
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = file.name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  if (choice.value === "share") {
    try { await navigator.share({ files: [file], title: project.name }); } catch {}
  }
}
$("#palette-display-mode").addEventListener("change", event => {
  if (stitch.setDisplayMode) stitch.setDisplayMode(event.target.value);
  else { $("#display-mode").value = event.target.value === "all" ? "both" : event.target.value; $("#display-mode").dispatchEvent(new Event("change", { bubbles: true })); }
});
$("#palette-color-filter").addEventListener("change", event => {
  if (stitch.setColorFilter) stitch.setColorFilter(event.target.value || null);
  else { $("#color-filter").value = event.target.value; $("#color-filter").dispatchEvent(new Event("change", { bubbles: true })); }
});
$("#nav-stitch").addEventListener("click", async () => {
  if (currentProject) showScreen("stitch");
  else if (projects.length) openProject(await getSetting("lastProjectId", projects[0].id));
});
$$('a[href^="#"]').forEach((link) => link.addEventListener("click", (event) => {
  const screen = link.getAttribute("href").slice(1);
  if (!["home", "wizard", "stitch", "inventory"].includes(screen)) return;
  event.preventDefault();
  showScreen(screen);
}));
$$("[data-screen]").forEach((button) =>
  button.addEventListener("click", () => {
    const target = button.dataset.screen;
    if (history.state?.pointCroix && activeScreen !== target) history.back();
    else showScreen(target);
  }),
);
$("#aida").addEventListener("change", () => {
  currentProject && (currentProject.settings.aida = Number($("#aida").value));
});
$("#brand-options").addEventListener("change", async () => { await saveSetting("threadBrand", $("#brand-options").dataset.brand); if($("#only-stock").checked) await inventory.open(); });
$("#only-stock").addEventListener("change", async () => {
  $("#only-stock").checked && (await inventory.open());
});

async function initialize() {
  await refreshProjects();
  const route = location.hash.slice(1).split("/");
  if (route[0] === "stitch" && projects.length) {
    const lastId = route[1] || await getSetting("lastProjectId", projects[0].id);
    const target = projects.find((project) => project.id === lastId) || projects[0];
    if (target) {
      history.replaceState({ pointCroix: true, screen: "stitch", projectId: target.id }, "", `${location.pathname}${location.search}#stitch/${target.id}`);
      await openProject(target.id, { replace: true });
    } else renderScreen("home");
  } else {
    history.replaceState({ pointCroix: true, screen: "home" }, "", `${location.pathname}${location.search}#home`);
    renderScreen("home");
  }
  settingsUI.setBrand(await getSetting("threadBrand", "dmc"));
  if (route[0] !== "stitch") renderDraftCard(await getSetting("draft", null));
  if ("serviceWorker" in navigator)
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  bindBackup();
}

async function bindBackup() {
  try {
    const backup = await import("./ui/backup.js");
    const ready = await backup.ensurePersistence();
    $("#backup-export").addEventListener("click", () => backup.exportBackup());
    $("#backup-import").addEventListener("click", () => $("#backup-file").click());
    $("#backup-file").addEventListener("change", async (event) => { const file = event.target.files?.[0]; if (!file) return; try { const result = await backup.importBackup(file); await refreshProjects(); await showDialog({ title: "Копия открыта", message: `Добавлено вышивок: ${result.imported}`, actions: [{ value: "ok", label: "Понятно" }] }); } catch { await showDialog({ title: "Не удалось открыть копию", message: "Проверьте, что выбран файл копии приложения", actions: [{ value: "ok", label: "Понятно" }] }); } finally { event.target.value = ""; } });
    document.body.dataset.persistence = String(ready);
  } catch { document.body.dataset.persistence = "unavailable"; }
}
function stopCamera() { cameraStream?.getTracks().forEach((track) => track.stop()); cameraStream = null; }
async function startCamera() {
  let dialog = $("#camera-dialog");
  if (!dialog) {
    dialog = document.createElement("dialog"); dialog.id = "camera-dialog";
    dialog.innerHTML = `<form method="dialog" class="camera-form"><h2>Сфотографировать</h2><p id="camera-message">Наведите камеру на картинку или схему</p><div class="camera-frame"><video id="camera-video" autoplay playsinline></video><canvas id="camera-capture" class="hidden"></canvas><span class="camera-guide hidden">Поместите схему в рамку</span></div><div class="camera-actions"><button type="button" class="button secondary" id="camera-cancel">Отмена</button><button type="button" class="button primary" id="camera-shutter">Сфотографировать</button><button type="button" class="button secondary hidden" id="camera-retake">Переснять</button><button type="button" class="button primary hidden" id="camera-accept">Подходит</button><button type="button" class="button secondary hidden" id="camera-file-fallback">Выбрать файл</button></div></form>`;
    document.body.append(dialog);
    $("#camera-cancel").onclick = () => { stopCamera(); dialog.close(); };
    $("#camera-file-fallback").onclick = () => { dialog.close(); cameraFileFallback = true; $("#camera-input").click(); };
    $("#camera-shutter").onclick = async () => {
      try {
        let blob;
        if (window.ImageCapture && cameraStream?.getVideoTracks()[0]) blob = await new ImageCapture(cameraStream.getVideoTracks()[0]).takePhoto();
        else { const video = $("#camera-video"), canvas = $("#camera-capture"); canvas.width = video.videoWidth; canvas.height = video.videoHeight; canvas.getContext("2d").drawImage(video, 0, 0); blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", .94)); }
        window.cameraPhoto = blob; stopCamera(); $("#camera-video").classList.add("hidden"); $("#camera-capture").classList.remove("hidden");
        const bitmap = await createImageBitmap(blob); const c = $("#camera-capture"); c.width = bitmap.width; c.height = bitmap.height; c.getContext("2d").drawImage(bitmap,0,0); bitmap.close();
        $("#camera-shutter").classList.add("hidden"); $("#camera-retake").classList.remove("hidden"); $("#camera-accept").classList.remove("hidden");
      } catch { cameraFailure(); }
    };
    $("#camera-retake").onclick = async () => { $("#camera-capture").classList.add("hidden"); $("#camera-video").classList.remove("hidden"); $("#camera-retake").classList.add("hidden"); $("#camera-accept").classList.add("hidden"); $("#camera-shutter").classList.remove("hidden"); try { cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } }); $("#camera-video").srcObject = cameraStream; } catch { cameraFailure(); } };
    $("#camera-accept").onclick = async () => { const photo = window.cameraPhoto; dialog.close(); if (photo) await loadFile(new File([photo], "снимок.jpg", { type: photo.type || "image/jpeg" })); };
    dialog.addEventListener("close", stopCamera);
  }
  window.cameraPhoto = null;
  $("#camera-capture").classList.add("hidden"); $("#camera-video").classList.remove("hidden");
  $("#camera-shutter").classList.remove("hidden"); $("#camera-retake").classList.add("hidden"); $("#camera-accept").classList.add("hidden"); $("#camera-file-fallback").classList.add("hidden");
  $("#camera-message").textContent = "Наведите камеру на картинку или схему";
  dialog.showModal();
  try { cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } }); $("#camera-video").srcObject = cameraStream; $("#camera-message").textContent = selectedMode() === "chart" ? "Поместите схему в рамку" : "Наведите камеру и нажмите кнопку"; $(".camera-guide").classList.toggle("hidden", selectedMode() !== "chart"); }
  catch { cameraFailure(); }
}
function cameraFailure() { stopCamera(); $("#camera-message").textContent = "Камера недоступна. Выберите фотографию из телефона"; $("#camera-shutter").classList.add("hidden"); $("#camera-file-fallback").classList.remove("hidden"); }
let pendingUpdate = false;
let updateRetryTimer = null;
let updateRetries = 0;
let boardGestureActive = false;
$("#stitch-canvas").addEventListener("pointerdown", () => { boardGestureActive = true; });
$("#stitch-canvas").addEventListener("pointerup", () => { boardGestureActive = false; if (pendingUpdate && $("#check-toggle")?.getAttribute("aria-pressed") !== "true") activateUpdate(); });
$("#stitch-canvas").addEventListener("pointercancel", () => { boardGestureActive = false; if (pendingUpdate && $("#check-toggle")?.getAttribute("aria-pressed") !== "true") activateUpdate(); });
$("#check-toggle").addEventListener("click", () => { if (pendingUpdate && $("#check-toggle").getAttribute("aria-pressed") !== "true" && !boardGestureActive) activateUpdate(); });
async function activateUpdate() {
  if (boardGestureActive || $("#check-toggle")?.getAttribute("aria-pressed") === "true") {
    pendingUpdate = true;
    $("#update-banner span").textContent = "Обновление установится после завершения вышивки";
    return;
  }
  // Croix pas encore écrites dans IndexedDB : on réessaie dans un instant plutôt que de recharger.
  if (stitchBusy()) {
    pendingUpdate = true;
    clearTimeout(updateRetryTimer);
    // ~10 s sans réussir à enregistrer : on cesse d'attendre et on le dit (les données restent à l'écran).
    if (++updateRetries > 20) {
      updateRetries = 0;
      $("#update-banner span").textContent = "Не удалось сохранить — сохраните копию в файл, затем обновите";
      return;
    }
    $("#update-banner span").textContent = "Сохраняем вышивку, затем обновим";
    updateRetryTimer = setTimeout(activateUpdate, 500);
    return;
  }
  clearTimeout(updateRetryTimer);
  updateRetries = 0;
  pendingUpdate = false;
  const registration = await navigator.serviceWorker.getRegistration();
  if (registration?.waiting) {
    navigator.serviceWorker.addEventListener("controllerchange", () => location.reload(), { once: true });
    registration.waiting.postMessage({ type: "KRESTIK_ACTIVATE_UPDATE" });
  } else location.reload();
}
if ("serviceWorker" in navigator) navigator.serviceWorker.addEventListener("message", (event) => {
  if (event.data?.type !== "KRESTIK_UPDATE_AVAILABLE") return;
  const banner = $("#update-banner"); banner.classList.remove("hidden");
  $("#update-apply").onclick = activateUpdate;
});
initialize();
