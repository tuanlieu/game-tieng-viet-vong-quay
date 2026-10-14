export type QuestionMode = "letters" | "words";
export function normalizeAnswer(value: string, ignoreAccents = false) {
  const text = value
    .normalize("NFC")
    .toLocaleLowerCase("vi")
    .trim()
    .replace(/\s+/gu, " ")
    .replace(/[.,!?;:]/gu, "");
  return ignoreAccents
    ? text.normalize("NFD").replace(/\p{M}/gu, "").replace(/đ/gu, "d")
    : text;
}
export function tokens(
  value: string,
  mode: QuestionMode = "letters",
  ignoreAccents = false,
): string[] {
  const text = normalizeAnswer(value, ignoreAccents);
  return mode === "words"
    ? text.split(" ").filter(Boolean)
    : Array.from(
        new Intl.Segmenter("vi", { granularity: "grapheme" }).segment(
          text.replace(/\s/gu, ""),
        ),
        (s) => s.segment,
      );
}
export function validateTiles(
  tiles: string[],
  answer: string,
  mode: QuestionMode = "letters",
  ignoreAccents = false,
) {
  const count = (items: string[]) =>
    items.reduce<Record<string, number>>((r, t) => {
      r[t] = (r[t] || 0) + 1;
      return r;
    }, {});
  const expected = count(tokens(answer, mode, ignoreAccents));
  const actual = count(tiles.map((t) => normalizeAnswer(t, ignoreAccents)));
  const missing: string[] = [],
    extra: string[] = [];
  new Set([...Object.keys(expected), ...Object.keys(actual)]).forEach((k) => {
    const d = (expected[k] || 0) - (actual[k] || 0);
    for (let i = 0; i < Math.abs(d); i++) (d > 0 ? missing : extra).push(k);
  });
  return { valid: !missing.length && !extra.length, missing, extra };
}
export function score(
  correct: boolean,
  base: number,
  remaining: number,
  duration: number,
  hints = 0,
  penalty = 10,
) {
  if (!correct || remaining < 0 || duration <= 0) return 0;
  return Math.max(
    0,
    base + Math.floor(50 * Math.min(remaining / duration, 1)) - hints * penalty,
  );
}
export function effectiveProbabilities(
  prizes: {
    id: string;
    weight: number;
    stock: number | null;
    enabled: boolean;
  }[],
  mode: "weights" | "percent" = "weights",
) {
  if (prizes.some((p) => !Number.isFinite(p.weight) || p.weight < 0))
    throw new Error("Trọng số không hợp lệ.");
  const all = prizes.reduce((s, p) => s + p.weight, 0);
  if (mode === "percent" && Math.abs(all - 100) > 0.000001)
    throw new Error("Tổng xác suất phải bằng 100%.");
  const eligible = prizes.filter(
    (p) => p.enabled && (p.stock === null || p.stock > 0) && p.weight > 0,
  );
  const total = eligible.reduce((s, p) => s + p.weight, 0);
  if (total <= 0) throw new Error("Không còn phần thưởng hợp lệ.");
  return eligible.map((p) => ({ ...p, probability: p.weight / total }));
}
export function chooseWeighted<T extends { probability: number }>(
  items: T[],
  sample: number,
): T {
  if (
    !Number.isFinite(sample) ||
    sample < 0 ||
    sample >= 1 ||
    items.length === 0
  )
    throw new Error("Mẫu ngẫu nhiên không hợp lệ.");
  let cumulative = 0;
  for (const item of items) {
    cumulative += item.probability;
    if (sample < cumulative) return item;
  }
  return items[items.length - 1];
}
export function secondsLeft(deadline: string | null, offset = 0) {
  return deadline
    ? Math.max(
        0,
        Math.ceil((Date.parse(deadline) - (Date.now() + offset)) / 1000),
      )
    : 0;
}
export function wheelRotation(index: number, count: number, previous = 0) {
  const target = (((360 - ((index + 0.5) * 360) / count) % 360) + 360) % 360;
  return previous + ((360 - (previous % 360)) % 360) + 360 * 5 + target;
}
export type ThemeTokens = {
  primary: string;
  accent: string;
  background: string;
  ink: string;
};
export type Theme = {
  id: string;
  name: string;
  tokens: ThemeTokens;
  description: string;
  source?: string;
  year?: number;
};
export const themes: Theme[] = [
  {
    id: "default",
    name: "Sắc Việt",
    description: "Bảng phối nhận diện mặc định",
    tokens: {
      primary: "#04605E",
      accent: "#F8A41E",
      background: "#F6F8F7",
      ink: "#151B45",
    },
  },
  {
    id: "teal2026",
    name: "Transformative Teal · 2026",
    year: 2026,
    description:
      "Lấy cảm hứng từ WGSN/Coloro. HEX do thiết kế chọn, không phải mã chính thức.",
    source: "https://www.wgsn.com/en/blog/key-colours-w-26-27",
    tokens: {
      primary: "#005F61",
      accent: "#D7ECAB",
      background: "#EDF4F1",
      ink: "#153A3A",
    },
  },
  {
    id: "cloud2026",
    name: "Cloud Dancer · 2026",
    year: 2026,
    description:
      "Lấy cảm hứng từ PANTONE 11-4201. HEX do thiết kế chọn, không phải mã chính thức.",
    source: "https://www.pantone.com/color-of-the-year/2026",
    tokens: {
      primary: "#04605E",
      accent: "#F8A41E",
      background: "#F4F1EA",
      ink: "#151B45",
    },
  },
  ...[
    ["newyear", "Tết Dương lịch", "#151B45", "#F8A41E"],
    ["tet", "Tết Nguyên đán", "#AD242E", "#FFD36B"],
    ["march8", "Quốc tế Phụ nữ 8/3", "#89435B", "#F3BCA7"],
    ["march26", "Thành lập Đoàn 26/3", "#006C4F", "#B5E6BB"],
    ["april30", "30/4 – 1/5", "#AC252B", "#F9C64E"],
    ["june1", "Quốc tế Thiếu nhi", "#186EA0", "#FFCB54"],
    ["sep2", "Quốc khánh 2/9", "#AC252B", "#F9C64E"],
    ["midautumn", "Tết Trung thu", "#292B69", "#F9C64E"],
    ["oct20", "Rạng rỡ tháng Mười", "#04605E", "#EABEA7"],
    ["nov20", "Tri ân Nhà giáo", "#725438", "#E9CF93"],
    ["christmas", "Giáng sinh", "#175844", "#C83F43"],
    ["halloween", "Halloween", "#4C3070", "#FFB451"],
  ].map(([id, name, primary, accent]) => ({
    id,
    name,
    description:
      "Bảng phối sự kiện do thiết kế đề xuất. Tết và Trung thu cần lịch xác nhận theo năm.",
    tokens: { primary, accent, background: "#F8F5F0", ink: "#151B45" },
  })),
];
export type Schedule = {
  id: string;
  theme_id: string;
  starts_at: string;
  ends_at: string;
  priority: number;
  enabled: boolean;
};
export function activeSchedule(list: Schedule[], serverNow: string) {
  const now = Date.parse(serverNow);
  return list
    .filter(
      (s) =>
        s.enabled &&
        Date.parse(s.starts_at) <= now &&
        now < Date.parse(s.ends_at),
    )
    .sort(
      (a, b) =>
        b.priority - a.priority ||
        Date.parse(b.starts_at) - Date.parse(a.starts_at) ||
        a.id.localeCompare(b.id),
    )[0];
}
