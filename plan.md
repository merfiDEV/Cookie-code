## Состояние и следующий шаг

**Готово:** зависимости, src/ui/shell/ скопирован, .merge-upstream/ для справки.

**Следующий шаг:**

1. scripts/build-shell.mjs (наш, адаптированный)
2. src/preload/shell-preload.js (window.shellAPI)
3. Переписать createWindow (BrowserWindow=shell + WebContentsView=AI)
4. Новый src/main/shell-ipc.js (shell-navigate/back/forward/...)
5. Запуск, починка ошибок
