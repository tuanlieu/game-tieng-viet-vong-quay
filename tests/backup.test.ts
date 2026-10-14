import { it, expect } from "vitest";
import {
  checksum,
  verifyPayload,
  pgEnvironment,
} from "../scripts/backup-format.mjs";
it("checksum phát hiện thay đổi payload", () => {
  const bytes = Buffer.from("database test");
  const payload = {
    version: 1,
    files: [
      {
        name: "database.dump",
        kind: "database",
        data: bytes.toString("base64"),
        sha256: checksum(bytes),
      },
    ],
  };
  expect(verifyPayload(payload)).toBe(payload);
  expect(() =>
    verifyPayload({
      ...payload,
      files: [
        {
          ...payload.files[0],
          data: Buffer.from("modified").toString("base64"),
        },
      ],
    }),
  ).toThrow("Checksum");
});
it("không chấp nhận manifest trùng hoặc version lạ", () => {
  const f = {
    name: "a",
    kind: "database",
    data: "",
    sha256: checksum(Buffer.alloc(0)),
  };
  expect(() => verifyPayload({ version: 1, files: [f, f] })).toThrow("trùng");
  expect(() => verifyPayload({ version: 2, files: [] })).toThrow();
});
it("tách thông tin PG vào môi trường, không vào command arguments", () => {
  const env = pgEnvironment(
    "postgresql://user:pass%40word@db.example.test:6543/postgres?sslmode=require",
  );
  expect(env).toMatchObject({
    PGHOST: "db.example.test",
    PGPORT: "6543",
    PGPASSWORD: "pass@word",
    PGDATABASE: "postgres",
    PGSSLMODE: "require",
  });
});
