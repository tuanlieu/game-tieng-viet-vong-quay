import { it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { validateTiles } from "../src/lib/game";
it("24 câu mẫu đủ chữ, đúng dấu và không thiếu chữ lặp", () => {
  const rows = JSON.parse(
    readFileSync(
      new URL("../public/cau-hoi-mau.json", import.meta.url),
      "utf8",
    ),
  );
  expect(rows.length).toBeGreaterThanOrEqual(20);
  for (const row of rows)
    expect(
      validateTiles(
        row.tiles.split("/").map((t: string) => t.trim()),
        row.answer,
        row.mode,
      ).valid,
      row.answer,
    ).toBe(true);
});
