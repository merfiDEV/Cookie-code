const fs = require("fs");
const path = require("path");
const root = "src/ui/shell";
const strings = new Set();
function walk(d) {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p);
    else if (/\.(tsx?|html)$/.test(f)) {
      const c = fs.readFileSync(p, "utf8");
      // Строки в кавычках с китайским
      const quoted = c.match(/["']([^"'\n]*[\u4e00-\u9fff][^"'\n]*)["']/g);
      if (quoted) for (const q of quoted) strings.add(q.slice(1, -1));
      // HTML текст между тегами
      const html = c.match(/>([^<>]*[\u4e00-\u9fff][^<>]*)</g);
      if (html) for (const h of html) strings.add(h.slice(1, -1).trim());
    }
  }
}
walk(root);
const arr = Array.from(strings)
  .filter((s) => s.length < 200)
  .sort();
arr.forEach((s) => console.log(s));
console.log("--- TOTAL:", arr.length);
