const { Tool, ToolResult } = require("./ToolRegistry");
const fs = require("fs");
const path = require("path");

// Лимит Telegram Bot API на документы — 50 MB. Оставляем запас и режем на 45 MB.
const MAX_FILE_SIZE = 45 * 1024 * 1024;

// Предел подписи (caption) в Telegram — 1024 символа.
const MAX_CAPTION_LEN = 1024;

/**
 * attach_telegram — прикрепить локальный файл и отправить его пользователю
 * в Telegram через уже настроенного бота (botsrc/telegram.js).
 *
 * Транспорт (telegramBot.sendDocument) — singleton из botsrc/telegram.js.
 * Настройки (token/chatId/enabled) берём из settings-store; их можно
 * переопределить параметрами token/chatId.
 *
 * Требует только Node API (fs/path) + fetch, которые уже используются
 * в telegram.js, — новых зависимостей нет.
 */
class AttachTelegramTool extends Tool {
  constructor() {
    super(
      "attach_telegram",
      "Прикрепить локальный файл и отправить его пользователю в Telegram как документ. Используй, когда пользователь просит «отправь файл в телеграм», «прикрепи в тг», «скинь мне в телеграм» и т.п. Работает только если Telegram-бот включён и настроены токен и chat_id. Поддерживаются любые типы файлов, размер до 45 MB.",
      {
        type: "object",
        properties: {
          filePath: {
            type: "string",
            description:
              "Путь к файлу для отправки (относительно корня проекта или абсолютный).",
          },
          caption: {
            type: "string",
            description:
              "Необязательная подпись к файлу в Telegram (до 1024 символов).",
          },
          comment: {
            type: "string",
            description:
              "Необязательный комментарий к файлу — то, что ИИ хочет добавить от себя (зачем файл, что внутри, на что обратить внимание). Уходит в Telegram как дополнительный текст: если caption задан, добавляется к нему отдельной строкой; если нет — отправляется отдельным сообщением после файла (до 1024 символов).",
          },
          fileName: {
            type: "string",
            description:
              "Необязательное имя файла, под которым он будет отправлен (по умолчанию — basename пути).",
          },
          chatId: {
            type: "string",
            description:
              "Необязательный chat_id получателя. По умолчанию берётся из настроек Cookie Code.",
          },
          token: {
            type: "string",
            description:
              "Необязательный токен бота. По умолчанию берётся из настроек Cookie Code.",
          },
        },
        required: ["filePath"],
        additionalProperties: false,
      },
      "attachTelegram(filePath, caption?, comment?)",
    );
  }

  getPromptSection() {
    return {
      name: "tool:attach_telegram",
      order: 115,
      text: "Когда пользователь просит отправить/прикрепить файл ему в Telegram («отправь в тг», «скинь файл в телеграм» и т.п.), используй attachTelegram(filePath, caption?, comment?). Инструмент отправит указанный файл документом через настроенного Telegram-бота. Необязательный comment — то, что ты хочешь добавить от себя (зачем файл, что внутри, на что обратить внимание); можно передать только comment, без caption. Требуется включённый бот с заданными токеном и chat_id (см. настройки Cookie Code). Поддерживаются любые типы файлов размером до 45 MB; для файлов больше лимита вернётся ошибка.",
    };
  }

  async execute(params) {
    const { filePath, caption, comment, fileName, chatId, token } = params || {};

    // Ленивая загрузка транспорта и настроек: инструмент может выполняться
    // вне electron-контекста (например, в тестах), поэтому require защищаем.
    let telegramBot;
    let settingsStore;
    try {
      ({ telegramBot } = require("../botsrc/telegram"));
    } catch (err) {
      return ToolResult.error(
        "Не удалось загрузить Telegram-транспорт: " + (err.message || String(err)),
      );
    }
    try {
      settingsStore = require("../src/main/settings-store");
    } catch (_) {
      settingsStore = null;
    }

    // Разрешаем путь (переиспользуем логику AttachFileTool).
    let absPath;
    try {
      const { resolveFilePath } = require("./AttachFileTool");
      const projectDir = params && params.projectDir ? params.projectDir : null;
      absPath = resolveFilePath(filePath, projectDir);
    } catch (err) {
      return ToolResult.error(
        "Некорректный путь к файлу: " + (err.message || String(err)),
      );
    }

    let stat;
    try {
      stat = fs.statSync(absPath);
    } catch (_) {
      return ToolResult.error("Файл не найден: " + absPath);
    }
    if (!stat.isFile()) {
      return ToolResult.error("Указанный путь не является файлом: " + absPath);
    }
    if (stat.size > MAX_FILE_SIZE) {
      return ToolResult.error(
        "Файл слишком большой: " +
          (stat.size / 1024 / 1024).toFixed(1) +
          " MB (лимит " +
          Math.round(MAX_FILE_SIZE / 1024 / 1024) +
          " MB).",
      );
    }

    // Настройки: params переопределяют settings-store.
    const s = settingsStore ? settingsStore.readSettings() : {};
    const useToken = String(token || (s && s.telegramBotToken) || "").trim();
    const useChatId = String(chatId || (s && s.telegramChatId) || "").trim();
    const enabled = s ? !!s.telegramEnabled : true;

    if (!enabled) {
      return ToolResult.error(
        "Telegram-бот выключен. Включи его в настройках Cookie Code (telegramEnabled).",
      );
    }
    if (!useToken) {
      return ToolResult.error(
        "Не задан токен Telegram-бота (telegramBotToken в настройках).",
      );
    }
    if (!useChatId) {
      return ToolResult.error(
        "Не задан chat_id получателя (telegramChatId в настройках).",
      );
    }

    // Настраиваем singleton под актуальные параметры и отправляем.
    try {
      telegramBot.configure(useToken, useChatId);
    } catch (_) {
      // configure может отсутствовать в моках — игнорируем.
    }

    const cap =
      caption == null ? "" : String(caption).slice(0, MAX_CAPTION_LEN);
    const cmt =
      comment == null ? "" : String(comment).slice(0, MAX_CAPTION_LEN);
    const sendName = fileName ? String(fileName) : path.basename(absPath);

    // Комментарий: если уже есть caption — приклеиваем к нему отдельной строкой
    // (один запрос); иначе отправим отдельным сообщением после файла.
    const finalCaption = (cmt ? (cap ? cap + "\n\n" + cmt : cmt) : cap).slice(
      0,
      MAX_CAPTION_LEN,
    );
    // Комментарий уже внутри finalCaption (см. выше) — отдельное сообщение не нужно.

    let result;
    try {
      result = await telegramBot.sendDocument(absPath, {
        chatId: useChatId,
        caption: finalCaption,
        fileName: sendName,
      });
    } catch (err) {
      return ToolResult.error(
        "Ошибка отправки в Telegram: " + (err.message || String(err)),
      );
    }

    if (!result || result.success !== true) {
      return ToolResult.error(
        "Не удалось отправить файл в Telegram: " +
          ((result && result.error) || "неизвестная ошибка"),
      );
    }

    return ToolResult.success({
      fileName: sendName,
      size: stat.size,
      messageId: result.messageId || null,
      message:
        "Файл отправлен в Telegram: " + sendName + " (" + stat.size + " байт)",
    });
  }
}

module.exports = {
  AttachTelegramTool,
  MAX_FILE_SIZE,
  MAX_CAPTION_LEN,
};