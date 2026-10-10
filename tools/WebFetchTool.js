const { Tool, ToolResult } = require("./ToolRegistry");
const TurndownService = require("turndown");
const { gfm } = require("@joplin/turndown-plugin-gfm");

// 默认上限（可被参数覆盖）
const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_MAX_OUTPUT_CHARS = 20000;
// 最多读取的原始字节数（防止超大响应）
const MAX_RAW_BYTES = 512000;

/**
 * HTML → Markdown 转换器。
 * - atx 标题、fenced 代码块、- 列表
 * - GFM 插件支持表格/删除线
 * - 移除 script/style/noscript（不保留其文本）
 */
const turndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  bulletListMarker: "-",
});
turndown.use(gfm);
turndown.remove(["script", "style", "noscript"]);

/**
 * 校验 url：trim 非空。
 */
function parseFetchArgs(url) {
  if (typeof url !== "string" || url.trim().length === 0) {
    throw new Error("url must be a non-empty string");
  }
  return { url };
}

/**
 * 从 content-type 头解析 charset。返回小写名称或 null。
 */
function charsetFromContentType(contentType) {
  if (!contentType) return null;
  const m = /charset\s*=\s*["']?([\w-]+)/i.exec(contentType);
  return m ? m[1].toLowerCase() : null;
}

/**
 * 从 HTML 头部（前若干字节）解析 <meta charset> 或 <meta http-equiv content=...>。
 * buffer 为原始字节。
 */
function charsetFromMeta(buffer) {
  // 只看前 4096 字节，按 latin1 读保证字节透明
  const head = buffer.slice(0, 4096).toString("latin1");
  let m = /<meta[^>]+charset\s*=\s*["']?([\w-]+)/i.exec(head);
  if (m) return m[1].toLowerCase();
  m =
    /<meta[^>]+http-equiv\s*=\s*["']?content-type["']?[^>]*content\s*=\s*["'][^"']*charset\s*=\s*([\w-]+)/i.exec(
      head,
    );
  return m ? m[1].toLowerCase() : null;
}

/**
 * 解码原始字节为文本。
 * 优先级：content-type charset → meta charset → utf-8。
 * 未知/不支持的 charset 回退 utf-8。解码失败再回退 utf-8 且不抛错。
 */
function decodeBody(buffer, contentType) {
  let charset = charsetFromContentType(contentType);
  if (!charset) charset = charsetFromMeta(buffer);
  if (!charset) charset = "utf-8";

  try {
    const decoder = new TextDecoder(charset, { fatal: false });
    return decoder.decode(buffer);
  } catch (_) {
    // 不支持的 charset 名称 → utf-8
    return new TextDecoder("utf-8", { fatal: false }).decode(buffer);
  }
}

/**
 * 将正文转换为最终文本（可选 HTML→Markdown），并按 maxChars 单次截断。
 * 返回 { text, truncated }。
 */
function renderBody(
  bodyKind,
  content,
  { raw = false, maxChars = DEFAULT_MAX_OUTPUT_CHARS } = {},
) {
  let text = typeof content === "string" ? content : "";
  if (bodyKind === "html" && !raw) {
    try {
      text = turndown.turndown(text);
    } catch (_) {
      // 转换失败降级为原始 HTML
      text = typeof content === "string" ? content : "";
    }
  }
  if (text.length > maxChars) {
    return { text: text.slice(0, maxChars), truncated: true };
  }
  return { text, truncated: false };
}

/**
 * 组装输出：
 * Fetched <url> (HTTP <status>)

<正文>
 * 截断时加 footer。maxChars 为正文（不含 header/footer）上限。
 */
function formatFetchOutput(
  url,
  statusCode,
  bodyKind,
  bodyContent,
  truncated,
  options = {},
) {
  const maxChars = options.maxChars || DEFAULT_MAX_OUTPUT_CHARS;
  const rendered = renderBody(bodyKind, bodyContent, { ...options, maxChars });
  const effectiveTruncated = Boolean(truncated) || rendered.truncated;
  const header = "Fetched " + url + " (HTTP " + statusCode + ")\n\n";
  const footer = effectiveTruncated
    ? "\n\n(Content truncated. Fetch a more specific URL or section for the full text.)"
    : "";
  return header + rendered.text + footer;
}

/**
 * web_fetch 工具。
 * 只要求 url，其余参数可选。返回转 Markdown 后的纯文本。
 */
class WebFetchTool extends Tool {
  constructor() {
    super(
      "web_fetch",
      "获取指定 HTTP(S) URL 的内容并解码为文本。HTML 会转换为 Markdown（turndown + GFM）。返回纯文本：Fetched <url> (HTTP <status>) + 正文。可选参数：maxChars（正文上限，默认 20000）、raw（true 则不做 HTML→Markdown）、timeoutMs（默认 15000）、userAgent（自定义 UA，不传则不发送该头）。内容超限会截断并附 footer。",
      {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: "要获取的 HTTP(S) URL",
          },
          maxChars: {
            type: "number",
            description: "正文最大字符数（默认 20000）",
          },
          raw: {
            type: "boolean",
            description: "为 true 时不做 HTML→Markdown 转换，直接返回原文",
          },
          timeoutMs: {
            type: "number",
            description: "请求超时毫秒数（默认 15000）",
          },
          userAgent: {
            type: "string",
            description: "自定义 User-Agent 请求头；不传则不发送该头",
          },
        },
        required: ["url"],
        additionalProperties: false,
      },
      "webFetch(url, maxChars?, raw?, timeoutMs?, userAgent?)",
    );
  }

  getPromptSection() {
    return {
      name: "tool:web_fetch",
      order: 111,
      text: "使用 webFetch 工具获取指定 HTTP(S) URL 的内容。返回解码为文本的页面内容（HTML 转 Markdown）。默认正文上限约 20000 字符，超出会截断并附 footer；可用 maxChars / raw / timeoutMs / userAgent 调整。使用其内容时，请以 markdown 链接形式引用 URL。",
    };
  }

  async execute(params) {
    const { url, maxChars, raw, timeoutMs, userAgent } = params;

    try {
      const input = parseFetchArgs(url);

      // 安全限制：只允许 http/https
      const parsedUrl = new URL(input.url);
      if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
        return ToolResult.error("仅支持 http/https 协议");
      }

      const effectiveTimeout =
        typeof timeoutMs === "number" && timeoutMs > 0
          ? timeoutMs
          : DEFAULT_TIMEOUT_MS;
      const effectiveMaxChars =
        typeof maxChars === "number" && maxChars > 0
          ? Math.floor(maxChars)
          : DEFAULT_MAX_OUTPUT_CHARS;

      const headers = {};
      if (typeof userAgent === "string" && userAgent.trim().length > 0) {
        headers["User-Agent"] = userAgent;
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), effectiveTimeout);

      try {
        const response = await fetch(input.url, {
          method: "GET",
          signal: controller.signal,
          headers,
        });

        // 流式读取，限制大小（原始字节）
        const reader = response.body ? response.body.getReader() : null;
        let receivedBytes = 0;
        const chunks = [];
        let truncated = false;

        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            receivedBytes += value.byteLength;
            if (receivedBytes > MAX_RAW_BYTES) {
              const remaining =
                MAX_RAW_BYTES - (receivedBytes - value.byteLength);
              if (remaining > 0) chunks.push(value.slice(0, remaining));
              truncated = true;
              try {
                await reader.cancel();
              } catch (_) {}
              break;
            }
            chunks.push(value);
          }
        }

        clearTimeout(timeoutId);

        const buffer = chunks.length ? Buffer.concat(chunks) : Buffer.alloc(0);

        // 判断 body kind：content-type 含 html 则为 html，否则 text
        const contentType = response.headers.get("content-type") || "";
        const bodyKind =
          contentType.includes("text/html") ||
          contentType.includes("application/xhtml")
            ? "html"
            : "text";

        // 解码（charset 感知）
        const rawText = decodeBody(buffer, contentType);

        const output = formatFetchOutput(
          response.url || input.url,
          response.status,
          bodyKind,
          rawText,
          truncated,
          { raw: raw === true, maxChars: effectiveMaxChars },
        );

        return ToolResult.success(output);
      } catch (err) {
        clearTimeout(timeoutId);
        if (err.name === "AbortError") {
          return ToolResult.error("请求超时 (超过 " + effectiveTimeout + "ms)");
        }
        return ToolResult.error("请求失败: " + err.message);
      }
    } catch (err) {
      return ToolResult.error("web_fetch 失败: " + err.message);
    }
  }
}

module.exports = { WebFetchTool, parseFetchArgs, formatFetchOutput };
