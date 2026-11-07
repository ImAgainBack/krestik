import { plan, pageChoices, recommended, sheets, MIN_CELL } from "./pdf-plan.js";
import { drawPage, thumb, pdfFileName, printSheets } from "./pdf.js";

const fmt = (n) => n.toFixed(1).replace(".", ",");
const count = sheets;
const same = (a, b) => String(a) === String(b);
export function createPdfDialog(onSave) {
  const dialog = document.createElement("dialog");
  dialog.id = "pdf-dialog";
  dialog.innerHTML = `<header><button class="back-button icon-button" id="close-pdf" aria-label="Назад"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 4-8 8 8 8"/></svg></button><h2>PDF схемы</h2></header>
    <div id="pdf-strip" aria-label="Листы схемы"></div><p id="pdf-counter" aria-live="polite"></p><div id="pdf-dots"></div>
    <fieldset><legend>Сколько листов</legend><div id="pdf-pages-options"></div><div class="pdf-hint"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7v1"/></svg><p id="pdf-cell-hint"></p></div></fieldset>
    <fieldset><legend>Как печатать</legend><div class="pdf-modes"><button class="pdf-option" data-mode="color"><b>Цветная</b></button><button class="pdf-option" data-mode="symbols"><b>Значки ч/б</b></button></div></fieldset>
    <p id="pdf-file"></p><p id="pdf-error" role="alert"></p><div class="pdf-actions"><button class="button primary" id="pdf-save">Сохранить PDF</button><button class="button secondary" id="pdf-print">Печать</button></div>`;
  document.body.append(dialog);
  const zoom = document.createElement("dialog");
  zoom.id = "pdf-zoom";
  zoom.innerHTML =
    '<header><b></b><button class="button secondary">Закрыть</button></header><div class="pdf-zoom-scroll"></div>';
  document.body.append(zoom);
  const $ = (s) => dialog.querySelector(s);
  let project,
    pages,
    mode,
    thumbnail,
    generation = 0;
  const options = () => ({ pages, mode });
  const close = () => history.back();
  $("#close-pdf").onclick = close;
  dialog.addEventListener("cancel", (e) => {
    e.preventDefault();
    close();
  });
  zoom.querySelector("button").onclick = close;
  zoom.addEventListener("cancel", (e) => {
    e.preventDefault();
    close();
  });
  function closeZoom() {
    if (zoom.open) zoom.close();
    zoom.querySelector(".pdf-zoom-scroll").replaceChildren();
  }
  window.addEventListener("popstate", () => {
    if (history.state?.overlay === "pdf-zoom" && dialog.open) {
      if (!zoom.open) openZoom(history.state.pdfPage, false);
      return;
    }
    closeZoom();
    if (history.state?.overlay === "pdf") {
      if (!dialog.open && project) {
        dialog.showModal();
        render();
      }
    } else if (dialog.open) {
      dialog.close();
      generation++;
    }
  });
  function updateCounter() {
    const strip = $("#pdf-strip"),
      n = strip.children.length;
    const k = Math.min(
      n - 1,
      Math.max(0, Math.round(strip.scrollLeft / (strip.clientWidth + 12))),
    );
    $("#pdf-counter").textContent =
      `Лист ${k + 1} из ${n} — нажмите, чтобы увеличить`;
    [...$("#pdf-dots").children].forEach((d, i) =>
      d.classList.toggle("on", i === k),
    );
  }
  $("#pdf-strip").addEventListener("scroll", updateCounter);
  function openZoom(k, push = true) {
    const canvas = document.createElement("canvas"),
      pl = plan(project.pattern, pages);
    const scale = Math.min(Math.max(8, 30 / pl.cell), 4000 / Math.max(pl.W, pl.H));
    drawPage(canvas, scale, project, pl, k, mode, thumbnail);
    canvas.style.width = `${canvas.width}px`;
    zoom.querySelector("b").textContent = `Лист ${k + 1} из ${pl.total}`;
    zoom.querySelector(".pdf-zoom-scroll").replaceChildren(canvas);
    if (push)
      history.pushState(
        { ...history.state, overlay: "pdf-zoom", pdfPage: k },
        "",
      );
    zoom.showModal();
  }
  async function render() {
    const token = ++generation,
      p = project.pattern,
      rec = recommended(p),
      choices = pageChoices(p),
      pl = plan(p, pages);
    $("#pdf-pages-options").innerHTML = choices
      .map((n, i) => {
        const mm = plan(p, n).cell,
          label = count(plan(p, n).total);
        return `<button class="pdf-option" data-choice="${i}" aria-pressed="${same(n, pages)}">${same(n, rec) ? "<span>советуем</span>" : ""}<b>${label}</b><small>${fmt(mm)} мм</small></button>`;
      })
      .join("");
    $("#pdf-cell-hint").classList.toggle("warn", pl.cell < MIN_CELL);
    $("#pdf-cell-hint").textContent =
      pl.cell < MIN_CELL
        ? `Клетка ${fmt(pl.cell)} мм: значки очень мелкие. Читать удобнее на ${count(plan(p, rec).total)} (клетка ${fmt(plan(p, rec).cell)} мм).`
        : pl.parts.length === 1
          ? "Вся схема и нитки на одном листе, как в журнале."
          : "На каждом листе — маленькая картинка, где красной рамкой показано, какая это часть.";
    dialog
      .querySelectorAll("[data-mode]")
      .forEach((b) => b.setAttribute("aria-pressed", b.dataset.mode === mode));
    $("#pdf-file").textContent =
      `Файл «${pdfFileName(project)}» · A4, ${pl.orient === "land" ? "альбомный" : "книжный"} · ${count(pl.total)}`;
    const strip = $("#pdf-strip");
    strip.replaceChildren();
    strip.scrollLeft = 0;
    $("#pdf-dots").innerHTML = Array.from(
      { length: pl.total },
      () => "<i></i>",
    ).join("");
    // Allocate only small preview canvases. Yield between sheets for touch input.
    for (let k = 0; k < pl.total; k++) {
      const slide = document.createElement("button");
      slide.className = "pdf-slide";
      slide.setAttribute("aria-label", `Увеличить лист ${k + 1}`);
      slide.onclick = () => openZoom(k);
      strip.append(slide);
    }
    updateCounter();
    for (let k = 0; k < pl.total; k++) {
      await new Promise((r) => setTimeout(r, 0));
      if (token !== generation) return;
      const canvas = document.createElement("canvas");
      drawPage(canvas, 1.5, project, pl, k, mode, thumbnail);
      strip.children[k].append(canvas);
    }
  }
  $("#pdf-pages-options").onclick = (e) => {
    const b = e.target.closest("[data-choice]");
    if (b) {
      pages = pageChoices(project.pattern)[Number(b.dataset.choice)];
      render();
    }
  };
  dialog.querySelectorAll("[data-mode]").forEach(
    (b) =>
      (b.onclick = () => {
        mode = b.dataset.mode;
        render();
      }),
  );
  $("#pdf-save").onclick = () => onSave(project, options());
  $("#pdf-print").onclick = async () => {
    const b = $("#pdf-print");
    if (b.disabled) return;
    b.disabled = true;
    $("#pdf-error").textContent = "";
    try {
      await printSheets(project, options());
    } catch {
      $("#pdf-error").textContent =
        "Не удалось подготовить печать. Попробуйте ещё раз.";
    } finally {
      b.disabled = false;
    }
  };
  return {
    open(value) {
      // Freeze the document while its preview and exports are open.
      project = {
        name: value.name,
        settings: { ...value.settings },
        pattern: {
          ...value.pattern,
          cells: value.pattern.cells.slice(),
          colors: value.pattern.colors.map((c) => ({ ...c })),
        },
      };
      pages = 1;
      mode = "color";
      thumbnail = thumb(project.pattern);
      $("#pdf-error").textContent = "";
      history.pushState({ ...history.state, overlay: "pdf" }, "");
      dialog.showModal();
      render();
    },
  };
}
