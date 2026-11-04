export const ru = {
  app: "Крестик", subtitle: "схемы для вышивки крестом",
  newProject: "Новая вышивка", projects: "Мои схемы", project: "схема", create: "Создать схему",
  emptyTitle: "Первая вышивка?", emptyText: "Выберите изображение, чтобы создать схему.",
  rename: "Переименовать", open: "Открыть", copy: "Копировать", delete: "Удалить", cancel: "Отмена", replace: "Заменить", search: "Поиск",
  stitch: "Вышивать", grid: "Схема", settings: "Настройки", camera: "Сделать снимок", useCamera: "Открыть камеру", chooseImage: "Выбрать изображение", gallery: "Из галереи", crop: "Обрезать изображение", moveCorners: "Переместите углы области вышивки.",
  chart: "Готовая схема", photo: "По фотографии", detect: "Найти сетку", cols: "Столбцы", rows: "Строки", lockRatio: "Сохранить пропорции", aida: "Канва Аида", cellsInch: "клеток на дюйм", colorsMax: "Максимум цветов", legendCodes: "Коды DMC из ключа схемы (необязательно)", photoDither: "Смешивание цветов фотографии", blankCanvas: "Сделать фон пустой канвой", cleanup: "Удаление одиночных крестиков", onlyStock: "Использовать только мои нитки", createGrid: "Создать схему",
  display: "Вид", both: "Всё", symbols: "Символы", colors: "Цвета", color: "Цвет", palette: "Палитра", filter: "Фильтр", close: "Закрыть", inventory: "Мои нитки", all: "Все", highlight: "Подсветить", mark: "Отметить", move: "Перемещение", undo: "Отменить", print: "Печать / PDF", export: "Экспорт PNG", checkHint: "Режим отметок · Нажимайте на клетки готовых крестиков", missingColor: "У меня нет этого цвета", 
  allColors: "Все цвета", owned: "Есть в запасе", missing: "Нет в запасе", toggleAll: "Отметить все", searchColor: "Код или название цвета", noColor: "Не найдено", closeTo: "Похожие оттенки", dmcNear: "Похожий цвет DMC…", searchDmc: "Код или название DMC", unknownCodes: "Неизвестные коды:", preview: "Предварительный просмотр", calculating: "Подготовка схемы…", finished: "Размер готовой вышивки", detected: "клеток обнаружено", checkCorners: "проверьте углы", uncertain: "Не удалось точно найти сетку. Настройте углы вручную.", photoAuto: "Это фото — схема будет создана по изображению.",
  errors: { readImage: "Не удалось открыть изображение.", createGrid: "Не удалось создать схему.", openProject: "Откройте схему из списка.", delete: "Удалить схему", renamePrompt: "Название схемы" },
};
export const formatNumber = (value, options = {}) => new Intl.NumberFormat("ru-RU", options).format(value);
export const skeinWord = (count) => {
  const category = new Intl.PluralRules("ru").select(count);
  return category === "one" ? "моток" : category === "few" ? "мотка" : "мотков";
};
export const russianPlural = (count, forms) => {
  const category = new Intl.PluralRules("ru").select(count);
  return forms[category];
};
export const formatSkeins = (count) => `${formatNumber(count)} ${skeinWord(count)}`;
export const formatSchemes = (count) => `${formatNumber(count)} ${russianPlural(count, { one: "схема", few: "схемы", many: "схем", other: "схем" })}`;
export const formatStitches = (count) => `${formatNumber(count)} ${russianPlural(count, { one: "крестик", few: "крестика", many: "крестиков", other: "крестиков" })}`;
