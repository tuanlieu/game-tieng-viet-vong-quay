import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Boxes,
  CircleHelp,
  Image,
  Layers3,
  ListChecks,
  Plus,
  Puzzle,
  Sparkles,
  Timer,
} from "lucide-react";
import { Button, Card, Field, Modal, PageTitle, errorText } from "../components/UI";
import { listSets, rpc, type SetRecord } from "../lib/api";

type Destination = "questions" | "rooms" | "wheels";
type ChallengeType =
  | "multiple_choice_one" | "multiple_choice_many" | "true_false"
  | "short_text" | "letter_build" | "image_riddle" | "matching"
  | "ordering" | "classification" | "fill_blank";

const challengeTypes: Array<{ value: ChallengeType; label: string; interaction: string; helper: string }> = [
  { value: "multiple_choice_one", label: "Trắc nghiệm một đáp án", interaction: "select_one", helper: "Người chơi chọn một phương án." },
  { value: "multiple_choice_many", label: "Trắc nghiệm nhiều đáp án", interaction: "select_many", helper: "Người chơi chọn đầy đủ các phương án đúng." },
  { value: "true_false", label: "Đúng / Sai", interaction: "select_one", helper: "Một nhận định với hai lựa chọn Đúng hoặc Sai." },
  { value: "short_text", label: "Nhập đáp án ngắn", interaction: "text_entry", helper: "Chấm theo đáp án chuẩn và đáp án thay thế." },
  { value: "letter_build", label: "Ghép chữ", interaction: "tile_order", helper: "Sắp xếp các ô chữ thành đáp án." },
  { value: "image_riddle", label: "Câu hỏi hình ảnh", interaction: "text_entry", helper: "Quan sát hình rồi nhập đáp án." },
  { value: "matching", label: "Ghép cặp", interaction: "pair_select", helper: "Chọn từng cặp tương ứng." },
  { value: "ordering", label: "Sắp xếp thứ tự", interaction: "reorder", helper: "Đưa các thẻ về đúng trình tự." },
  { value: "classification", label: "Phân loại nhóm", interaction: "grouping", helper: "Đưa từng mục vào nhóm phù hợp." },
  { value: "fill_blank", label: "Điền khuyết", interaction: "text_entry", helper: "Điền đáp án cho một hoặc nhiều ô trống." },
];

const readyTemplates = [
  { icon: Puzzle, title: "Vua Tiếng Việt", tag: "Đang sẵn sàng", description: "Xếp chữ cái hoặc tiếng thành từ, cụm từ có nghĩa.", input: "Đáp án, bộ chữ, gợi ý, thời gian và điểm.", destination: "questions" as Destination },
  { icon: Image, title: "Đuổi hình bắt chữ", tag: "Đang sẵn sàng", description: "Quan sát hình minh hoạ, rồi nhập đáp án trên điện thoại.", input: "Ảnh JPG/PNG/WEBP (≤ 5 MB), đáp án, gợi ý và điểm.", destination: "questions" as Destination },
  { icon: Layers3, title: "Bộ đề kết hợp", tag: "Đang sẵn sàng", description: "Kết hợp câu ghép chữ và đuổi hình trong cùng một phòng.", input: "Chọn hai bộ đề đã có, sau đó tạo bản kết hợp an toàn.", destination: "questions" as Destination },
  { icon: Sparkles, title: "Vòng quay may mắn", tag: "Đang sẵn sàng", description: "Trao quà, tiền thưởng hoặc thử thách sau mỗi lượt chơi.", input: "Ô quay, xác suất, số lượng tồn và thời lượng quay.", destination: "wheels" as Destination },
];

const upcoming = ["Lật thẻ trí nhớ", "Mở hộp bí mật", "Săn từ", "Ô chữ", "Ai nhanh hơn", "Đường đua", "Đấu trường đội", "Thử thách 60 giây", "Nối tiếp đồng đội"];

