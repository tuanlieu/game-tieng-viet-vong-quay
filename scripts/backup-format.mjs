import { createHash } from "node:crypto";
export const checksum = (bytes) =>
  createHash("sha256").update(bytes).digest("hex");
export function verifyPayload(payload) {
  if (
    payload.version !== 1 ||
    !Array.isArray(payload.files) ||
    payload.files.length > 10000
  )
    throw new Error("Manifest không hỗ trợ.");
  const names = new Set();
  let total = 0;
  for (const f of payload.files) {
    if (
      typeof f.name !== "string" ||
      names.has(f.name) ||
      typeof f.data !== "string"
    )
      throw new Error("Manifest trùng hoặc sai kiểu.");
    names.add(f.name);
    const bytes = Buffer.from(f.data, "base64");
    total += bytes.length;
    if (total > 50 * 1024 * 1024) throw new Error("Payload vượt 50 MiB.");
    if (checksum(bytes) !== f.sha256) throw new Error("Checksum không khớp.");
    if (!["database", "storage", "buckets"].includes(f.kind))
      throw new Error("Loại backup không hợp lệ.");
  }
  return payload;
}
export function pgEnvironment(databaseUrl) {
  const u = new URL(databaseUrl);
  if (!["postgres:", "postgresql:"].includes(u.protocol))
    throw new Error("DATABASE_URL không hợp lệ.");
  return {
    PGHOST: u.hostname,
    PGPORT: u.port || "5432",
    PGUSER: decodeURIComponent(u.username),
    PGPASSWORD: decodeURIComponent(u.password),
    PGDATABASE: decodeURIComponent(u.pathname.slice(1)),
    PGSSLMODE: u.searchParams.get("sslmode") || "require",
  };
}
