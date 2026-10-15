/**
 * Инструмент goal_done — явное завершение цели (goal mode).
 *
 * Порт из upstream wangyongpeng90/cuckoo-code (tools/impl/goal-done.ts).
 *
 * AI вызывает goalDone() когда все требования /goal-цели выполнены. Тул шлёт
 * IPC 'goal-done' в окно (senderId) → preload останавливает цикл автопродвижения.
 * Заменяет старый текстовый маркер [[GOAL_DONE]] (модель его забывала писать).
 */
const { Tool, ToolResult } = require("./ToolRegistry");

class GoalDoneTool extends Tool {
  constructor() {
    super(
      "goal_done",
      "Объявить, что текущая цель (/goal — автоматическая многораундовая задача) " +
        "полностью выполнена, и завершить автопродвижение. " +
        "Вызывай только когда все требования цели действительно выполнены; " +
        "перед вызовом дай в тексте итог выполнения. " +
        "В обычном диалоге (не режим цели) этот инструмент не нужен.",
      {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      "goalDone()",
    );
  }

  getPromptSection() {
    return {
      name: "tool:goal_done",
      order: 115,
      text:
        "Когда все требования /goal-цели действительно выполнены, вызови goalDone() " +
        "чтобы завершить автопродвижение; перед вызовом дай в тексте итог выполнения. " +
        "Если цель не завершена или встретилось препятствие — не вызывай, продолжай " +
        "или объясни причину. В обычном диалоге (не режим цели) не вызывай этот инструмент.",
    };
  }

  async execute(params) {
    const { goalDone, senderId, currentWindowId } = params || {};
    const targetWindowId =
      currentWindowId !== undefined && currentWindowId !== null
        ? currentWindowId
        : senderId;
    if (targetWindowId === undefined || targetWindowId === null) {
      return ToolResult.error(
        "Нет контекста окна — не удалось определить текущий чат",
      );
    }
    if (typeof goalDone !== "function") {
      return ToolResult.error("Инструмент goal_done недоступен в текущем окне");
    }
    try {
      const res = await goalDone(targetWindowId);
      if (res && res.success) {
        console.log(
          "[GoalDoneTool] AI объявил цель выполненной (window " +
            targetWindowId +
            ")",
        );
        return ToolResult.success({
          message: "Цель выполнена, автопродвижение завершено.",
        });
      }
      return ToolResult.error(
        (res && res.error) || "Не удалось завершить цель",
      );
    } catch (err) {
      return ToolResult.error(
        "Не удалось завершить цель: " + (err.message || String(err)),
      );
    }
  }
}

module.exports = { GoalDoneTool };
