import { createClient } from "@supabase/supabase-js";
import { mkdtemp, readFile, writeFile, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { gzipSync } from "node:zlib";
import { pgEnvironment } from "./backup-format.mjs";
const env = process.env;
if (
  !env.DATABASE_URL ||
  !env.SUPABASE_URL ||
  !env.SUPABASE_SERVICE_ROLE_KEY ||
  !env.BACKUP_AGE_RECIPIENT
)
  throw new Error("Thiếu cấu hình backup riêng tư.");
const temp = await mkdtemp(join(tmpdir(), "game-backup-"));
const files = [];
let total = 0;
function command(bin, args, input) {
  return new Promise((resolve, reject) => {
    const process = spawn(bin, args, {
      env: env,
      stdio: ["pipe", "ignore", "pipe"],
    });
    process.stderr.resume();
    process.on("error", () => reject(new Error("Không chạy được " + bin)));
    process.on("close", (code) =>
      code === 0
        ? resolve()
        : reject(
            new Error(
              bin +
                " thất bại; không in kết nối hoặc stderr để tránh lộ secret.",
            ),
          ),
    );
    process.stdin.end(input);
  });
}
function add(name, bytes, kind, metadata = {}) {
  total += bytes.length;
  if (total > 50 * 1024 * 1024)
    throw new Error(
      "Backup helper giới hạn 50 MiB; dùng quy trình streaming cho dữ liệu lớn hơn.",
    );
  files.push({
    name,
    kind,
    ...metadata,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    data: bytes.toString("base64"),
  });
}
try {
  const includeAuth = env.BACKUP_INCLUDE_AUTH === "true";
  const dump = join(temp, "database.dump");
  // PGDATABASE accepts a libpq URI through environment; never expose URI on command line.
  Object.assign(env, pgEnvironment(env.DATABASE_URL));
  await command("pg_dump", [
    "--format=custom",
    "--no-owner",
    "--schema=public",
    "--schema=private",
    ...(includeAuth ? ["--schema=auth"] : []),
    "--file=" + dump,
  ]);
  add("database.dump", await readFile(dump), "database");
  const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const { data: buckets, error } = await db.storage.listBuckets();
  if (error) throw new Error("Không lấy được Storage buckets.");
  async function visit(bucket, prefix = "") {
    let offset = 0;
    while (true) {
      const { data, error } = await db.storage
        .from(bucket.id)
        .list(prefix, { limit: 100, offset });
      if (error) throw new Error("Không liệt kê được Storage.");
      for (const item of data) {
        const key = prefix ? prefix + "/" + item.name : item.name;
        if (!item.id) await visit(bucket, key);
        else {
          const { data: blob, error } = await db.storage
            .from(bucket.id)
            .download(key);
          if (error) throw new Error("Không tải được Storage object.");
          add(randomUUID(), Buffer.from(await blob.arrayBuffer()), "storage", {
            bucket: bucket.id,
            key,
            contentType: blob.type || "application/octet-stream",
          });
        }
      }
      if (data.length < 100) break;
      offset += 100;
    }
  }
  for (const b of buckets) await visit(b);
  add("buckets.json", Buffer.from(JSON.stringify(buckets)), "buckets");
  const payload = {
    version: 1,
    created_at: new Date().toISOString(),
    source_project: new URL(env.SUPABASE_URL).hostname,
    include_auth: includeAuth,
    limitations: [
      "OAuth provider secrets and Supabase project configuration must be reconfigured separately.",
      "Auth schema restore requires a separately reviewed staging procedure.",
    ],
    files,
  };
  const outputDir = resolve("backups");
  await mkdir(outputDir, { recursive: true, mode: 0o700 });
  const output = join(
    outputDir,
    new Date().toISOString().replaceAll(":", "-") + ".json.gz.age",
  );
  await command(
    "age",
    ["--recipient", env.BACKUP_AGE_RECIPIENT, "--output", output],
    gzipSync(Buffer.from(JSON.stringify(payload))),
  );
  await writeFile(
    join(outputDir, "LAST_BACKUP_STATUS.json"),
    JSON.stringify(
      {
        created_at: payload.created_at,
        file: output,
        bytes: total,
        restore_verified: false,
      },
      null,
      2,
    ),
    { mode: 0o600 },
  );
  console.log(
    "Đã tạo backup mã hóa. Chưa xác minh restore. Lưu bản mã hóa vào kho backup riêng và khóa age ngoài GitHub.",
  );
} finally {
  await rm(temp, { recursive: true, force: true });
}
