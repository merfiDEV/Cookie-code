# Участие в разработке Cookie Code

Спасибо, что решили помочь проекту! Мы приветствуем любой вклад:

- Сообщения об ошибках
- Идеи и предложения по функциональности
- Улучшение документации
- Исправления или новые фичи в коде

## Настройка окружения разработки

1. Форкните репозиторий и склонируйте его локально.
2. Установите зависимости: `npm install`
   - Если npm сообщает, что postinstall-скрипт electron заблокирован (allowScripts), выполните:
     - `npm install-scripts approve electron`
     - затем `npm install`
   - Иначе бинарник electron не будет скачан и запуск упадёт с ошибкой.
3. Запустите приложение: `npm start`

## Стиль кода

- Отступ — 2 пробела
- Используйте `const` и `let`, избегайте `var`
- Осмысленные и описательные имена переменных и функций
- Добавляйте комментарии, особенно к сложной логике
- Пишите просто, следуйте принципу «наименьшего удивления»
- Перед началом работы создавайте отдельную ветку для feature или исправления.
  Используйте формат `feature/<short-name>` или `fix/<short-name>`, например:
  `feature/super-puper-update`.
- Следуйте существующей архитектуре, структуре файлов, API и стилю проекта.
  Не добавляйте новый подход, если в проекте уже есть подходящий шаблон.

## Pull Request

1. Ветка должна быть основана на актуальном `master`.
2. Перед отправкой протестируйте изменения: `npm start`.
3. Сообщения коммитов — короткие и точные, примерно в таком формате:
   - `feat: добавлена поддержка нового инструмента`
   - `fix: исправлен таймаут при выполнении команд`
   - `docs: обновлён README`
   - `refactor: переработана логика регистрации инструментов`
4. В описании PR укажите, что изменилось и как это тестировалось.

## Сообщения об ошибках

В Issue, пожалуйста, включите:

- Версию операционной системы
- Версию Node.js
- Шаги воспроизведения
- Ожидаемое и фактическое поведение
- Скриншоты или логи (если применимо)

## Добавление нового инструмента

Если хотите добавить новый инструмент, ориентируйтесь на существующие реализации в каталоге `tools/`:

1. Создайте `{ToolName}Tool.js` в `tools/`.
2. Реализуйте метод `execute(params, context)`.
3. Экспортируйте инструмент в `tools/index.js`.
4. Зарегистрируйте его в `ToolRegistry` (см. `src/main/tool-registry.js`).
5. Обновите `tools/rules.md` и `README.md`.

## Кодекс поведения

Участвуя в проекте, вы соглашаетесь соблюдать [Кодекс поведения](CODE_OF_CONDUCT.md).

## Лицензия

Проект распространяется под лицензией MIT. Все вклады подпадают под неё же.

---

# Contributing to Cookie Code

Thank you for helping improve the project! We welcome all contributions:

- Bug reports
- Feature ideas and suggestions
- Documentation improvements
- Bug fixes and new features

## Development Setup

1. Fork the repository and clone it locally.
2. Install dependencies: `npm install`
   - If npm reports that the Electron postinstall script was blocked by
     `allowScripts`, run:
     - `npm install-scripts approve electron`
     - then run `npm install` again.
   - Otherwise, the Electron binary will not be downloaded and the app will
     fail to start.
3. Start the application: `npm start`

## Code Style

- Use 2-space indentation.
- Use `const` and `let`; avoid `var`.
- Use meaningful and descriptive names for variables and functions.
- Add comments for complex logic where they improve maintainability.
- Keep the implementation simple and follow the principle of least surprise.
- Create a separate branch for every feature or fix before making changes.
  Use `feature/<short-name>` or `fix/<short-name>`, for example:
  `feature/super-puper-update`.
- Follow the existing project architecture, file structure, APIs, and coding
  style. Do not introduce a new pattern when an existing one fits.

## Pull Requests

1. Base your branch on the latest `master`.
2. Test your changes before submitting them: `npm start`.
3. Keep commit messages short and precise. Use the project convention:
   - `feat: add support for a new tool`
   - `fix: fix command execution timeout`
   - `docs: update README`
   - `refactor: restructure tool registration`
4. Describe what changed and how it was tested in the pull request.

## Bug Reports

Please include the following in an issue:

- Operating system version
- Node.js version
- Steps to reproduce
- Expected and actual behavior
- Screenshots or logs, when applicable

## Adding a New Tool

Use the existing implementations in `tools/` as a reference:

1. Create `{ToolName}Tool.js` in `tools/`.
2. Implement `execute(params, context)`.
3. Export the tool from `tools/index.js`.
4. Register it in `ToolRegistry` (see `src/main/tool-registry.js`).
5. Update `tools/rules.md` and `README.md`.

## Code of Conduct

By participating in this project, you agree to abide by the
[Code of Conduct](CODE_OF_CONDUCT.md).

## License

The project is distributed under the MIT license. All contributions are subject
to the same license.
