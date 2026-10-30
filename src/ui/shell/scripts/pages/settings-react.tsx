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

  const dirtyRef = useRef(false);
  const saveTimer = useRef<any>(null);

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
        onChange: (v: string) => upd("language", v),
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
        "5.0.9",
      ),
    ),
    createElement(
      SettingRow,
      { label: "Проверить обновления" },
      createElement(
        "button",
        {
          className: "ck-btn",
          onClick: () => {
            const anyApi = api as any;
            if (anyApi.checkUpdate) anyApi.checkUpdate();
          },
        },
        "Проверить",
      ),
    ),
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
              label,
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
