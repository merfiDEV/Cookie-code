# Changelog

## [5.0.0] - 2024-10-05

### 🎉 Major Release — Cookie Code

**Breaking Changes:**
- 🍪 **Rebrand: Cuckoo Code → Cookie Code** — новое название, новая идентичность:
  - все пользовательские строки обновлены на "Cookie Code";
  - внутренние API и техническая терминология остались без изменений для совместимости.

### Added

- 📚 **Билингвальная документация** — теперь три README для разных аудиторий:
  - `README.md` (12K, русский) — краткая версия для русских пользователей;
  - `README.en.md` (12K, английский) — полная версия с чётким value proposition для международной аудитории;
  - `README.ru.md` (25K, русский) — полная техническая документация на русском.
- 🎨 **SVG-иконки вместо эмодзи** — заменили 🔄 на чистые SVG:
  - кнопка "Изменить" (проект) — иконка карандаша/редактирования;
  - кнопка "Обновить" (сессии, окна, MCP, diff) — иконка круговой стрелки;
  - `stroke="currentColor"` — автоматическая адаптация к цвету текста;
  - компактные 14×14px иконки с чёткими линиями.
- 🔧 **Улучшенный diff viewer** — 8 крупных апгрейдов:
  - навигация по hunks с кнопками ◀/▶ и хоткеями `n`/`p`;
  - внутристроковый diff (алгоритм Myers) — подсветка изменённых символов;
  - копирование — кнопка Copy для всего diff, клик на строку копирует без префикса;
  - фильтры — чекбоксы Added/Deleted/Context для скрытия ненужных строк;
  - мини-карта — вертикальная полоса с цветными сегментами изменений;
  - статистика — `📊 +234 -89 в 12 файлах` в списке;
  - кэширование — результаты git-команд сохраняются в Map;
  - перетаскиваемое окно — захват за шапку, сохранение позиции в localStorage.
- 📱 **Построчный diff в Telegram-уведомлениях** — операции `edit` теперь показывают реальные изменения:
  - вместо "было/стало" — unified diff с префиксами `+`/`-`/` `;
  - до 30 строк diff, затем `…(обрезано)`;
  - используется тот же `buildLineDiff` из `tools/line-diff.js`, что и в UI.

### Changed

- 📖 **Новая структура README** — English-first для GitHub-аудитории:
  - чёткая проблема → решение в первых строках;
  - value proposition: "Zero token cost + Real agent loop + Git integration";
  - конкретные примеры использования вместо технического описания;
  - призыв к действию — скачать бинарники.

### Removed

- 🗑️ **Устаревшие документы удалены из репозитория**:
  - `ROADMAP.ru.md` и `Roadmap.md` — 3-недельной давности, больше не актуальны;
  - `.cuckooCode/AUTO_UPDATE_RELEASE.md` — документация по auto-update на китайском;
  - `DIFF_IMPROVEMENTS.md` — временный документ с описанием улучшений (все реализованы).

### Added (EN)

- 📚 **Bilingual documentation** — three README files for different audiences:
  - `README.md` (12K, Russian) — concise version for Russian users;
  - `README.en.md` (12K, English) — full version with clear value proposition for international audience;
  - `README.ru.md` (25K, Russian) — complete technical documentation in Russian.
- 🎨 **SVG icons instead of emoji** — replaced 🔄 with clean SVG:
  - "Change" button (project) — pencil/edit icon;
  - "Refresh" button (sessions, windows, MCP, diff) — circular arrow icon;
  - `stroke="currentColor"` — automatic adaptation to text color;
  - compact 14×14px icons with sharp lines.
- 🔧 **Enhanced diff viewer** — 8 major upgrades:
  - hunk navigation with ◀/▶ buttons and `n`/`p` hotkeys;
  - intra-line diff (Myers algorithm) — highlights changed characters;
  - copy — Copy button for full diff, click on line copies without prefix;
  - filters — Added/Deleted/Context checkboxes to hide unwanted lines;
  - mini-map — vertical bar with colored change segments;
  - statistics — `📊 +234 -89 in 12 files` in the list;
  - caching — git command results saved in Map;
  - draggable window — grab by header, position saved in localStorage.
- 📱 **Line-by-line diff in Telegram notifications** — `edit` operations now show real changes:
  - instead of "before/after" — unified diff with `+`/`-`/` ` prefixes;
  - up to 30 lines of diff, then `…(truncated)`;
  - uses the same `buildLineDiff` from `tools/line-diff.js` as the UI.

### Changed (EN)

- 📖 **New README structure** — English-first for GitHub audience:
  - clear problem → solution in the first lines;
  - value proposition: "Zero token cost + Real agent loop + Git integration";
  - concrete usage examples instead of technical description;
  - call to action — download binaries.

### Removed (EN)

- 🗑️ **Obsolete documents removed from repository**:
  - `ROADMAP.ru.md` and `Roadmap.md` — 3 weeks old, no longer relevant;
  - `.cuckooCode/AUTO_UPDATE_RELEASE.md` — auto-update documentation in Chinese;
  - `DIFF_IMPROVEMENTS.md` — temporary document describing improvements (all implemented).
