import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
const ignore = new Set([
  "node_modules",
  "dist",
  ".git",
  "backups",
  ".env",
  "package-lock.json",
]);
const rules = [
  /sb_secret_[A-Za-z0-9_-]{10,}/,
  /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /gh[pousr]_[A-Za-z0-9]{20,}/,
  /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,
];
const violations = [];
async function walk(dir) {
  for (const item of await readdir(dir, { withFileTypes: true })) {
    if (ignore.has(item.name) || item.name.startsWith(".env.")) continue;
    const path = join(dir, item.name);
    if (item.isDirectory()) await walk(path);
    else {
      const text = await readFile(path, "utf8");
      if (rules.some((r) => r.test(text))) violations.push(path);
    }
  }
}
await walk(".");
if (violations.length) {
  console.error("Mẫu secret nghi ngờ trong:", violations.join(", "));
  process.exitCode = 1;
} else
  console.log(
    "Không phát hiện mẫu secret đã biết. Đây không thay thế review thủ công hoặc gitleaks.",
  );
