import {
  ArrowRight,
  Boxes,
  CircleHelp,
  Image,
  Layers3,
  ListChecks,
  Puzzle,
  Sparkles,
  Timer,
} from "lucide-react";
import { Button, Card, PageTitle } from "../components/UI";

type Destination = "questions" | "rooms" | "wheels";

const readyTemplates = [
  {
    icon: Puzzle,
    title: "Vua Tiếng Việt",
    tag: "Đang sẵn sàng",
    description: "Xếp chữ cái hoặc tiếng thành từ, cụm từ có nghĩa.",
    input: "Đáp án, bộ chữ, gợi ý, thời gian và điểm.",
    destination: "questions" as Destination,
  },
  {
    icon: Image,
    title: "Đuổi hình bắt chữ",
    tag: "Đang sẵn sàng",
    description: "Quan sát hình minh hoạ, rồi nhập đáp án trên điện thoại.",
    input: "Ảnh JPG/PNG/WEBP (≤ 5 MB), đáp án, gợi ý và điểm.",
    destination: "questions" as Destination,
  },
  {
    icon: Layers3,
    title: "Bộ đề kết hợp",
    tag: "Đang sẵn sàng",
    description: "Kết hợp câu ghép chữ và đuổi hình trong cùng một phòng.",
    input: "Chọn hai bộ đề đã có, sau đó tạo bản kết hợp an toàn.",
    destination: "questions" as Destination,
  },
  {
    icon: Sparkles,
    title: "Vòng quay may mắn",
    tag: "Đang sẵn sàng",
    description: "Trao quà, tiền thưởng hoặc thử thách sau mỗi lượt chơi.",
    input: "Ô quay, xác suất, số lượng tồn và thời lượng quay.",
    destination: "wheels" as Destination,
  },
];

const upcoming = [
  "Trắc nghiệm nhanh", "Đúng hay sai", "Ghép cặp", "Lật thẻ trí nhớ",
  "Mở hộp bí mật", "Sắp xếp thứ tự", "Phân loại nhóm", "Điền khuyết",
  "Săn từ", "Ô chữ", "Ai nhanh hơn", "Đường đua", "Đấu trường đội",
  "Thử thách 60 giây", "Nối tiếp đồng đội",
];

export default function Studio({ go }: { go: (page: Destination) => void }) {
  return (
    <>
      <PageTitle
        title="Trình tạo game"
        description="Chọn mẫu → nhập nội dung → thiết lập phòng và bắt đầu chơi."
      />
      <div className="studio-steps" aria-label="Ba bước tạo game">
        <span className="active"><b>1</b> Chọn mẫu</span>
        <ArrowRight size={16} />
        <span><b>2</b> Nhập nội dung</span>
        <ArrowRight size={16} />
        <span><b>3</b> Tạo phòng</span>
      </div>

      <section className="template-grid">
        {readyTemplates.map(({ icon: Icon, title, tag, description, input, destination }) => (
          <Card className="template-card" key={title}>
            <span className="template-icon"><Icon size={25} /></span>
            <span className="template-tag">{tag}</span>
            <h2>{title}</h2>
            <p>{description}</p>
            <small><b>Dữ liệu cần có:</b> {input}</small>
            <Button kind="outline" onClick={() => go(destination)}>
              Chọn mẫu <ArrowRight size={16} />
            </Button>
          </Card>
        ))}
      </section>

      <div className="two-columns">
        <Card>
          <span className="eyebrow">BƯỚC 2 · NHẬP NỘI DUNG</span>
          <h2><ListChecks size={21} /> Biên soạn có kiểm soát</h2>
          <p>Danh sách câu hỏi có vùng cuộn riêng. Bấm Sửa để form bên phải tự đưa đúng câu vào tầm nhìn; thời gian, điểm và câu được chọn có thể cập nhật hàng loạt.</p>
          <Button onClick={() => go("questions")}>Mở thư viện bộ đề</Button>
        </Card>
        <Card>
          <span className="eyebrow">BƯỚC 3 · XUẤT BẢN</span>
          <h2><Timer size={21} /> Sẵn sàng cho phòng chơi</h2>
          <p>Chọn bộ đề, thời lượng, thưởng và giao diện; sau đó gửi mã phòng hoặc link mời cho người chơi. Khách không cần tạo tài khoản.</p>
          <Button kind="yellow" onClick={() => go("rooms")}>Tạo hoặc điều hành phòng</Button>
        </Card>
      </div>

      <Card className="coming-soon-card">
        <span className="eyebrow">LỘ TRÌNH MẪU GAME</span>
        <h2><Boxes size={21} /> Các mẫu đang được mở rộng</h2>
        <p>Những mẫu dưới đây chưa được bật trong phòng chơi để không tạo cảm giác “có thể chơi” khi cơ chế chấm điểm và realtime chưa hoàn chỉnh.</p>
        <div className="template-chips">{upcoming.map((name) => <span key={name}>{name}</span>)}</div>
        <small><CircleHelp size={14} /> Khi một mẫu được bật, nó sẽ có đủ màn hướng dẫn, dữ liệu đầu vào, điều khiển MC và kiểm thử đa thiết bị.</small>
      </Card>
    </>
  );
}