export default function Studio({ go }: { go: (page: Destination) => void }) {
  const [composerOpen, setComposerOpen] = useState(false);
  const [sets, setSets] = useState<SetRecord[]>([]);
  const [loadingSets, setLoadingSets] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [setId, setSetId] = useState("");
  const [type, setType] = useState<ChallengeType>("multiple_choice_one");
  const [title, setTitle] = useState("");
  const [prompt, setPrompt] = useState("");
  const [answer, setAnswer] = useState("");
  const [alternatives, setAlternatives] = useState("");
  const [duration, setDuration] = useState(60);
  const [points, setPoints] = useState(1000);
  const [difficulty, setDifficulty] = useState(1);
  const selectedType = useMemo(() => challengeTypes.find((item) => item.value === type)!, [type]);

  useEffect(() => {
    if (!composerOpen || sets.length || loadingSets) return;
    setLoadingSets(true);
    void listSets()
      .then((data) => {
        setSets(data);
        if (data[0]) setSetId(data[0].id);
      })
      .catch((error) => setNotice(errorText(error)))
      .finally(() => setLoadingSets(false));
  }, [composerOpen, sets.length, loadingSets]);

  async function saveDraft() {
    if (!setId || !title.trim() || !prompt.trim() || !answer.trim()) {
      setNotice("Chọn bộ đề và nhập đầy đủ tiêu đề, nội dung, đáp án.");
      return;
    }
    setSaving(true);
    setNotice("");
    try {
      await rpc("create_challenge_draft", {
        p_set: setId,
        p_question_type: type,
        p_interaction_model: selectedType.interaction,
        p_title: title.trim(),
        p_public_content: { prompt: prompt.trim() },
        p_answer_config: {
          answer: answer.trim(),
          alternatives: alternatives.split("\n").map((item) => item.trim()).filter(Boolean),
        },
        p_default_rules: { duration, points, normalization: { trim: true, collapse_spaces: true, case_sensitive: false } },
        p_difficulty: difficulty,
      });
      setNotice("Đã lưu bản nháp. Bản này chưa thể phát vào phòng cho đến khi màn chơi và bộ chấm tương ứng hoàn tất.");
      setTitle("");
      setPrompt("");
      setAnswer("");
      setAlternatives("");
    } catch (error) {
      setNotice(errorText(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageTitle title="Trình biên soạn" description="Tạo thử thách có phiên bản, dữ liệu bảo mật và luật rõ ràng trước khi phát vào phòng.">
        <Button onClick={() => setComposerOpen(true)}><Plus size={17} /> Thêm một thử thách</Button>
      </PageTitle>
      <div className="studio-steps" aria-label="Ba bước tạo game">
        <span className="active"><b>1</b> Biên soạn thử thách</span><ArrowRight size={16} />
        <span><b>2</b> Thiết lập vòng chơi</span><ArrowRight size={16} />
        <span><b>3</b> Tạo phòng</span>
      </div>

      <section className="template-grid">
        {readyTemplates.map(({ icon: Icon, title: name, tag, description, input, destination }) => (
          <Card className="template-card" key={name}>
            <span className="template-icon"><Icon size={25} /></span><span className="template-tag">{tag}</span>
            <h2>{name}</h2><p>{description}</p><small><b>Dữ liệu cần có:</b> {input}</small>
            <Button kind="outline" onClick={() => go(destination)}>Chọn mẫu <ArrowRight size={16} /></Button>
          </Card>
        ))}
      </section>

      <div className="two-columns">
        <Card>
          <span className="eyebrow">BƯỚC 1 · BIÊN SOẠN</span>
          <h2><ListChecks size={21} /> Thử thách có phiên bản</h2>
          <p>Mỗi thử thách mới tách nội dung công khai khỏi đáp án chấm; sửa sau này tạo phiên bản mới, không làm thay đổi lượt đã phát.</p>
          <Button onClick={() => setComposerOpen(true)}><Plus size={16} /> Thêm một thử thách</Button>
        </Card>
        <Card>
          <span className="eyebrow">BƯỚC 3 · XUẤT BẢN</span>
          <h2><Timer size={21} /> Sẵn sàng cho phòng chơi</h2>
          <p>Chỉ mẫu game đã có đủ luồng người chơi, chấm điểm và kiểm thử mới được bật trong phòng.</p>
          <Button kind="yellow" onClick={() => go("rooms")}>Tạo hoặc điều hành phòng</Button>
        </Card>
      </div>

      <Card className="coming-soon-card">
        <span className="eyebrow">ĐANG HOÀN THIỆN MÀN CHƠI</span>
        <h2><Boxes size={21} /> Các mẫu đã có dữ liệu nhưng chưa phát hành</h2>
        <p>Các mẫu dưới đây không được gắn nhãn “sẵn sàng” cho đến khi có đủ màn người chơi, quyền thao tác, chấm điểm backend và kiểm thử đa phiên.</p>
        <div className="template-chips">{upcoming.map((name) => <span key={name}>{name}</span>)}</div>
        <small><CircleHelp size={14} /> Các loại trắc nghiệm, đúng/sai, ghép cặp, sắp xếp, phân loại và điền khuyết hiện đã có bản nháp trong Trình biên soạn nhưng chưa được phép phát vào phòng.</small>
      </Card>

      {composerOpen && (
        <Modal title="Thêm một thử thách" onClose={() => setComposerOpen(false)}>
          <div className="challenge-composer">
            <p>Đáp án được lưu riêng, không gửi xuống thiết bị người chơi trước khi công bố.</p>
            <Field label="Bộ đề">
              <select value={setId} onChange={(event) => setSetId(event.target.value)} disabled={loadingSets || saving}>
                <option value="">{loadingSets ? "Đang tải bộ đề…" : "Chọn bộ đề"}</option>
                {sets.map((item) => <option value={item.id} key={item.id}>{item.title}</option>)}
              </select>
            </Field>
            <Field label="Loại thử thách">
              <select value={type} onChange={(event) => setType(event.target.value as ChallengeType)} disabled={saving}>
                {challengeTypes.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </Field>
            <small>Mẫu tương tác: <b>{selectedType.interaction}</b> · {selectedType.helper}</small>
            <Field label="Tiêu đề">
              <input value={title} maxLength={500} onChange={(event) => setTitle(event.target.value)} disabled={saving} placeholder="Ví dụ: Thủ đô của Việt Nam" />
            </Field>
            <Field label="Nội dung hiển thị cho người chơi">
              <textarea value={prompt} rows={4} onChange={(event) => setPrompt(event.target.value)} disabled={saving} placeholder="Nhập nội dung, hướng dẫn hoặc câu hỏi…" />
            </Field>
            <Field label="Đáp án chuẩn (chỉ người biên soạn thấy)">
              <input value={answer} onChange={(event) => setAnswer(event.target.value)} disabled={saving} placeholder="Nhập đáp án hoặc cấu hình đáp án đầu tiên" />
            </Field>
            <Field label="Đáp án thay thế, mỗi dòng một đáp án">
              <textarea value={alternatives} rows={3} onChange={(event) => setAlternatives(event.target.value)} disabled={saving} />
            </Field>
            <div className="two-columns">
              <Field label="Thời gian (giây)"><input type="number" min="5" max="600" value={duration} disabled={saving} onChange={(event) => setDuration(Math.min(600, Math.max(5, Number(event.target.value) || 5)))} /></Field>
              <Field label="Điểm tối đa"><input type="number" min="0" max="10000" value={points} disabled={saving} onChange={(event) => setPoints(Math.min(10000, Math.max(0, Number(event.target.value) || 0)))} /></Field>
            </div>
            <Field label="Độ khó (1–5)"><input type="number" min="1" max="5" value={difficulty} disabled={saving} onChange={(event) => setDifficulty(Math.min(5, Math.max(1, Number(event.target.value) || 1)))} /></Field>
            <div className="actions"><Button disabled={saving || loadingSets} onClick={() => void saveDraft()}>{saving ? "Đang lưu…" : "Lưu bản nháp bảo mật"}</Button></div>
            {notice && <p className="config-message">{notice}</p>}
          </div>
        </Modal>
      )}
    </>
  );
}
