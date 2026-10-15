import { it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import App from "../src/App";
it("frontend render trang đầu, phản ánh đúng cấu hình backend và không lộ đáp án", () => {
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {} });
  vi.stubGlobal("navigator", { onLine: true });
  vi.stubGlobal("location", { origin: "http://localhost:5173", hash: "" });
  const html = renderToStaticMarkup(<App />);
  expect(html).toContain("Game Tiếng Việt - Vòng Quay May Mắn");
  const configured =
    Boolean(import.meta.env.VITE_SUPABASE_URL) &&
    Boolean(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY) &&
    !import.meta.env.VITE_SUPABASE_URL.includes("YOUR_") &&
    !import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY.includes("YOUR_");
  expect(html).toContain(configured ? "Đã cấu hình backend" : "Chờ kết nối Supabase");
  expect(html).toContain("Đăng nhập");
  expect(html).not.toContain("Bim@");
  expect(html).not.toContain("vượt bậc");
  vi.unstubAllGlobals();
});
