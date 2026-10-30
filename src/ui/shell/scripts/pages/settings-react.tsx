/**
 * Настройки — центральный модал shell-страницы.
 * Категории соответствуют ключам settings-store.js (Cookie Code).
 *
 * Заменяет старый DOM-инжект (src/preload/dom/settings-tab.js).
 */
import { createElement, useState, useEffect, useCallback, useRef } from "react";
import { api, ckAlert, ckConfirm } from "../shared.js";
import { useHideAiView } from "../use-hide-ai-view.js";
import { Select } from "../components/select.js";
import { SettingRow } from "../components/setting-row.js";

/** Свитч-карточка (крупный toggle) */
function Toggle({
  label,
  desc,
  checked,
  onChange,
}: {
  label: string;
  desc?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return createElement(
    "div",
    { className: "ck-switch-card", onClick: () => onChange(!checked) },
    createElement(
      "div",
      { className: "ck-switch-text" },
      createElement("div", { className: "ck-switch-label" }, label),
      desc ? createElement("div", { className: "ck-switch-desc" }, desc) : null,
    ),
    createElement(
      "label",
      {
        className: "ck-switch ck-switch-lg",
        onClick: (e: any) => e.stopPropagation(),
      },
      createElement("input", {
        type: "checkbox",
        checked,
        onChange: (e: any) => onChange(e.target.checked),
      }),
      createElement("span", { className: "ck-switch-track" }),
    ),
  );
}

/** Слайдер (диапазон) */
function Slider({
  label,
  value,
  min,
  max,
  step,
  unit,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  onChange: (v: number) => void;
}) {
  return createElement(
    "div",
    { className: "cuckoo-blur-row" },
    createElement(
      "div",
      { className: "cuckoo-blur-label" },
      createElement("span", null, label),
      createElement(
        "span",
        { className: "cuckoo-blur-value" },
        value + " " + unit,
      ),
    ),
    createElement("input", {
      type: "range",
      min,
      max,
      step,
      value,
      className: "cuckoo-blur-slider",
      onChange: (e: any) => onChange(Number(e.target.value)),
    }),
  );
}

export function SettingsModal({ onClose }: { onClose: () => void }) {
  useHideAiView();

  const [data, setData] = useState<any>(null);
  const [active, setActive] = useState("appearance");
  const [loading, setLoading] = useState(true);
  const [savedTip, setSavedTip] = useState("");
  const [backgrounds, setBackgrounds] = useState<any[]>([]);
  const [fonts, setFonts] = useState<any[]>([
    { id: "system", name: "Системный" },
  ]);
  const [pets, setPets] = useState<any[]>([]);
  const [logInfo, setLogInfo] = useState<any>(null);
  const [appVersion, setAppVersion] = useState("—");
  const [updateChecking, setUpdateChecking] = useState(false);
  const [updateStatus, setUpdateStatus] = useState<{
    text: string;
    kind: "info" | "success" | "error";
  } | null>(null);

  const dirtyRef = useRef(false);
  const saveTimer = useRef<any>(null);

  // Версия приложения из API (CHANGELOG / package.json).
  useEffect(() => {
    const anyApi = api as any;
    if (anyApi.getAppInfo) {
      anyApi
        .getAppInfo()
        .then((r: any) => {
          if (r && r.success) setAppVersion(r.version || "—");
        })
        .catch(() => {});
    }
  }, []);

  const checkUpdates = useCallback(async () => {
    const anyApi = api as any;
    if (!anyApi.checkUpdate) return;
    setUpdateChecking(true);
    setUpdateStatus({ text: "Проверка обновлений…", kind: "info" });
    try {
      const r: any = await anyApi.checkUpdate();
      const st = r && r.status;
      if (st === "dev")
        setUpdateStatus({
          text: "Проверка обновлений недоступна в dev-режиме",
          kind: "info",
        });
      else if (st === "available")
        setUpdateStatus({
          text: "Доступна новая версия: v" + (r.version || "?"),
          kind: "success",
        });
      else if (st === "ready")
        setUpdateStatus({
          text: "Обновление скачано — перезапустите приложение",
          kind: "success",
        });
      else if (st === "up-to-date")
        setUpdateStatus({
          text: "Обновлений нет — у вас последняя версия",
          kind: "success",
        });
      else
        setUpdateStatus({
          text: "Ошибка проверки: " + ((r && r.error) || "неизвестно"),
          kind: "error",
        });
    } catch (e: any) {
      setUpdateStatus({
        text: "Ошибка: " + (e && e.message ? e.message : String(e)),
        kind: "error",
      });
    } finally {
      setUpdateChecking(false);
    }
  }, []);

  const load = useCallback(async () => {
    if (!api.getSettings) {
      setLoading(false);
      return;
    }
    try {
      const r = await api.getSettings();
      if (r && r.success && r.data) {
        dirtyRef.current = false;
        setData(r.data);
      }
    } catch (_) {}
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Подгрузка списков
  useEffect(() => {
    (async () => {
      try {
        if ((api as any).listBackgrounds) {
          const r = await (api as any).listBackgrounds();
          if (r && r.success) setBackgrounds(r.items || []);
        }
      } catch (_) {}
      try {
        if ((api as any).listFonts) {
          const r = await (api as any).listFonts();
          if (r && r.success) setFonts(r.items || []);
        }
      } catch (_) {}
      try {
        if ((api as any).listPets) {
          const r = await (api as any).listPets();
          if (r && r.success) setPets(r.items || []);
        }
      } catch (_) {}
    })();
  }, []);

  const loadLogInfo = useCallback(async () => {
    if (!(api as any).getLogInfo) return;
    try {
      const r = await (api as any).getLogInfo();
      if (r && r.success) setLogInfo(r);
    } catch (_) {}
  }, []);
  useEffect(() => {
    if (active === "logs") loadLogInfo();
  }, [active, loadLogInfo]);

  // Автосохранение (debounce 500ms)
  useEffect(() => {
    if (!data || !dirtyRef.current || !api.saveSettings) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        const r = await api.saveSettings(data);
        if (r && r.success) {
          setSavedTip("Сохранено");
          setTimeout(() => setSavedTip(""), 1500);
        } else setSavedTip("Ошибка сохранения");
      } catch (_) {
        setSavedTip("Ошибка сохранения");
      }
    }, 500);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [data]);

  const upd = useCallback((k: string, v: any) => {
    dirtyRef.current = true;
    setData((d: any) => ({ ...(d || {}), [k]: v }));
  }, []);

  const reset = useCallback(async () => {
    if (!(await ckConfirm("Восстановить настройки по умолчанию?", "Сброс")))
      return;
    try {
      const anyApi = api as any;
      if (anyApi.resetSettings) {
        const r = await anyApi.resetSettings();
        if (r && r.success) {
          setData(r.data || {});
          setSavedTip("Сброшено");
          setTimeout(() => setSavedTip(""), 1500);
        }
      }
    } catch (e) {
      ckAlert("Ошибка: " + (e as any).message);
    }
  }, []);

  if (loading || !data) {
    return createElement(
      "div",
      {
        className: "ck-settings-mask",
        onClick: (e: any) => {
          if (e.target === e.currentTarget) onClose();
        },
      },
      createElement(
        "div",
        {
          className: "ck-settings-dialog",
          onClick: (e: any) => e.stopPropagation(),
        },
        createElement("div", { className: "ck-list-empty" }, "Загрузка…"),
      ),
    );
  }

  // ===== Категории =====
  const appearance = createElement(
    "div",
    null,
    createElement(
      "div",
      { className: "cuckoo-section-title" },
      "Тема оформления",
    ),
    createElement(
      SettingRow,
      { label: "Тема", desc: "Как в системе, всегда светлая или тёмная" },
      createElement(Select, {
        value: data.theme || "system",
        onChange: (v: string) => {
          upd("theme", v);
          const anyApi = api as any;
          if (anyApi.themeSet) anyApi.themeSet(v);
        },
        options: [
          { value: "system", label: "Как в системе" },
          { value: "light", label: "Светлая" },
          { value: "dark", label: "Тёмная" },
        ],
      }),
    ),
    createElement("div", { className: "cuckoo-section-title" }, "Фон"),
    createElement(
      SettingRow,
      { label: "Фон", desc: "Встроенный или пользовательский" },
      createElement(Select, {
        value: data.background || "none",
        onChange: (v: string) => upd("background", v),
        options: [
          { value: "none", label: "Нет" },
          ...backgrounds.map((b: any) => ({
            value: b.id,
            label: b.name || b.id,
          })),
        ],
      }),
    ),
    createElement(
      SettingRow,
      { label: "Размытие фона" },
      createElement(Slider, {
        label: "Размытие фона",
        value: data.backgroundBlur || 0,
        min: 0,
        max: 30,
        step: 1,
        unit: "px",
        onChange: (v: number) => upd("backgroundBlur", v),
      }),
    ),
    createElement("div", { className: "cuckoo-section-title" }, "Шрифт"),
    createElement(
      SettingRow,
      { label: "Шрифт интерфейса" },
      createElement(Select, {
        value: data.font || "system",
        onChange: (v: string) => upd("font", v),
        options: fonts.map((f: any) => ({
          value: f.id,
          label: f.name || f.id,
        })),
      }),
    ),
    createElement(
      SettingRow,
      { label: "Толщина шрифта" },
      createElement(Select, {
        value: String(data.fontWeight || 400),
        onChange: (v: string) => upd("fontWeight", Number(v)),
        options: [
          { value: "300", label: "Тонкий" },
          { value: "400", label: "Обычный" },
          { value: "500", label: "Средний" },
          { value: "700", label: "Жирный" },
        ],
      }),
    ),
    createElement(
      SettingRow,
      { label: "Цвет шрифта", desc: "Оставьте пустым для авто" },
      createElement("input", {
        className: "ck-input",
        type: "text",
        value: data.fontColor || "",
        placeholder: "#ffffff",
        style: { width: 120 },
        onChange: (e: any) => upd("fontColor", e.target.value),
      }),
    ),
    createElement(
      "div",
      { className: "cuckoo-section-title" },
      "Прозрачность шапки и сайдбара",
    ),
    createElement(Slider, {
      label: "Шапка",
      value: data.headerOpacity ?? 45,
      min: 0,
      max: 100,
      step: 5,
      unit: "%",
      onChange: (v: number) => upd("headerOpacity", v),
    }),
    createElement(Slider, {
      label: "Сайдбар",
      value: data.sidebarOpacity ?? 45,
      min: 0,
      max: 100,
      step: 5,
      unit: "%",
      onChange: (v: number) => upd("sidebarOpacity", v),
    }),
    createElement(Slider, {
      label: "Размытие шапки",
      value: data.headerBlur ?? 12,
      min: 0,
      max: 30,
      step: 1,
      unit: "px",
      onChange: (v: number) => upd("headerBlur", v),
    }),
    createElement(Slider, {
      label: "Размытие сайдбара",
      value: data.sidebarBlur ?? 12,
      min: 0,
      max: 30,
      step: 1,
      unit: "px",
      onChange: (v: number) => upd("sidebarBlur", v),
    }),
    createElement("div", { className: "cuckoo-section-title" }, "Tool-блоки"),
    createElement(Slider, {
      label: "Прозрачность tool-блоков",
      value: data.toolBlockOpacity ?? 55,
      min: 0,
      max: 100,
      step: 5,
      unit: "%",
      onChange: (v: number) => upd("toolBlockOpacity", v),
    }),
    createElement(Slider, {
      label: "Размытие tool-блоков",
      value: data.toolBlockBlur ?? 0,
      min: 0,
      max: 30,
      step: 1,
      unit: "px",
      onChange: (v: number) => upd("toolBlockBlur", v),
    }),
    createElement("div", { className: "cuckoo-section-title" }, "Питомец"),
    createElement(Toggle, {
      label: "Показывать питомца",
      desc: "Анимированный чубрик",
      checked: data.petEnabled !== false,
      onChange: (v: boolean) => upd("petEnabled", v),
    }),
    createElement(
      SettingRow,
      { label: "Спрайт" },
      createElement(Select, {
        value: data.petId || "",
        onChange: (v: string) => upd("petId", v),
        options: [
          { value: "", label: "Авто" },
          ...pets.map((p: any) => ({ value: p.id, label: p.name || p.id })),
        ],
      }),
    ),
    createElement(
      SettingRow,
      { label: "Размер" },
      createElement(Slider, {
        label: "Размер",
        value: data.petSize ?? 64,
        min: 32,
        max: 128,
        step: 8,
        unit: "px",
        onChange: (v: number) => upd("petSize", v),
      }),
    ),
  );

  const language = createElement(
    "div",
    null,
    createElement(
      SettingRow,
      { label: "Язык интерфейса" },
      createElement(Select, {
        value: data.language || "ru",
        onChange: (v: string) => {
          upd("language", v);
          try {
            (window as any).__ckSetLang?.(v === "en" ? "en" : "ru");
          } catch (_) {}
        },
        options: [
          { value: "ru", label: "Русский" },
          { value: "en", label: "English" },
        ],
      }),
    ),
  );

  const behavior = createElement(
    "div",
    null,
    createElement(Toggle, {
      label: "Кастомизация",
      desc: "Применять фоны/шрифты/прозрачность",
      checked: data.customizationEnabled !== false,
      onChange: (v: boolean) => upd("customizationEnabled", v),
    }),
    createElement(Toggle, {
      label: "Прятать системные сообщения",
      checked: !!data.hideSystemMessages,
      onChange: (v: boolean) => upd("hideSystemMessages", v),
    }),
    createElement(Toggle, {
      label: "Чипы файловых путей",
      desc: "Кликабельные пути под ответом",
      checked: data.fileChipEnabled !== false,
      onChange: (v: boolean) => upd("fileChipEnabled", v),
    }),
    createElement(Toggle, {
      label: "Показывать затронутые файлы",
      checked: data.showProducedFiles !== false,
      onChange: (v: boolean) => upd("showProducedFiles", v),
    }),
    createElement(Toggle, {
      label: "Показывать токены диалога",
      checked: !!data.showConvTokens,
      onChange: (v: boolean) => upd("showConvTokens", v),
    }),
    createElement(Toggle, {
      label: "Автоформаттеры",
      desc: "Применять prettier/gofmt после edit",
      checked: data.formattersEnabled !== false,
      onChange: (v: boolean) => upd("formattersEnabled", v),
    }),
    createElement(
      SettingRow,
      { label: "Подтверждение tool-вызовов" },
      createElement(Select, {
        value: data.toolApprovalMode || "off",
        onChange: (v: string) => upd("toolApprovalMode", v),
        options: [
          { value: "off", label: "Не спрашивать" },
          { value: "risky", label: "Только опасные" },
          { value: "all", label: "Все" },
        ],
      }),
    ),
  );

  const telegram = createElement(
    "div",
    null,
    createElement(Toggle, {
      label: "Telegram-бот включён",
      checked: !!data.telegramEnabled,
      onChange: (v: boolean) => upd("telegramEnabled", v),
    }),
    createElement(
      SettingRow,
      { label: "Токен бота", desc: "От @BotFather" },
      createElement("input", {
        className: "ck-input",
        type: "text",
        value: data.telegramBotToken || "",
        onChange: (e: any) => upd("telegramBotToken", e.target.value),
        style: { width: 320 },
      }),
    ),
    createElement(
      SettingRow,
      { label: "Chat ID", desc: "Куда отправлять уведомления" },
      createElement("input", {
        className: "ck-input",
        type: "text",
        value: data.telegramChatId || "",
        onChange: (e: any) => upd("telegramChatId", e.target.value),
        style: { width: 200 },
      }),
    ),
    createElement(Toggle, {
      label: "Уведомлять о tool-вызовах",
      checked: !!data.telegramNotifyTools,
      onChange: (v: boolean) => upd("telegramNotifyTools", v),
    }),
    createElement(Toggle, {
      label: "Синхронизировать чат",
      desc: "Пересылать сообщения в TG",
      checked: !!data.telegramChatFeed,
      onChange: (v: boolean) => upd("telegramChatFeed", v),
    }),
    createElement(Toggle, {
      label: "Голосовые сообщения",
      checked: !!data.telegramVoiceEnabled,
      onChange: (v: boolean) => upd("telegramVoiceEnabled", v),
    }),
  );

  const stats = createElement(
    "div",
    null,
    createElement(Toggle, {
      label: "Собирать статистику",
      desc: "Сессии/сообщения/токены",
      checked: data.statsEnabled !== false,
      onChange: (v: boolean) => upd("statsEnabled", v),
    }),
    createElement(Toggle, {
      label: "Дашборд на главной",
      checked: data.statsDashboardEnabled !== false,
      onChange: (v: boolean) => upd("statsDashboardEnabled", v),
    }),
    createElement(Toggle, {
      label: "Debug-режим статистики",
      checked: !!data.statsDebugMode,
      onChange: (v: boolean) => upd("statsDebugMode", v),
    }),
  );

  const security = createElement(
    "div",
    null,
    createElement(
      "div",
      { className: "cuckoo-section-title" },
      "Опасные команды",
    ),
    createElement(
      "div",
      { className: "ck-set-row-desc" },
      "Регулярные выражения, при совпадении с которыми команда считается опасной и требует подтверждения.",
    ),
    createElement("textarea", {
      className: "ck-textarea",
      value: (data.dangerousPatterns || []).join("\n"),
      onChange: (e: any) =>
        upd("dangerousPatterns", e.target.value.split("\n").filter(Boolean)),
      rows: 10,
      style: { width: "100%", fontFamily: "monospace", fontSize: 12 },
    }),
  );

  const logs = createElement(
    "div",
    null,
    logInfo
      ? createElement(
          SettingRow,
          { label: "Расположение логов" },
          createElement(
            "div",
            {
              style: {
                fontSize: 12,
                fontFamily: "monospace",
                color: "var(--ck-text-dim)",
              },
            },
            logInfo.dir || "—",
          ),
        )
      : null,
    createElement(
      SettingRow,
      { label: "Открыть папку логов" },
      createElement(
        "button",
        {
          className: "ck-btn",
          onClick: () => {
            const anyApi = api as any;
            if (anyApi.openLogDir) anyApi.openLogDir();
          },
        },
        "Открыть",
      ),
    ),
    createElement(
      SettingRow,
      { label: "Очистить логи" },
      createElement(
        "button",
        {
          className: "ck-btn ck-btn-danger",
          onClick: async () => {
            if (!(await ckConfirm("Очистить все логи?", "Логи"))) return;
            const anyApi = api as any;
            if (anyApi.deleteLogs) {
              await anyApi.deleteLogs();
              loadLogInfo();
            }
          },
        },
        "Очистить",
      ),
    ),
  );

  const about = createElement(
    "div",
    null,
    createElement(
      SettingRow,
      { label: "Cookie Code", desc: "Версия" },
      createElement(
        "span",
        { style: { fontFamily: "monospace", fontSize: 13 } },
        appVersion || "—",
      ),
    ),
    createElement(
      SettingRow,
      { label: "Проверить обновления" },
      createElement(
        "button",
        {
          className: "ck-btn",
          disabled: updateChecking,
          onClick: checkUpdates,
        },
        updateChecking ? "Проверка…" : "Проверить",
      ),
    ),
    updateStatus
      ? createElement(
          "div",
          {
            className: "ck-set-row-desc",
            style: {
              marginTop: 8,
              color:
                updateStatus.kind === "error"
                  ? "#e55"
                  : updateStatus.kind === "success"
                    ? "#4ade80"
                    : "var(--ck-text-dim)",
            },
          },
          updateStatus.text,
        )
      : null,
    createElement(
      SettingRow,
      { label: "Исходники" },
      createElement(
        "button",
        {
          className: "ck-btn",
          onClick: () => {
            const anyApi = api as any;
            if (anyApi.openExternal)
              anyApi.openExternal("https://github.com/merfiDEV/Cookie-code");
          },
        },
        "GitHub",
      ),
    ),
  );

  // Иконки Material Symbols (outlined, 24x24) для навигации.
  const ICONS: Record<string, string> = {
    appearance:
      "M12 3a9 9 0 1 0 9 9c0-1.1-.9-2-2-2h-1.2a2 2 0 0 1-1.7-3l.3-.5c.6-1 .2-2.3-.9-2.7A9 9 0 0 0 12 3zM7 10a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm3-4a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm5 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm3 4a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z",
    language:
      "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM4.1 9h3.1c.2-1.6.6-3 1.2-4.2A8 8 0 0 0 4.1 9zm0 6a8 8 0 0 0 4.3 4.2A15 15 0 0 1 7.2 15H4.1zm3.1-2h9.6a13 13 0 0 0 0-2H7.2a13 13 0 0 0 0 2zm2.2-8.2c-.6 1.2-1 2.6-1.2 4.2H11V4.8c-.5 0-1 .1-1.5.2zM13 4.8V9h3.8c-.2-1.6-.6-3-1.2-4.2-.8 0-1.7 0-2.6 0zM13 15v4.2c.9 0 1.8 0 2.6-.1.6-1.2 1-2.6 1.2-4.1H13zm-2 4.2V15H7.2c.2 1.6.6 3 1.2 4.2.5.1 1 .2 1.6.2s1.1-.1 1.6-.2zm5.3.4A8 8 0 0 0 19.9 15h-3.1c-.2 1.7-.6 3.1-1.2 4.3.2 0 .4 0 .7-.1zM16.8 4.8c.6 1.2 1 2.6 1.2 4.2h3.1a8 8 0 0 0-4.3-4.2z",
    behavior:
      "M12 2 4 6v6c0 5 3.4 9.7 8 11 4.6-1.3 8-6 8-11V6l-8-4zm0 4.5 5 2.5v3c0 3.5-2.2 6.9-5 8-2.8-1.1-5-4.5-5-8V9l5-2.5z",
    telegram:
      "M21.9 4.6 2.8 11.9c-1 .4-1 1.8.1 2.1l4.8 1.5 1.8 5.6c.3.9 1.4 1.1 2 .4l2.6-2.6 4.8 3.5c.8.6 1.9.2 2.1-.8l2.4-11.3c.2-1-.7-1.8-1.5-1.7zM9.3 14.1l-.3 3.1-1-3.1 7.4-4.7-6.1 4.7z",
    stats: "M4 20h16v-2H4v2zM6 16h2v-6H6v6zm5 0h2V4h-2v12zm5 0h2v-8h-2v8z",
    security:
      "M12 2 4 5v6c0 5.5 3.4 10.7 8 12 4.6-1.3 8-6.5 8-12V5l-8-3zm0 2.2 6 2.3v4.5c0 4.4-2.7 8.5-6 9.8-3.3-1.3-6-5.4-6-9.8V6.5l6-2.3zM12 8a2 2 0 0 0-1 3.7V15h2v-3.3A2 2 0 0 0 12 8z",
    logs: "M6 2h9l5 5v15H6V2zm8 2v4h4l-4-4zM8 12h8v2H8v-2zm0 4h8v2H8v-2z",
    about:
      "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z",
  };

  const NAV: [string, string][] = [
    ["appearance", "Внешний вид"],
    ["language", "Язык"],
    ["behavior", "Поведение"],
    ["telegram", "Telegram"],
    ["stats", "Статистика"],
    ["security", "Безопасность"],
    ["logs", "Логи"],
    ["about", "О программе"],
  ];

  const navIcon = (id: string) =>
    createElement(
      "svg",
      {
        className: "ck-set-nav-icon",
        viewBox: "0 0 24 24",
        width: 18,
        height: 18,
        fill: "currentColor",
        "aria-hidden": true,
      },
      createElement("path", { d: ICONS[id] || ICONS.about }),
    );

  let content: any = null;
  if (active === "appearance") content = appearance;
  else if (active === "language") content = language;
  else if (active === "behavior") content = behavior;
  else if (active === "telegram") content = telegram;
  else if (active === "stats") content = stats;
  else if (active === "security") content = security;
  else if (active === "logs") content = logs;
  else if (active === "about") content = about;

  const pageTitle = (NAV.find(([id]) => id === active) || ["", ""])[1];

  return createElement(
    "div",
    {
      className: "ck-settings-mask",
      onClick: (e: any) => {
        if (e.target === e.currentTarget) onClose();
      },
    },
    createElement(
      "div",
      {
        className: "ck-settings-dialog",
        onClick: (e: any) => e.stopPropagation(),
      },
      createElement(
        "div",
        { className: "ck-settings-head" },
        createElement("div", { style: { flex: 1 } }),
        createElement(
          "button",
          {
            className: "ck-settings-close",
            title: "Закрыть (ESC)",
            onClick: onClose,
          },
          "✕",
        ),
      ),
      createElement(
        "div",
        { className: "ck-set-layout" },
        createElement(
          "div",
          { className: "ck-set-nav" },
          ...NAV.map(([id, label]) =>
            createElement(
              "button",
              {
                key: id,
                className: "ck-set-nav-item" + (active === id ? " active" : ""),
                onClick: () => setActive(id),
              },
              navIcon(id),
              createElement("span", null, label),
            ),
          ),
          createElement(
            "div",
            { className: "ck-set-nav-foot" },
            createElement(
              "button",
              {
                className: "ck-set-nav-reset",
                disabled: loading,
                onClick: reset,
              },
              "Восстановить по умолчанию",
            ),
          ),
        ),
        createElement(
          "div",
          { className: "ck-set-content" },
          pageTitle
            ? createElement(
                "div",
                { className: "ck-set-page-title" },
                pageTitle,
              )
            : null,
          content,
        ),
      ),
      savedTip
        ? createElement(
            "div",
            { className: "ck-settings-saved ck-settings-saved-top" },
            savedTip,
          )
        : null,
    ),
  );
}
