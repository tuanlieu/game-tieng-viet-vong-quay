import { useEffect, useState } from "react";
import { Check, CalendarDays, Palette, Download, Plus } from "lucide-react";
import { Button, Card, Field, PageTitle, errorText } from "../components/UI";
import {
  themes,
  type Theme,
  type ThemeTokens,
  type Schedule,
} from "../lib/game";
import { client, download } from "../lib/api";
export default function Themes({
  current,
  onSelect,
  notify,
}: {
  current: Theme;
  onSelect: (t: Theme) => void;
  notify: (s: string) => void;
}) {
  const [preview, setPreview] = useState(current),
    [customName, setCustomName] = useState(""),
    [colors, setColors] = useState<ThemeTokens>({ ...current.tokens }),
    [saved, setSaved] = useState<Theme[]>([]),
    [schedules, setSchedules] = useState<Schedule[]>([]),
    [themeId, setThemeId] = useState(""),
    [starts, setStarts] = useState("2026-10-11T00:00"),
    [ends, setEnds] = useState("2026-10-21T00:00"),
    [priority, setPriority] = useState(10),
    [busy, setBusy] = useState(false);
  async function load() {
    try {
      const results = await Promise.all([
        client().from("themes").select("*"),
        client().from("event_schedules").select("*").order("starts_at"),
      ]);
      for (const r of results) if (r.error) throw r.error;
      setSaved(
        (results[0].data || []).map((t) => ({
          ...t,
          source: t.source_url,
        })) as Theme[],
      );
      setSchedules(results[1].data as Schedule[]);
    } catch (e) {
      notify(errorText(e));
    }
  }
  useEffect(() => {
    void load();
  }, []);
  async function save(theme: Theme) {
    setBusy(true);
    try {
      const { data, error } = await client()
        .from("themes")
        .insert({
          name: theme.name,
          tokens: theme.tokens,
          description: theme.description,
          source_url: theme.source || null,
          year: theme.year || null,
        })
        .select()
        .single();
      if (error) throw error;
      await load();
      setThemeId(data.id);
      notify("Đã lưu theme vào tài khoản.");
    } catch (e) {
      notify(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  async function schedule() {
    try {
      const begin = new Date(starts + ":00+07:00");
      const end = new Date(ends + ":00+07:00");
      if (!Number.isFinite(begin.getTime()) || end <= begin)
        throw new Error("Thời gian kết thúc phải sau bắt đầu.");
      const { error } = await client()
        .from("event_schedules")
        .insert({
          theme_id: themeId,
          starts_at: begin.toISOString(),
          ends_at: end.toISOString(),
          priority,
        });
      if (error) throw error;
      await load();
      notify(
        "Đã lưu lịch. Server chọn theme; áp dụng lúc chuyển tiếp an toàn.",
      );
    } catch (e) {
      notify(errorText(e));
    }
  }
  async function toggle(s: Schedule) {
    try {
      const { error } = await client()
        .from("event_schedules")
        .update({ enabled: !s.enabled })
        .eq("id", s.id);
      if (error) throw error;
      await load();
    } catch (e) {
      notify(errorText(e));
    }
  }
  return (
    <>
      <PageTitle
        title="Giao diện & Sự kiện"
        description="Chọn sắc màu cho mỗi cuộc vui. Xem trước, rồi mới áp dụng."
      />
      <div className="theme-grid">
        {[...themes, ...saved].map((t) => (
          <button
            key={t.id}
            className={"theme-card " + (preview.id === t.id ? "selected" : "")}
            onClick={() => setPreview(t)}
          >
            <div
              className="theme-art"
              style={{ background: t.tokens.background }}
            >
              <div style={{ background: t.tokens.primary }} />
              <span style={{ background: t.tokens.accent }} />
              <b style={{ color: t.tokens.ink }}>Aa</b>
            </div>
            <strong>{t.name}</strong>
            <small>{t.year ? "XU HƯỚNG THEO NĂM" : "BẢNG PHỐI THIẾT KẾ"}</small>
            {current.id === t.id && <Check size={16} />}
          </button>
        ))}
      </div>
      <Card>
        <div className="two-columns">
          <div>
            <span className="eyebrow">XEM TRƯỚC</span>
            <h2>{preview.name}</h2>
            <p>{preview.description}</p>
            {preview.source && (
              <a href={preview.source} target="_blank" rel="noreferrer">
                Nguồn tham khảo chính thức ↗
              </a>
            )}
            <p>
              Ngày tra cứu: 14/10/2026. Các mã HEX trong bảng là lựa chọn phối
              của thiết kế.
            </p>
            <div className="actions">
              <Button onClick={() => onSelect(preview)}>
                Áp dụng làm giao diện nền
              </Button>
              <Button
                kind="outline"
                disabled={busy}
                onClick={() => void save(preview)}
              >
                Lưu vào tài khoản
              </Button>
              <Button
                kind="subtle"
                onClick={() =>
                  download("giao-dien.json", JSON.stringify(preview, null, 2))
                }
              >
                <Download size={16} />
                Xuất theme
              </Button>
            </div>
          </div>
          <div
            className="theme-preview"
            style={{
              background: preview.tokens.background,
              color: preview.tokens.ink,
            }}
          >
            <span style={{ color: preview.tokens.primary }}>
              GAME TIẾNG VIỆT
            </span>
            <h3>Chữ đẹp. Cuộc vui hay.</h3>
            <div className="tiles">
              {"MAYMẮN".split("").map((c, i) => (
                <span
                  className="tile"
                  key={i}
                  style={{ color: preview.tokens.primary }}
                >
                  {c}
                </span>
              ))}
            </div>
            <span
              className="badge"
              style={{
                background: preview.tokens.accent,
                color: preview.tokens.ink,
              }}
            >
              100 điểm thưởng
            </span>
          </div>
        </div>
      </Card>
      <div className="two-columns">
        <Card>
          <h2>
            <Palette size={20} /> Bộ màu của riêng bạn
          </h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setPreview({
                id: "custom",
                name: customName,
                tokens: colors,
                description: "Bảng phối tự tạo",
              });
            }}
          >
            <Field label="Tên bảng màu">
              <input
                required
                maxLength={100}
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
              />
            </Field>
            <div className="two-columns">
              {(Object.keys(colors) as (keyof ThemeTokens)[]).map((k) => (
                <Field
                  key={k}
                  label={
                    {
                      primary: "Chủ đạo",
                      accent: "Điểm nhấn",
                      background: "Nền",
                      ink: "Chữ",
                    }[k]
                  }
                >
                  <input
                    type="color"
                    value={colors[k]}
                    onChange={(e) =>
                      setColors((c) => ({ ...c, [k]: e.target.value }))
                    }
                  />
                </Field>
              ))}
            </div>
            <Button type="submit" kind="outline">
              Xem trước bộ màu
            </Button>
          </form>
          <small>
            Cảnh báo tương phản tự động và nhập theme từ file chưa sẵn sàng.
          </small>
        </Card>
        <Card>
          <h2>
            <CalendarDays size={20} /> Lịch sự kiện
          </h2>
          <p>
            Múi giờ Việt Nam · Asia/Ho_Chi_Minh. Khoảng thời gian có đầu, không
            bao gồm mốc kết thúc.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void schedule();
            }}
          >
            <Field label="Theme đã lưu">
              <select
                required
                value={themeId}
                onChange={(e) => setThemeId(e.target.value)}
              >
                <option value="">Lưu một theme trước</option>
                {saved.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </Field>
            <div className="two-columns">
              <Field label="Bắt đầu (giờ Việt Nam)">
                <input
                  type="datetime-local"
                  required
                  value={starts}
                  onChange={(e) => setStarts(e.target.value)}
                />
              </Field>
              <Field label="Kết thúc (giờ Việt Nam)">
                <input
                  type="datetime-local"
                  required
                  value={ends}
                  onChange={(e) => setEnds(e.target.value)}
                />
              </Field>
            </div>
            <Field label="Độ ưu tiên (số lớn được ưu tiên)">
              <input
                type="number"
                value={priority}
                onChange={(e) => setPriority(Number(e.target.value))}
              />
            </Field>
            <Button type="submit">
              <Plus size={16} />
              Lưu lịch sự kiện
            </Button>
          </form>
          <small>
            Ví dụ 20/10: 00:00 ngày 11/10 đến trước 00:00 ngày 21/10 = 10 ngày
            theo lịch. Tết/Trung thu cần ngày dương đã xác nhận cho từng năm.
          </small>
        </Card>
      </div>
      <Card>
        <h2>Lịch đã lên</h2>
        {schedules.length ? (
          schedules.map((s) => (
            <div className="history-row" key={s.id}>
              <strong>{saved.find((t) => t.id === s.theme_id)?.name}</strong>
              <span>
                {new Date(s.starts_at).toLocaleString("vi-VN", {
                  timeZone: "Asia/Ho_Chi_Minh",
                })}{" "}
                →{" "}
                {new Date(s.ends_at).toLocaleString("vi-VN", {
                  timeZone: "Asia/Ho_Chi_Minh",
                })}
              </span>
              <Button kind="outline" onClick={() => void toggle(s)}>
                {s.enabled ? "Tạm dừng" : "Bật lịch"}
              </Button>
            </div>
          ))
        ) : (
          <p>
            Chưa có lịch. Theme nền được giữ cho đến khi một lịch có hiệu lực.
          </p>
        )}
        <small>
          Lịch này áp dụng cho tài khoản của bạn. Giao diện toàn hệ thống và
          trình biên soạn họa tiết chưa sẵn sàng.
        </small>
      </Card>
    </>
  );
}
