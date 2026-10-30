/**
 * Копирует monaco-editor/min/vs → src/ui/vendor/monaco/vs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const src = path.join(root, "node_modules", "monaco-editor", "min", "vs");
const dest = path.join(root, "src", "ui", "vendor", "monaco", "vs");

if (!fs.existsSync(src)) {
  console.warn("[copy-monaco] monaco not found, skip");
  process.exit(0);
}
try {
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.cpSync(src, dest, { recursive: true });
  console.log("[copy-monaco] copied to", dest);
} catch (err) {
  console.error("[copy-monaco] failed:", err.message);
  process.exit(1);
}
