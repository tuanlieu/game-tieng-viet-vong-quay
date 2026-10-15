import { useEffect, useState } from "react";
import Papa from "papaparse";
import { Plus, Download, Upload, Trash2, Pencil, Copy } from "lucide-react";
import {
  Button,
  Card,
  Field,
  PageTitle,
  Empty,
  errorText,
} from "../components/UI";
import {
  client,
  rpc,
  listSets,
  download,
  type SetRecord,
  type Question,
} from "../lib/api";
import { tokens, validateTiles } from "../lib/game";
type Author = {
  question_id: string;
  answer: string;
  alternatives: string[];
  explanation: string;
};
export default function Questions({ notify }: { notify: (s: string) => void }) {
  const [sets, setSets] = useState<SetRecord[]>([]),
    [selected, setSelected] = useState(""),
    [questions, setQuestions] = useState<Question[]>([]),
    [authors, setAuthors] = useState<Author[]>([]),
    [setTitle, setSetTitle] = useState(""),
    [search, setSearch] = useState(""),
    [selectedIds, setSelectedIds] = useState<string[]>([]),
    [bulkDuration, setBulkDuration] = useState(""),
    [bulkPoints, setBulkPoints] = useState(""),
    [bulkBusy, setBulkBusy] = useState(false);
  const [editing, setEditing] = useState<string | null>(null),
    [answer, setAnswer] = useState(""),
    [tileText, setTileText] = useState(""),
    [mode, setMode] = useState<"letters" | "words">("letters"),
    [duration, setDuration] = useState(60),
    [points, setPoints] = useState(100),
    [hint, setHint] = useState(""),
    [explanation, setExplanation] = useState(""),
    [alternatives, setAlternatives] = useState(""),
    [busy, setBusy] = useState(false);
  async function loadSets() {
    try {
      const user = (await client().auth.getUser()).data.user;
      const data = (await listSets()).filter((s) => s.owner_id === user?.id);
      setSets(data);
      if (!selected && data[0]) setSelected(data[0].id);
    } catch (e) {
      notify(errorText(e));
    }
  }
  async function loadQuestions(id = selected) {
    if (!id) return;
    try {
      const { data, error } = await client()
        .from("questions")
        .select("*")
        .eq("set_id", id)
        .order("position");
      if (error) throw error;
      setQuestions(data);
      setAuthors(await rpc<Author[]>("author_answers", { p_set: id }));
    } catch (e) {
      notify(errorText(e));
    }
  }
  useEffect(() => {
    void loadSets();
  }, []); // ownership is enforced by backend
  useEffect(() => {
    void loadQuestions();
    reset();
    setSelectedIds([]);
  }, [selected]);
  function reset() {
    setEditing(null);
    setAnswer("");
    setTileText("");
    setHint("");
    setExplanation("");
    setAlternatives("");
  }
  const filteredQuestions = questions.filter((q) =>
    (authors.find((a) => a.question_id === q.id)?.answer + q.tiles.join(""))
      .toLocaleLowerCase("vi")
      .includes(search.toLocaleLowerCase("vi")),
  );
  function toggleSelected(id: string) {
    setSelectedIds((ids) => ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);
  }
  async function bulkUpdate(remove = false) {
    if (!selectedIds.length) return;
    const durationValue = bulkDuration === "" ? null : Number(bulkDuration);
    const pointsValue = bulkPoints === "" ? null : Number(bulkPoints);
    const summary = remove
      ? `Xóa ${selectedIds.length} câu hỏi? Thao tác không thể hoàn tác.`
      : `Cập nhật ${selectedIds.length} câu${durationValue !== null ? `: thời gian ${durationValue} giây` : ""}${pointsValue !== null ? `${durationValue !== null ? "," : ":"} điểm ${pointsValue}` : ""}.`;
    if (!confirm(summary)) return;
    setBulkBusy(true);
    try {
      const result = await rpc<{ changed: number }>("bulk_update_questions", {
        p_set: selected,
        p_questions: selectedIds,
        p_duration: durationValue,
        p_points: pointsValue,
        p_delete: remove,
      });
      setSelectedIds([]);
      await loadQuestions();
      notify(remove ? `Đã xóa ${result.changed} câu hỏi.` : `Đã cập nhật ${result.changed} câu hỏi.`);
    } catch (e) {
      notify(errorText(e));
    } finally {
      setBulkBusy(false);
    }
  }
  async function setVisibility(value: string) {
    try {
      const { error } = await client()
        .from("question_sets")
        .update({ visibility: value })
        .eq("id", selected);
      if (error) throw error;
      await loadSets();
      notify("Đã cập nhật trạng thái bộ câu hỏi.");
    } catch (e) {
      notify(errorText(e));
    }
  }
  async function createSet() {
    try {
      const { data, error } = await client()
        .from("question_sets")
        .insert({ title: setTitle.trim() })
        .select()
        .single();
      if (error) throw error;
      setSetTitle("");
      await loadSets();
      setSelected(data.id);
    } catch (e) {
      notify(errorText(e));
    }
  }
  async function save() {
    setBusy(true);
    try {
      const tiles = tileText
        .split("/")
        .map((s) => s.trim().normalize("NFC"))
        .filter(Boolean);
      const check = validateTiles(tiles, answer, mode);
      if (!check.valid)
        throw new Error(
          `Bộ chữ chưa khớp. Thiếu: ${check.missing.join(", ") || "không"}; thừa: ${check.extra.join(", ") || "không"}.`,
        );
      await rpc("save_question", {
        p_set: selected,
        p_question: editing,
        p_title:
          mode === "letters"
            ? "Sắp xếp các chữ cái thành từ hoặc cụm từ có nghĩa"
            : "Sắp xếp các từ thành cụm từ có nghĩa",
        p_tiles: tiles,
        p_answer: answer,
        p_mode: mode,
        p_duration: duration,
        p_points: points,
        p_hint: hint,
        p_explanation: explanation,
        p_alternatives: alternatives
          .split("|")
          .map((s) => s.trim())
          .filter(Boolean),
      });
      reset();
      await loadQuestions();
      notify("Đã lưu câu hỏi ở cơ sở dữ liệu.");
    } catch (e) {
      notify(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  function edit(q: Question) {
    const a = authors.find((a) => a.question_id === q.id);
    setEditing(q.id);
    setAnswer(a?.answer || "");
    setTileText(q.tiles.join(" / "));
    setMode(q.mode);
    setDuration(q.duration);
    setPoints(q.points);
    setHint(q.hint);
    setExplanation(a?.explanation || "");
    setAlternatives(a?.alternatives.join(" | ") || "");
  }
  async function remove(q: Question) {
    if (!confirm("Xóa câu hỏi này?")) return;
    try {
      await rpc("bulk_update_questions", {
        p_set: selected,
        p_questions: [q.id],
        p_duration: null,
        p_points: null,
        p_delete: true,
      });
      await loadQuestions();
    } catch (e) {
      notify(errorText(e));
    }
  }
  async function duplicate(q: Question) {
    const a = authors.find((a) => a.question_id === q.id);
    if (!a) return;
    try {
      await rpc("save_question", {
        p_set: selected,
        p_question: null,
        p_title: q.title,
        p_tiles: q.tiles,
        p_answer: a.answer,
        p_mode: q.mode,
        p_duration: q.duration,
        p_points: q.points,
        p_hint: q.hint,
        p_explanation: a.explanation,
        p_alternatives: a.alternatives,
      });
      await loadQuestions();
    } catch (e) {
      notify(errorText(e));
    }
  }
  function exportFile(csv = false) {
    const rows = questions.map((q) => ({
      ...q,
      answer: authors.find((a) => a.question_id === q.id)?.answer || "",
      tiles: q.tiles.join(" / "),
    }));
    download(
      csv ? "cau-hoi.csv" : "cau-hoi.json",
      csv ? "\uFEFF" + Papa.unparse(rows) : JSON.stringify(rows, null, 2),
      csv ? "text/csv;charset=utf-8" : "application/json",
    );
  }
  async function importFile(file: File) {
    if (!selected) {
      notify("Chọn bộ câu hỏi trước khi nhập.");
      return;
    }
    setBusy(true);
    try {
      if (file.size > 2 * 1024 * 1024) throw new Error("File tối đa 2 MB.");
      const text = await file.text();
      let rows: Record<string, unknown>[];
      if (file.name.endsWith(".json")) {
        const data = JSON.parse(text);
        if (!Array.isArray(data))
          throw new Error("JSON phải là danh sách câu hỏi.");
        rows = data;
      } else {
        const data = Papa.parse<Record<string, unknown>>(text, {
          header: true,
          skipEmptyLines: true,
        });
        if (data.errors.length)
          throw new Error("CSV lỗi: " + data.errors[0].message);
        rows = data.data;
      }
      if (rows.length > 200) throw new Error("Nhập tối đa 200 câu mỗi lần.");
      const prepared = rows.map((row, i) => {
        const answer = String(row.answer || "");
        const mode = row.mode === "words" ? "words" : "letters";
        const tiles = Array.isArray(row.tiles)
          ? row.tiles.map(String)
          : String(row.tiles || "")
              .split("/")
              .map((s) => s.trim());
        if (!validateTiles(tiles, answer, mode).valid)
          throw new Error(`Dòng ${i + 2}: bộ chữ không khớp đáp án.`);
        return {
          answer,
          mode,
          tiles,
          duration: Number(row.duration) || 60,
          points: Number(row.points) || 100,
        };
      });
      if (!confirm(`Đã kiểm tra ${prepared.length} câu. Nhập vào bộ đã chọn?`))
        return;
      let saved = 0;
      for (const row of prepared) {
        try {
          await rpc("save_question", {
            p_set: selected,
            p_question: null,
            p_title: "Sắp xếp thành từ hoặc cụm từ có nghĩa",
            p_tiles: row.tiles,
            p_answer: row.answer,
            p_mode: row.mode,
            p_duration: row.duration,
            p_points: row.points,
          });
          saved++;
        } catch (e) {
          throw new Error(
            `Đã lưu ${saved}/${prepared.length} câu. Lỗi câu ${saved + 1}: ${errorText(e)}`,
            { cause: e },
          );
        }
      }
      await loadQuestions();
      notify(
        `Đã nhập ${saved} câu. Nhập tuần tự; không tự hoàn tác câu đã lưu.`,
      );
    } catch (e) {
      notify(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageTitle
        title="Bộ câu hỏi của tôi"
        description="Một bộ chữ thú vị có thể bắt đầu cả một cuộc vui."
      />
      <div className="question-layout">
        <Card>
          <h2>Thư viện câu hỏi</h2>
          <div className="actions">
            <input
              aria-label="Tên bộ câu hỏi mới"
              placeholder="Tên bộ câu hỏi mới"
              value={setTitle}
              maxLength={150}
              onChange={(e) => setSetTitle(e.target.value)}
            />
            <Button
              disabled={!setTitle.trim()}
              onClick={() => void createSet()}
            >
              <Plus size={16} />
              Tạo bộ
            </Button>
          </div>
          <Field label="Bộ câu hỏi">
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
            >
              <option value="">Chọn một bộ</option>
              {sets.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Trạng thái bộ câu hỏi">
            <select
              disabled={!selected}
              value={
                sets.find((s) => s.id === selected)?.visibility || "private"
              }
              onChange={(e) => void setVisibility(e.target.value)}
            >
              <option value="private">Riêng tư</option>
              <option value="public">Công khai tên bộ</option>
              <option value="archived">Lưu trữ</option>
            </select>
          </Field>
          <div className="actions">
            <Button
              kind="outline"
              disabled={!selected}
              onClick={() => exportFile()}
            >
              <Download size={16} />
              JSON
            </Button>
            <Button
              kind="outline"
              disabled={!selected}
              onClick={() => exportFile(true)}
            >
              CSV
            </Button>
            <label className="button outline">
              <Upload size={16} />
              Nhập
              <input
                type="file"
                className="sr-only"
                accept=".csv,.json"
                disabled={busy}
                onChange={(e) => {
                  if (e.target.files?.[0]) void importFile(e.target.files[0]);
                  e.target.value = "";
                }}
              />
            </label>
          </div>
          <small>
            Nhập CSV/JSON, tối đa 200 câu. Excel .xlsx chưa sẵn sàng.
          </small>
          <p>
            <a href={import.meta.env.BASE_URL + "cau-hoi-mau.json"} download>
              {" "}
              tải file 24 câu mẫu (JSON)
            </a>
          </p>
          <input
            aria-label="Tìm câu hỏi"
            placeholder="Tìm theo đáp án hoặc bộ chữ…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="bulk-toolbar">
            <label><input type="checkbox" checked={filteredQuestions.length > 0 && filteredQuestions.every((q) => selectedIds.includes(q.id))} onChange={(e) => setSelectedIds(e.target.checked ? filteredQuestions.map((q) => q.id) : [])} /> Chọn tất cả</label>
            <small>{selectedIds.length} câu đã chọn</small>
            <input type="number" min={5} max={600} placeholder="Giây" value={bulkDuration} onChange={(e) => setBulkDuration(e.target.value)} />
            <input type="number" min={0} max={10000} placeholder="Điểm" value={bulkPoints} onChange={(e) => setBulkPoints(e.target.value)} />
            <Button kind="outline" disabled={!selectedIds.length || bulkBusy || (bulkDuration === "" && bulkPoints === "")} onClick={() => void bulkUpdate()}>Cập nhật</Button>
            <Button kind="subtle" disabled={!selectedIds.length || bulkBusy} onClick={() => void bulkUpdate(true)}>Xóa {selectedIds.length || ""}</Button>
          </div>
          <div className="question-list" aria-label="Danh sách câu hỏi">
            {filteredQuestions.map((q, i) => (
                <article key={q.id} className={editing === q.id ? "selected" : ""} title={`${authors.find((a) => a.question_id === q.id)?.answer || ""} · ${q.tiles.join(" · ")}`}>
                  <input aria-label={`Chọn câu ${i + 1}`} type="checkbox" checked={selectedIds.includes(q.id)} onChange={() => toggleSelected(q.id)} />
                  <span className="number">{i + 1}</span>
                  <div>
                    <strong>
                      {authors.find((a) => a.question_id === q.id)?.answer}
                    </strong>
                    <p>{q.tiles.join(" · ")}</p>
                    <small>
                      {q.duration} giây · {q.points} điểm ·{" "}
                      {q.mode === "letters" ? "Ghép chữ" : "Ghép từ"}
                    </small>
                  </div>
                  <button aria-label="Sửa câu" onClick={() => edit(q)}>
                    <Pencil size={16} />
                  </button>
                  <button
                    aria-label="Nhân bản câu"
                    onClick={() => void duplicate(q)}
                  >
                    <Copy size={16} />
                  </button>
                  <button aria-label="Xóa câu" onClick={() => void remove(q)}>
                    <Trash2 size={16} />
                  </button>
                </article>
              ))}
            {!filteredQuestions.length && <Empty message={questions.length ? "Không có câu nào khớp bộ lọc." : undefined} />}
          </div>
        </Card>
        <Card>
          <span className="eyebrow">TRÌNH BIÊN SOẠN</span>
          <h2>{editing ? "Chỉnh sửa câu hỏi" : "Thêm một thử thách"}</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <Field label="Kiểu chơi">
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value as "letters" | "words")}
              >
                <option value="letters">Ghép chữ</option>
                <option value="words">Ghép từ</option>
              </select>
            </Field>
            <Field label="Đáp án chính">
              <input
                required
                maxLength={500}
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
              />
            </Field>
            <Button
              kind="subtle"
              onClick={() =>
                setTileText(tokens(answer, mode).reverse().join(" / "))
              }
            >
              Tạo bộ ô từ đáp án
            </Button>
            <Field label="Bộ chữ / từ (phân cách bằng /)">
              <textarea
                required
                value={tileText}
                onChange={(e) => setTileText(e.target.value)}
              />
            </Field>
            <div className="tiles editor-tiles">
              {tileText
                .split("/")
                .filter((t) => t.trim())
                .map((t, i) => (
                  <span className="tile" key={i}>
                    {t.trim()}
                  </span>
                ))}
            </div>
            <div className="two-columns">
              <Field label="Thời gian (5–600 giây)">
                <input
                  type="number"
                  min={5}
                  max={600}
                  value={duration}
                  onChange={(e) => setDuration(Number(e.target.value))}
                />
              </Field>
              <Field label="Điểm (0–10000)">
                <input
                  type="number"
                  min={0}
                  max={10000}
                  value={points}
                  onChange={(e) => setPoints(Number(e.target.value))}
                />
              </Field>
            </div>
            <Field label="Gợi ý (sử dụng trừ 10 điểm)">
              <input value={hint} onChange={(e) => setHint(e.target.value)} />
            </Field>
            <Field label="Giải thích khi công bố">
              <textarea
                value={explanation}
                onChange={(e) => setExplanation(e.target.value)}
              />
            </Field>
            <Field label="Đáp án thay thế (phân cách bằng |)">
              <input
                value={alternatives}
                onChange={(e) => setAlternatives(e.target.value)}
              />
            </Field>
            <div className="actions">
              <Button type="submit" disabled={!selected || busy}>
                {busy ? "Đang lưu…" : "Lưu câu hỏi"}
              </Button>
              <Button kind="outline" onClick={reset}>
                Làm mới
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </>
  );
}
