import { ru } from "./i18n/ru.js";
import {
  allProjects,
  saveProject,
  deleteProject,
  getSetting,
  saveSetting,
} from "./storage.js";
import { estimateSkeins } from "./engine/index.js";
import { $, $$, makeId } from "./ui/dom.js";
import { renderProjects } from "./ui/projects.js";
import { readImageFile } from "./ui/import.js";
import { setupCrop } from "./ui/crop.js";
import { setupSettings } from "./ui/settings.js";
import { renderPalette } from "./ui/palette.js";
import { setupInventory } from "./ui/inventory.js";
import { createStitchView } from "./ui/stitch.js";
import { exportPattern, printPattern } from "./ui/export.js";

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
  $$(".screen").forEach((element) =>
    element.classList.toggle("hidden", element.id !== `${screen}-screen`),
  );
  if (screen !== "stitch") stitch.closeOverlays?.({ fromHistory: true });
  window.scrollTo(0, 0);
}
function showScreen(screen, { replace = false } = {}) {
  if (screen === activeScreen) return;
  history[replace ? "replaceState" : "pushState"]({ pointCroix: true, screen }, "", `${location.pathname}${location.search}#${screen}`);
  renderScreen(screen);
}
window.addEventListener("popstate", (event) => {
  if (event.state?.pointCroix && event.state.overlay === "palette") {
    const dialog = document.querySelector("#replace-dialog");
    if (dialog?.open) dialog.close();
    renderScreen("stitch");
    stitch.openOverlay?.({ fromHistory: true });
    return;
  }
  const screen = event.state?.pointCroix ? event.state.screen : location.hash.slice(1);
  if (["home", "wizard", "stitch", "inventory"].includes(screen)) {
    handlingHistory = true;
    renderScreen(screen);
    stitch.closeOverlays?.({ fromHistory: true });
    handlingHistory = false;
  } else if (!location.hash) renderScreen("home");
});
window.addEventListener("hashchange", () => {
  if (handlingHistory) return;
  const screen = location.hash.slice(1);
  if (["home", "wizard", "stitch", "inventory"].includes(screen) && screen !== activeScreen) renderScreen(screen);
});
function selectedMode() {
  return $('input[name="mode"]:checked').value;
}
function settings() {
  const cols = Math.max(1, Math.min(400, Number($("#cols").value) || 40));
  const rows = Math.max(1, Math.min(400, Number($("#rows").value) || 40));
  const options = {
    mode: selectedMode(),
    cols,
    rows,
    maxColors: Number($("#max-colors").value),
    aida: Number($("#aida").value),
    dither: Number($("#dither").value) / 100,
    emptyBackground: $("#empty-background").checked,
    cleanup: Number($("#cleanup").value),
    quad: crop.getQuad(),
  };
  const legend = selectedMode() === "chart" ? settingsUI?.legendCodes() || [] : [];
  if (legend.length) { options.allowedCodes = legend; options.maxColors = legend.length; }
  else if ($("#only-stock").checked) options.allowedCodes = inventory.getOwned();
  if (excludedCodes.size)
    options.allowedCodes = (options.allowedCodes || allDmcCodes).filter(
      (code) => !excludedCodes.has(code),
    );
  return options;
}
const allDmcCodes = [];
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
  $("#project-name").value = "Моя вышивка";
  $("#editor").classList.add("hidden");
  $("#camera-input").value = "";
  $("#gallery-input").value = "";
  showScreen("wizard");
}
async function loadFile(file) {
  const startingModeVersion = manualModeVersion;
  try {
    const loaded = await readImageFile(file);
    currentImage = loaded.image;
    sourceBlob = loaded.source;
    // L'éditeur doit être visible avant de dessiner : sinon le canvas mesure 0 px de large.
    $("#editor").classList.remove("hidden");
    await crop.setImage(sourceBlob);
    photoCropInitialized = false;
    settingsUI.setPhotoDimensions(loaded.image.width, loaded.image.height);
    thumbnail = await createThumbnail(sourceBlob);
    settingsUI.schedule();
    await detectGridBounds(true, startingModeVersion);
    $("#editor").scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    alert(ru.errors.readImage);
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
      pattern = await ask("replace", { pattern, from, to });
  }
  return pattern;
}
async function makePattern() {
  if (!currentImage || !sourceBlob) return;
  $("#create-pattern").disabled = true;
  $("#create-pattern").textContent = "Создание схемы…";
  try {
    const pattern = await patternWithReplacements(currentImage, settings());
    const project = {
      id: makeId(),
      name: $("#project-name").value.trim() || "Моя вышивка",
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
    await refreshProjects();
    openProject(project.id);
  } catch (error) {
    alert(ru.errors.createGrid);
  } finally {
    $("#create-pattern").disabled = false;
    $("#create-pattern").textContent = "Создать схему";
  }
}
async function openProject(id, { replace = false } = {}) {
  currentProject =
    projects.find((project) => project.id === id) || (await findProject(id));
  if (!currentProject) return;
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
    skeins: (count) => Math.ceil(estimateSkeins(
        count,
        Number(currentProject.settings?.aida || 14),
        2,
      )),
    onAction: async (action, code, replacement) => {
      if (action === "highlight") return;
      if (action === "replace") {
        manualReplacements.set(code, replacement);
        currentProject.replacements = [...manualReplacements];
        currentProject.pattern = await ask("replace", {
          pattern: currentProject.pattern,
          from: code,
          to: replacement,
        });
      }
      if (action === "exclude") {
        excludedCodes.add(code);
        currentProject.excludedCodes = [...excludedCodes];
        currentImage = await imageFromBlob(currentProject.source);
        currentProject.pattern = await patternWithReplacements(currentImage, {
          ...currentProject.settings,
          allowedCodes: (currentProject.settings.allowedCodes || allDmcCodes).filter((item) => !excludedCodes.has(item)),
        });
      }
      currentProject.updated = Date.now();
      await saveProject(currentProject);
      await refreshProjects();
      stitch.open(currentProject);
      renderProjectPalette();
      stitch.openOverlay({ fromHistory: true });
    },
  });
}
$("#new-project").addEventListener("click", startNew);
$("#empty-create").addEventListener("click", startNew);
$("#nav-create").addEventListener("click", startNew);
$("#camera-input").addEventListener("change", (event) =>
  loadFile(event.target.files[0]),
);
$("#gallery-input").addEventListener("change", (event) =>
  loadFile(event.target.files[0]),
);
$("#create-pattern").addEventListener("click", makePattern);
$("#detect-grid").addEventListener("click", () => detectGridBounds(false));
$$('input[name="mode"]').forEach(input => input.addEventListener("change", () => {
  manualModeVersion++;
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
$("#print-pattern").addEventListener("click", () =>
  printPattern(currentProject),
);
$("#nav-stitch").addEventListener("click", () => {
  if (currentProject) showScreen("stitch");
  else alert(ru.errors.openProject);
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
$("#only-stock").addEventListener("change", async () => {
  $("#only-stock").checked && (await inventory.open());
});

async function initialize() {
  const codes = await import("./engine/dmc.js");
  codes.DMC.forEach(([code]) => allDmcCodes.push(code));
  await refreshProjects();
  const initialRoute = location.hash.slice(1);
  if (initialRoute === "stitch" && projects.length) {
    history.replaceState({ pointCroix: true, screen: "stitch" }, "", `${location.pathname}${location.search}#stitch`);
    await openProject(projects[0].id, { replace: true });
  } else {
    history.replaceState({ pointCroix: true, screen: "home" }, "", `${location.pathname}${location.search}#home`);
    renderScreen("home");
  }
  if ("serviceWorker" in navigator)
    navigator.serviceWorker.register("./sw.js").catch(() => {});
}
initialize();
