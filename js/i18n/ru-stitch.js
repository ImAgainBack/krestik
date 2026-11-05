export const stitchRu = {
  zoomHint: 'Приблизьте схему, чтобы отмечать крестики',
  paint: 'Отмечать подряд', allColors: 'Все цвета',
  saving: 'Сохраняем…', saved: 'Сохранено на телефоне',
  error: 'Не удалось сохранить — сохраните копию в файл',
  invalidBackup: 'Не удалось открыть копию: файл повреждён или версия не поддерживается',
};
export const stitchProgress = (done, total) => done === 0 ? 'Ещё не начата' : `Вышито ${done.toLocaleString('ru-RU')} из ${total.toLocaleString('ru-RU')}`;
export function crosses(count) {
  const n = count % 100, last = count % 10;
  return `${count.toLocaleString('ru-RU')} ${n >= 11 && n <= 14 ? 'крестиков' : last === 1 ? 'крестик' : last >= 2 && last <= 4 ? 'крестика' : 'крестиков'}`;
}
