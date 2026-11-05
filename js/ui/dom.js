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
export function showDialog({ title, message, fields = [], actions = [] }) {
  let dialog = document.querySelector("#app-dialog");
  if (!dialog) {
    dialog = document.createElement("dialog");
    dialog.id = "app-dialog";
    document.body.append(dialog);
  }
  dialog.innerHTML = `<form method="dialog"><h2>${escapeHtml(title)}</h2><p>${escapeHtml(message)}</p>${fields.map((f) => `<label>${escapeHtml(f.label)}<input name="value" maxlength="60" value="${escapeHtml(f.value || "")}"></label>`).join("")}<div class="dialog-actions">${actions.map((a) => `<button class="button ${a.danger ? "danger" : "secondary"}" value="${escapeHtml(a.value)}">${escapeHtml(a.label)}</button>`).join("")}</div></form>`;
  return new Promise((resolve) => {
    dialog.addEventListener("close", () => resolve({ value: dialog.returnValue, text: dialog.querySelector('input[name="value"]')?.value }), { once: true });
    dialog.showModal();
  });
}
export const askToConfirm = async (message) => (await showDialog({ title: "Удалить вышивку?", message, actions: [{ value: "cancel", label: "Отмена" }, { value: "confirm", label: "Удалить", danger: true }] })).value === "confirm";
export const makeId = () => crypto.randomUUID();
