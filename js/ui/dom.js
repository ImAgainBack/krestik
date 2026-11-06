export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [
  ...root.querySelectorAll(selector),
];
export const escapeHtml = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );
export function showDialog({ title, message = "", fields = [], actions = [], stacked = false }) {
  let dialog = document.querySelector("#app-dialog");
  if (!dialog) {
    dialog = document.createElement("dialog");
    dialog.id = "app-dialog";
    document.body.append(dialog);
  }
  dialog.classList.toggle("has-field", fields.length > 0);
  dialog.innerHTML = `<form method="dialog"><h2>${escapeHtml(title)}</h2>${message ? `<p>${escapeHtml(message)}</p>` : ""}${fields.map((f) => `<label>${escapeHtml(f.label)}<input name="value" maxlength="60" enterkeyhint="done" value="${escapeHtml(f.value || "")}"></label>`).join("")}<div class="dialog-actions${stacked ? " stacked" : ""}">${actions.map((a) => `<button class="button ${a.danger ? "danger" : a.primary ? "primary" : "secondary"}" value="${escapeHtml(a.value)}">${escapeHtml(a.label)}</button>`).join("")}</div></form>`;
  return new Promise((resolve) => {
    dialog.addEventListener("close", () => resolve({ value: dialog.returnValue, text: dialog.querySelector('input[name="value"]')?.value }), { once: true });
    const input = dialog.querySelector('input[name="value"]');
    // « Entrée » / « Готово » du clavier = l'action principale (sinon le formulaire prendrait « Отмена »).
    input?.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      dialog.close((actions.find((a) => a.primary) || actions.at(-1))?.value || "");
    });
    dialog.returnValue = "";
    dialog.showModal();
  });
}
export const askToConfirm = async (message) => (await showDialog({ title: "Удалить вышивку?", message, actions: [{ value: "cancel", label: "Отмена" }, { value: "confirm", label: "Удалить", danger: true }] })).value === "confirm";
export const makeId = () => crypto.randomUUID();
