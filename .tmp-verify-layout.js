const http = require("http");
async function targets() {
  return new Promise((r) => {
    http.get("http://127.0.0.1:9340/json/list", (res) => {
      let d = "";
      res.on("data", (c) => (d += c));
      res.on("end", () => r(JSON.parse(d)));
    });
  });
}
async function evalWs(wsUrl, expr, ms = 5000) {
  return new Promise((res, rej) => {
    const ws = new WebSocket(wsUrl);
    const id = 1;
    const t = setTimeout(() => {
      try {
        ws.close();
      } catch (_) {}
      rej(new Error("timeout"));
    }, ms);
    ws.onopen = () =>
      ws.send(
        JSON.stringify({
          id,
          method: "Runtime.evaluate",
          params: {
            expression: expr,
            returnByValue: true,
            awaitPromise: false,
          },
        }),
      );
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.id === id) {
        clearTimeout(t);
        try {
          ws.close();
        } catch (_) {}
        res(m.result?.result?.value ?? m.result);
      }
    };
    ws.onerror = () => {
      clearTimeout(t);
      rej(new Error("ws err"));
    };
  });
}
(async () => {
  const t = await targets();
  const shell = t.find((x) => x.title === "Cookie Code");
  const ai = t.find((x) => x.title && x.title.includes("DeepSeek"));
  if (!shell) {
    console.log("no shell");
    return;
  }

  // Проверим .viewport rect
  const rect = await evalWs(
    shell.webSocketDebuggerUrl,
    `
    (() => {
      const vp = document.querySelector('.viewport');
      if (!vp) return null;
      const r = vp.getBoundingClientRect();
      return { x: r.left, y: r.top, w: r.width, h: r.height };
    })()
  `,
  );
  console.log("viewport rect:", JSON.stringify(rect));

  // Проверим, что AI view на самом деле имеет эти bounds (через main нельзя без preload API)
  // Просто убедимся, что viewport не занимает весь экран (sidebar collapsed / toolbar)
  if (rect) {
    console.log("sidebar width (should be ~0 если collapsed):", rect.x);
    console.log("toolbar height:", rect.y);
    console.log("viewport w+h:", rect.w, rect.h);
    console.log(
      "window.innerWidth/Height:",
      await evalWs(
        shell.webSocketDebuggerUrl,
        "[window.innerWidth, window.innerHeight]",
      ),
    );
  }
  process.exit(0);
})().catch((e) => {
  console.error("FATAL:", e.message);
  process.exit(1);
});
