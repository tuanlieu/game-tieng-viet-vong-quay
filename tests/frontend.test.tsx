import { it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import App from "../src/App";
it("frontend render trang đầu, phản ánh đúng cấu hình backend và không lộ đáp án", () => {
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {} });
  vi.stubGlobal("navigator", { onLine: true });
  vi.stubGlobal("location", { origin: "http://localhost:5173", hash: "" });
  const html = renderToStaticMarkup(<App />);
  expect(html).toContain("GAME TIẾNG VIỆT");
  expect(html).toContain("Tham gia phòng chơi");
  expect(html).toContain("Nhập mã phòng hoặc dán link phòng");
  expect(html).toContain("Dành cho người tổ chức");
  expect(html).not.toContain("Bộ câu hỏi của bạn");
  expect(html).not.toContain("Bim@");
  expect(html).not.toContain("vượt bậc");
  vi.unstubAllGlobals();
});
