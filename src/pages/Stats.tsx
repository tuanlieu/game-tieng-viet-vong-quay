import { useEffect, useMemo, useState, type ReactNode } from "react";
import { BarChart3, BookOpen, Disc3, Download, RefreshCw, Users } from "lucide-react";
import { Button, Card, Empty, Loading, PageTitle, errorText } from "../components/UI";
import { client, download } from "../lib/api";

type RoomSummary = {
  id: string;
  code: string;
  title: string;
  status: string;
  created_at: string;
};

type Snapshot = {
  sets: number;
  questions: number;
  rooms: number;
  wheels: number;
  activeRooms: number;
  latestRooms: RoomSummary[];
};

const initial: Snapshot = { sets: 0, questions: 0, rooms: 0, wheels: 0, activeRooms: 0, latestRooms: [] };

export default function Stats({ notify }: { notify: (message: string) => void }) {
  const [data, setData] = useState<Snapshot>(initial);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const supabase = client();
      const [sets, questions, rooms, wheels] = await Promise.all([
        supabase.from("question_sets").select("id", { count: "exact", head: true }),
        supabase.from("questions").select("id", { count: "exact", head: true }),
        supabase.from("rooms").select("id, code, title, status, created_at", { count: "exact" }).order("created_at", { ascending: false }).limit(8),
        supabase.from("wheels").select("id", { count: "exact", head: true }),
      ]);
      for (const result of [sets, questions, rooms, wheels]) if (result.error) throw result.error;
      const latestRooms = (rooms.data || []) as RoomSummary[];
      setData({
        sets: sets.count || 0,
        questions: questions.count || 0,
        rooms: rooms.count || 0,
        wheels: wheels.count || 0,
        activeRooms: latestRooms.filter((room) => ["lobby", "active", "revealed"].includes(room.status)).length,
        latestRooms,
      });
    } catch (error) {
      notify(errorText(error));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);
  const exportRows = useMemo(() => [
    ["Chỉ số", "Giá trị"],
    ["Bộ câu hỏi", data.sets],
    ["Câu hỏi", data.questions],
    ["Phòng đã tạo", data.rooms],
    ["Vòng quay", data.wheels],
    ["Phòng đang hoạt động", data.activeRooms],
  ], [data]);
  function exportCsv() {
    const csv = exportRows.map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\n");
    download("thong-ke-game-tieng-viet.csv", "\uFEFF" + csv, "text/csv;charset=utf-8");
  }
  return <>
    <PageTitle title="Thống kê của bạn" description="Tổng hợp nội dung và phòng do tài khoản này sở hữu.">
      <div className="actions"><Button kind="outline" onClick={() => void load()}><RefreshCw size={16} /> Làm mới</Button><Button kind="outline" onClick={exportCsv}><Download size={16} /> Xuất CSV</Button></div>
    </PageTitle>
    {loading ? <Loading /> : <>
      <div className="metrics stats-metrics">
        <Metric icon={<BookOpen />} label="Bộ câu hỏi" value={data.sets} note={`${data.questions} câu hỏi`} />
        <Metric icon={<Users />} label="Phòng đã tạo" value={data.rooms} note={`${data.activeRooms} phòng đang mở`} />
        <Metric icon={<Disc3 />} label="Vòng quay" value={data.wheels} note="Phần thưởng quản lý theo từng vòng" />
        <Metric icon={<BarChart3 />} label="Nội dung sẵn sàng" value={data.questions} note="Không bao gồm đáp án người chơi" />
      </div>
      <Card>
        <div className="card-heading"><div><span className="eyebrow">GẦN ĐÂY</span><h2>Phòng gần đây</h2></div></div>
        {!data.latestRooms.length ? <Empty message="Chưa có phòng do bạn tạo. Hãy tạo game đầu tiên." /> : <div className="history-list">
          {data.latestRooms.map((room) => <div className="history-row" key={room.id}>
            <strong>{room.title}</strong><span>Mã {room.code}</span><span className="status-pill">{labelStatus(room.status)}</span><small>{new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" }).format(new Date(room.created_at))}</small>
          </div>)}
        </div>}
      </Card>
    </>}
  </>;
}

function Metric({ icon, label, value, note }: { icon: ReactNode; label: string; value: number; note: string }) {
  return <Card className="metric"><span className="metric-icon">{icon}</span><p>{label}</p><strong>{value}</strong><small>{note}</small></Card>;
}
function labelStatus(status: string) {
  return ({ lobby: "Phòng chờ", active: "Đang chơi", revealed: "Đang công bố", closed: "Đã kết thúc" } as Record<string, string>)[status] || status;
}
