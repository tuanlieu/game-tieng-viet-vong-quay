import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { gunzipSync } from "node:zlib";
import { verifyPayload, pgEnvironment } from "./backup-format.mjs";
import { createClient } from "@supabase/supabase-js";
const env = process.env;
if (
  env.RESTORE_TARGET !== "staging" ||
  env.RESTORE_CONFIRM !== "RESTORE_INTO_EMPTY_STAGING"
)
  throw new Error("Chỉ restore vào staging trống với xác nhận rõ ràng.");
if (
  !env.BACKUP_FILE ||
  !env.BACKUP_AGE_IDENTITY_FILE ||
  !env.DATABASE_URL ||
  !env.SUPABASE_URL ||
  !env.SUPABASE_SERVICE_ROLE_KEY ||
  !env.EXPECTED_STAGING_HOST
)
  throw new Error("Thiếu cấu hình restore.");
if (new URL(env.DATABASE_URL).hostname !== env.EXPECTED_STAGING_HOST)
  throw new Error("Host staging không khớp.");
if (new URL(env.SUPABASE_URL).hostname !== env.EXPECTED_STAGING_SUPABASE_HOST)
  throw new Error("Host Storage staging không khớp.");
function run(bin, args, input, capture = false) {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args, {
      env: env,
      stdio: ["pipe", capture ? "pipe" : "ignore", "pipe"],
    });
    const chunks = [];
    let size = 0;
    p.stderr.resume();
    if (capture)
      p.stdout.on("data", (c) => {
        size += c.length;
        if (size > 100 * 1024 * 1024) {
          p.kill();
          reject(new Error("Dữ liệu vượt 100 MiB."));
        } else chunks.push(c);
      });
    p.on("error", () => reject(new Error("Không chạy được " + bin)));
    p.on("close", (code) =>
      code === 0
        ? resolve(Buffer.concat(chunks))
        : reject(new Error(bin + " thất bại; kiểm tra staging riêng tư.")),
    );
    p.stdin.end(input);
  });
}
const encrypted = await readFile(env.BACKUP_FILE);
const clear = await run(
  "age",
  ["--decrypt", "--identity", env.BACKUP_AGE_IDENTITY_FILE],
  encrypted,
  true,
);
const payload = JSON.parse(
  gunzipSync(clear, { maxOutputLength: 100 * 1024 * 1024 }).toString("utf8"),
);
verifyPayload(payload);
if (payload.source_project === new URL(env.SUPABASE_URL).hostname)
  throw new Error("Không restore trực tiếp vào project nguồn.");
if (payload.include_auth)
  throw new Error(
    "Backup gồm Auth: cần quy trình kiểm duyệt riêng. Helper này không tự restore Auth.",
  );
const dump = payload.files.find((f) => f.kind === "database");
if (!dump) throw new Error("Thiếu database dump.");
Object.assign(env, pgEnvironment(env.DATABASE_URL));
// No --clean: staging must be empty and have Supabase infrastructure/Auth identifiers prepared.
await run(
  "pg_restore",
  [
    "--dbname=" + env.PGDATABASE,
    "--no-owner",
    "--exit-on-error",
    "--single-transaction",
  ],
  Buffer.from(dump.data, "base64"),
);
const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const bucketFile = payload.files.find((f) => f.kind === "buckets");
const buckets = bucketFile
  ? JSON.parse(Buffer.from(bucketFile.data, "base64").toString())
  : [];
for (const b of buckets) {
  const { error } = await db.storage.createBucket(b.id, {
    public: b.public,
    fileSizeLimit: b.file_size_limit,
    allowedMimeTypes: b.allowed_mime_types,
  });
  if (error)
    throw new Error("Không tạo được bucket staging; không ghi đè bucket cũ.");
}
for (const f of payload.files.filter((f) => f.kind === "storage")) {
  const { error } = await db.storage
    .from(f.bucket)
    .upload(f.key, Buffer.from(f.data, "base64"), {
      contentType: f.contentType,
      upsert: false,
    });
  if (error) throw new Error("Storage restore thất bại.");
}
console.log(
  "Đã chạy restore database ứng dụng và Storage staging. Cần smoke test và so sánh số lượng/giá trị trước khi chứng nhận backup.",
);
