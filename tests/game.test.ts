import { describe, it, expect } from "vitest";
import {
  tokens,
  normalizeAnswer,
  validateTiles,
  score,
  effectiveProbabilities,
  chooseWeighted,
  wheelRotation,
  activeSchedule,
} from "../src/lib/game";
describe("Unicode và ô chữ", () => {
  it("NFC không tách dấu tiếng Việt", () =>
    expect(tokens("tiếng Việt")).toEqual(tokens("tiếng Việt")));
  it("chữ lặp có đủ số lượng", () => {
    expect(validateTiles(["a", "a", "b"], "aba").valid).toBe(true);
    expect(validateTiles(["a", "b"], "aba").missing).toEqual(["a"]);
  });
  it("giữ dấu và cho phép bỏ dấu có chủ ý", () => {
    expect(normalizeAnswer(" ĐƯỜNG   PHỐ! ")).toBe("đường phố");
    expect(tokens("ĐƯỜNG", "letters", true)).toEqual(["d", "u", "o", "n", "g"]);
  });
  it("ghép từ giữ nguyên từ", () =>
    expect(tokens("ngày  phụ nữ", "words")).toEqual(["ngày", "phụ", "nữ"]));
  it("báo cả thiếu và thừa", () =>
    expect(validateTiles(["a", "c"], "ab")).toEqual({
      valid: false,
      missing: ["b"],
      extra: ["c"],
    }));
});
describe("tính điểm", () => {
  it("sai hoặc hết giờ được 0", () => {
    expect(score(false, 100, 30, 60)).toBe(0);
    expect(score(true, 100, -1, 60)).toBe(0);
  });
  it("thưởng tốc độ và phạt gợi ý không âm", () => {
    expect(score(true, 100, 30, 60, 1)).toBe(115);
    expect(score(true, 0, 0, 60, 1)).toBe(0);
    expect(score(true, 100, 120, 60)).toBe(150);
  });
});
describe("xác suất", () => {
  const prizes = [
    { id: "a", weight: 1, stock: 1, enabled: true },
    { id: "b", weight: 3, stock: null, enabled: true },
  ];
  it("trọng số 1:3", () =>
    expect(effectiveProbabilities(prizes).map((p) => p.probability)).toEqual([
      0.25, 0.75,
    ]));
  it("không trao quà hết", () =>
    expect(
      effectiveProbabilities([{ ...prizes[0], stock: 0 }, prizes[1]])[0]
        .probability,
    ).toBe(1));
  it("chặn tổng phần trăm sai, NaN, âm và tổng 0", () => {
    expect(() => effectiveProbabilities(prizes, "percent")).toThrow();
    expect(() =>
      effectiveProbabilities([{ ...prizes[0], weight: NaN }]),
    ).toThrow();
    expect(() =>
      effectiveProbabilities([{ ...prizes[0], weight: -1 }]),
    ).toThrow();
    expect(() =>
      effectiveProbabilities([{ ...prizes[0], weight: 0 }]),
    ).toThrow();
  });
  it("biên ngẫu nhiên", () => {
    const p = effectiveProbabilities(prizes);
    expect(chooseWeighted(p, 0).id).toBe("a");
    expect(chooseWeighted(p, 0.25).id).toBe("b");
    expect(chooseWeighted(p, 0.999999).id).toBe("b");
    expect(() => chooseWeighted(p, 1)).toThrow();
  });
  it("mô phỏng 100.000 mẫu phân tầng đúng phân bố", () => {
    const p = effectiveProbabilities(prizes);
    let a = 0;
    for (let i = 0; i < 100000; i++)
      if (chooseWeighted(p, (i + 0.5) / 100000).id === "a") a++;
    expect(a).toBe(25000);
  });
  it("kim dừng tại tâm ô trúng sau nhiều lượt", () => {
    for (let n = 2; n <= 100; n++)
      for (let i = 0; i < n; i++) {
        const angle = wheelRotation(i, n, 7350);
        const remainder = (((i + 0.5) * 360) / n + angle) % 360;
        expect(
          Math.min(Math.abs(remainder), Math.abs(360 - remainder)),
        ).toBeLessThan(1e-8);
        expect(angle).toBeGreaterThan(7350 + 1440);
      }
  });
});
describe("lịch sự kiện", () => {
  const schedule = {
    id: "1",
    theme_id: "oct20",
    starts_at: "2026-10-10T17:00:00Z",
    ends_at: "2026-10-20T17:00:00Z",
    priority: 10,
    enabled: true,
  };
  it("10 ngày Việt Nam và mốc kết thúc loại trừ", () => {
    expect(activeSchedule([schedule], schedule.starts_at)?.id).toBe("1");
    expect(activeSchedule([schedule], schedule.ends_at)).toBeUndefined();
    expect(Date.parse(schedule.ends_at) - Date.parse(schedule.starts_at)).toBe(
      240 * 3600000,
    );
  });
  it("ưu tiên và tạm dừng", () => {
    expect(
      activeSchedule(
        [schedule, { ...schedule, id: "2", priority: 20 }],
        schedule.starts_at,
      )?.id,
    ).toBe("2");
    expect(
      activeSchedule([{ ...schedule, enabled: false }], schedule.starts_at),
    ).toBeUndefined();
  });
});
