/**
 * Инструмент exit_plan_mode — завершение режима плана и отправка плана
 * пользователю на утверждение.
 *
 * Модель в режиме плана: исследует проект (только чтение) → записывает план
 * в plan.md → вызывает exit_plan_mode(). План показывается пользователю,
 * который соглашается или отклоняет его.
 */
const fs = require("fs");
const path = require("path");
const { Tool, ToolResult } = require("./ToolRegistry");

const PLAN_FILE = "plan.md";

class ExitPlanModeTool extends Tool {
  constructor() {
    super(
      "exit_plan_mode",
      "Завершить режим плана и показать план пользователю на утверждение. " +
        "Вызывай только когда план полностью готов и записан в plan.md. " +
        "Можно передать markdown плана в параметре plan; иначе будет прочитан plan.md из корня проекта.",
      {
        type: "object",
        properties: {
          plan: {
            type: "string",
            description:
              "Markdown-текст плана (необязательно; иначе читается plan.md из корня проекта)",
          },
        },
        additionalProperties: false,
      },
      "exitPlanMode(plan?)",
    );
  }

  getPromptSection() {
    return {
      name: "tool:exit_plan_mode",
      order: 106,
      text:
        "В режиме плана, когда план готов и записан в plan.md, вызови exit_plan_mode() " +
        "(можно передать markdown плана в параметре plan). Пользователь увидит план и решит: " +
        "согласиться (тогда ограничения снимаются и можно приступать к реализации) или отклонить " +
        "(тогда учти замечания, обнови plan.md и вызови exit_plan_mode() снова). " +
        "Не вызывай exit_plan_mode, пока план не готов.",
    };
  }

  async execute(params) {
    const { projectDir, plan, exitPlanMode } = params || {};

    let planText = typeof plan === "string" ? plan.trim() : "";
    if (!planText) {
      if (!projectDir) {
        return ToolResult.error(
          "Не удалось прочитать план: не выбран каталог проекта",
        );
      }
      try {
        planText = fs
          .readFileSync(path.join(projectDir, PLAN_FILE), "utf-8")
          .trim();
      } catch (err) {
        return ToolResult.error(
          "Не удалось прочитать " + PLAN_FILE + ": " + err.message,
        );
      }
    }
    if (!planText) {
      return ToolResult.error(
        "План пуст. Сначала запиши план в " + PLAN_FILE + ".",
      );
    }
    if (typeof exitPlanMode !== "function") {
      return ToolResult.error(
        "Инструмент exit_plan_mode недоступен в текущем окне",
      );
    }

    try {
      const res = await exitPlanMode(planText);
      if (res && res.approved) {
        return ToolResult.success({
          approved: true,
          message:
            "Пользователь согласовал план. Режим плана завершён, ограничения сняты — " +
            "приступай к реализации строго по плану.",
        });
      }
      const comments = Array.isArray(res && res.comments) ? res.comments : [];
      let message =
        "Пользователь отклонил план. Ознакомься с замечаниями, обнови plan.md и снова вызови " +
        "exit_plan_mode(), когда план будет готов.";
      if (comments.length > 0) {
        const lines = comments.map((c, i) => {
          const where =
            c && c.selection ? " [выделено: " + c.selection + "]" : "";
          const src = c && c.line ? " (строка: " + c.line + ")" : "";
          const text = (c && c.text) || "";
          return i + 1 + ". " + text + src + where;
        });
        message += "\n\nЗамечания пользователя к плану:\n" + lines.join("\n");
      }
      return ToolResult.success({ approved: false, comments, message });
    } catch (err) {
      return ToolResult.error(
        "Не удалось показать план пользователю: " + err.message,
      );
    }
  }
}

module.exports = { ExitPlanModeTool, PLAN_FILE };
