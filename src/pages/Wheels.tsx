import { useEffect, useState } from "react";
import { Plus, Gift, RotateCw, Download, Trash2 } from "lucide-react";
import {
  Button,
  Card,
  Field,
  PageTitle,
  Empty,
  errorText,
  Modal,
} from "../components/UI";
import { client, rpc, download, type Wheel, type Prize } from "../lib/api";
import {
  effectiveProbabilities,
  wheelRotation,
  chooseWeighted,
} from "../lib/game";
import { useAudio } from "../lib/audio";
type Spin = {
  id: string;
  prize_id: string;
  result_label: string;
  created_at: string;
  delivered: boolean;
  probabilities: unknown;
};
export default function Wheels({
  notify,
  onActivity,
}: {
  notify: (s: string) => void;
  onActivity: (active: boolean) => void;
}) {
  const audio = useAudio();
  const [wheels, setWheels] = useState<Wheel[]>([]),
    [selected, setSelected] = useState(""),
    [title, setTitle] = useState(""),
    [prizes, setPrizes] = useState<Prize[]>([]),
    [label, setLabel] = useState(""),
    [weight, setWeight] = useState(1),
    [stock, setStock] = useState(""),
    [rewardKind, setRewardKind] = useState<"gift" | "cash">("gift"),
    [cashValue, setCashValue] = useState(""),
    [color, setColor] = useState("#04605E"),
    [history, setHistory] = useState<Spin[]>([]),
    [spinning, setSpinning] = useState(false),
    [rotation, setRotation] = useState(0),
    [result, setResult] = useState<{ label: string; test: boolean } | null>(
      null,
    ),
    [requestId, setRequestId] = useState<string | null>(null),
    [uncertain, setUncertain] = useState(false);
  const [userId, setUserId] = useState("");
  const wheel = wheels.find((w) => w.id === selected);
  let probabilities: ReturnType<typeof effectiveProbabilities> = [];
  let probabilityError = "";
  try {
    probabilities = effectiveProbabilities(prizes, wheel?.probability_mode);
  } catch (e) {
    probabilityError = errorText(e);
  }
  async function load() {
    try {
      const { data, error } = await client()
        .from("wheels")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      setWheels(data);
      if (!selected && data[0]) setSelected(data[0].id);
    } catch (e) {
      notify(errorText(e));
    }
  }
  async function refresh(id = selected) {
    if (!id) return;
    try {
      const results = await Promise.all([
        client()
          .from("prizes")
          .select("*")
          .eq("wheel_id", id)
          .order("position")
          .order("id"),
        client()
          .from("spins")
          .select("*")
          .eq("wheel_id", id)
          .order("created_at", { ascending: false })
          .limit(100),
      ]);
      for (const r of results) if (r.error) throw r.error;
      setPrizes(results[0].data as Prize[]);
      setHistory(results[1].data as Spin[]);
    } catch (e) {
      notify(errorText(e));
    }
  }
  useEffect(() => {
    void client()
      .auth.getUser()
      .then(({ data }) => setUserId(data.user?.id || ""));
    void load();
  }, []);
  useEffect(() => {
    setRotation(0);
    setResult(null);
    const pending = sessionStorage.getItem("pending-spin:" + selected);
    setRequestId(pending);
    setUncertain(!!pending);
    void refresh();
  }, [selected]);
  useEffect(() => {
    onActivity(spinning);
    return () => onActivity(false);
  }, [spinning]);
  useEffect(() => {
    if (spinning) audio.stop("wheelMusic");
    else audio.loop("wheelMusic", "wheelBackground", 0.2);
    return () => { audio.stop("wheelMusic"); audio.stop("wheelSpin"); };
  }, [spinning, audio.foregroundTick, audio.prefs.enabled, audio.prefs.music]);
  async function create() {
    try {
      const { data, error } = await client()
        .from("wheels")
        .insert({ title })
        .select()
        .single();
      if (error) throw error;
      await load();
      setSelected(data.id);
      setTitle("");
    } catch (e) {
      notify(errorText(e));
    }
  }
  async function add() {
    try {
      if (prizes.length >= 100) throw new Error("Tối đa 100 ô.");
      const { error } = await client()
        .from("prizes")
        .insert({
          wheel_id: selected,
          label,
          weight,
          stock: stock === "" ? null : Number(stock),
          reward_kind: rewardKind,
          cash_value: rewardKind === "cash" ? Number(cashValue) : 0,
          color,
          position: prizes.length,
        });
      if (error) throw error;
      setLabel("");
      setRewardKind("gift");
      setCashValue("");
      await refresh();
    } catch (e) {
      notify(errorText(e));
    }
  }
  async function remove(id: string) {
    if (
      !confirm(
        "Xóa phần thưởng? Quà đã có lượt quay được giữ để bảo toàn lịch sử.",
      )
    )
      return;
    try {
      const { error } = await client().from("prizes").delete().eq("id", id);
      if (error) throw error;
      await refresh();
    } catch (e) {
      notify(errorText(e));
    }
  }
  async function updatePrize(id: string, values: Record<string, unknown>) {
    try {
      const { error } = await client()
        .from("prizes")
        .update(values)
        .eq("id", id);
      if (error) throw error;
      await refresh();
    } catch (e) {
      notify(errorText(e));
    }
  }
  async function spin(test = false) {
    if (spinning || !wheel) return;
    setSpinning(true);
    try {
      let index: number;
      let resultLabel: string;
      if (test) {
        const array = new Uint32Array(1);
        crypto.getRandomValues(array);
        const chosen = chooseWeighted(probabilities, array[0] / 4294967296);
        index = prizes.findIndex((p) => p.id === chosen.id);
        resultLabel = prizes[index].label;
      } else {
        const id = requestId || crypto.randomUUID();
        setRequestId(id);
        sessionStorage.setItem("pending-spin:" + selected, id);
        const spin = await rpc<Spin>("spin_wheel", {
          p_wheel: selected,
          p_id: id,
        });
        index = prizes.findIndex((p) => p.id === spin.prize_id);
        resultLabel = spin.result_label;
        setUncertain(false);
        if (index < 0)
          throw new Error("Không tìm thấy ô kết quả; xem lịch sử trên server.");
      }
      setRotation((r) => wheelRotation(index, prizes.length, r));
      audio.loop("wheelSpin", "wheelSpin", 0.7);
      window.setTimeout(
        () => {
          audio.stop("wheelSpin");
          setSpinning(false);
          setResult({ label: resultLabel, test });
          if (!test) {
            setRequestId(null);
            sessionStorage.removeItem("pending-spin:" + selected);
            void refresh();
          }
        },
        (matchMedia("(prefers-reduced-motion: reduce)").matches
          ? 0.05
          : wheel.duration) *
          1000 +
          150,
      );
    } catch (e) {
      audio.stop("wheelSpin");
      setSpinning(false);
      if (!test) setUncertain(true);
      notify(
        errorText(e) +
          " Khi mạng ổn định, bấm lại để khôi phục cùng ID lượt quay.",
      );
    }
  }
  const gradient = prizes.length
    ? "conic-gradient(" +
      prizes
        .map(
          (p, i) =>
            `${p.color} ${(i / prizes.length) * 100}% ${((i + 1) / prizes.length) * 100}%`,
        )
        .join(",") +
      ")"
    : "conic-gradient(#04605E 0% 25%,#10AA8B 25% 50%,#F8A41E 50% 75%,#151B45 75% 100%)";
  return (
    <>
      <PageTitle
        title="Vòng quay may mắn"
        description="Một vòng quay. Một bất ngờ. Một khoảnh khắc đáng nhớ."
      />
      <div className="actions create-wheel">
        <input
          aria-label="Tên vòng quay"
          maxLength={150}
          placeholder="Tên vòng quay mới…"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <Button disabled={!title.trim()} onClick={() => void create()}>
          <Plus size={16} />
          Tạo vòng quay
        </Button>
      </div>
      <Field label="Chọn vòng quay">
        <select
          value={selected}
          disabled={spinning || uncertain}
          onChange={(e) => setSelected(e.target.value)}
        >
          <option value="">Chọn một vòng quay</option>
          {wheels.map((w) => (
            <option key={w.id} value={w.id}>
              {w.title}
            </option>
          ))}
        </select>
      </Field>
      <div className="wheel-layout">
        <Card className="wheel-stage">
          <span className="eyebrow">{wheel?.title || "VÒNG QUAY CỦA BẠN"}</span>
          <h2>May mắn đang chờ bạn</h2>
          <div className="wheel-wrap">
            <div className="wheel-pointer" />
            <div
              className="wheel"
              style={{
                background: gradient,
                transform: `rotate(${rotation}deg)`,
                transitionDuration: spinning
                  ? `${wheel?.duration || 6}s`
                  : "0s",
              }}
            >
              {prizes.map((p, i) => (
                <span
                  className="wheel-label"
                  key={p.id}
                  style={{
                    transform: `rotate(${((i + 0.5) * 360) / prizes.length}deg) translateY(-110px) rotate(90deg)`,
                  }}
                >
                  {prizes.length > 12
                    ? i + 1
                    : p.label.length > 12
                      ? p.label.slice(0, 10) + "…"
                      : p.label}
                </span>
              ))}
              <div className="wheel-center">
                <Gift size={32} />
              </div>
            </div>
          </div>
          <p>Ô bằng nhau · Diện tích ô không đại diện cho xác suất.</p>
          {!selected && (
            <div className="notice">
              Hình minh họa. Tạo vòng và thêm ít nhất 2 ô để quay.
            </div>
          )}
          {selected && probabilityError && (
            <div className="notice">{probabilityError}</div>
          )}
          <div className="actions centered">
            <Button
              disabled={
                !selected ||
                (!uncertain && (prizes.length < 2 || !!probabilityError)) ||
                spinning
              }
              onClick={() => void spin()}
            >
              <RotateCw size={18} />
              {spinning
                ? "Đang quay…"
                : uncertain
                  ? "Khôi phục lượt quay"
                  : "Quay chính thức"}
            </Button>
            <Button
              kind="outline"
              disabled={
                !selected ||
                prizes.length < 2 ||
                !!probabilityError ||
                spinning ||
                uncertain
              }
              onClick={() => void spin(true)}
            >
              Quay thử
            </Button>
          </div>
          <small>
            Quay thử không trừ quà. Chính thức do server chọn, tự chuẩn hóa xác
            suất theo quà còn tồn.
          </small>
        </Card>
        <Card>
          <h2>Danh sách phần thưởng</h2>
          {selected && wheel?.owner_id === userId && (
            <>
              <Field label="Kiểu xác suất">
                <select
                  disabled={spinning}
                  value={wheel?.probability_mode || "weights"}
                  onChange={(e) =>
                    void client()
                      .from("wheels")
                      .update({ probability_mode: e.target.value })
                      .eq("id", selected)
                      .then(({ error }) => {
                        if (error) notify(error.message);
                        else void load();
                      })
                  }
                >
                  <option value="weights">Trọng số</option>
                  <option value="percent">Phần trăm (tổng 100%)</option>
                </select>
              </Field>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void add();
                }}
              >
                <Field label="Tên phần thưởng">
                  <input
                    required
                    value={label}
                    maxLength={100}
                    onChange={(e) => setLabel(e.target.value)}
                    placeholder="Ví dụ: Voucher cà phê hoặc Tiền mặt 100.000 ₫"
                  />
                </Field>
                <div className="two-columns">
                  <Field label="Loại phần thưởng">
                    <select value={rewardKind} onChange={(e) => setRewardKind(e.target.value as "gift" | "cash") }>
                      <option value="gift">Quà hiện vật / voucher</option>
                      <option value="cash">Tiền mặt</option>
                    </select>
                  </Field>
                  <Field label="Giá trị tiền (VNĐ)">
                    <input type="number" min="0" step="1000" disabled={rewardKind !== "cash"} required={rewardKind === "cash"} value={cashValue} onChange={(e) => setCashValue(e.target.value)} placeholder="Ví dụ: 100000" />
                  </Field>
                </div>
                <div className="two-columns">
                  <Field label="Trọng số / phần trăm">
                    <input
                      type="number"
                      min={0}
                      max={999999}
                      step="any"
                      value={weight}
                      onChange={(e) => setWeight(Number(e.target.value))}
                    />
                  </Field>
                  <Field label="Tồn kho (để trống = không giới hạn)">
                    <input
                      type="number"
                      min={0}
                      value={stock}
                      onChange={(e) => setStock(e.target.value)}
                    />
                  </Field>
                </div>
                <Field label="Màu ô">
                  <input
                    type="color"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                  />
                </Field>
                <Button type="submit" disabled={spinning}>
                  <Plus size={16} />
                  Thêm phần thưởng
                </Button>
              </form>
            </>
          )}
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Ô / Quà</th>
                  <th>Xác suất hiệu lực</th>
                  <th>Tồn</th>
                  <th>Giá trị</th>
                  <th>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {prizes.map((p, i) => (
                  <tr key={p.id}>
                    <td>
                      <span
                        className="color-dot"
                        style={{ background: p.color }}
                      />
                      {i + 1}. {p.label}
                    </td>
                    <td>
                      {(
                        (probabilities.find((x) => x.id === p.id)
                          ?.probability || 0) * 100
                      ).toFixed(2)}
                      %
                    </td>
                    <td>{p.stock ?? "∞"}</td>
                    <td>{p.reward_kind === "cash" ? `${Number(p.cash_value || 0).toLocaleString("vi-VN")} ₫` : "Quà"}</td>
                    <td>
                      <button
                        disabled={spinning || wheel?.owner_id !== userId}
                        onClick={() =>
                          void updatePrize(p.id, { enabled: !p.enabled })
                        }
                      >
                        {p.enabled ? "Tắt" : "Bật"}
                      </button>
                      <button
                        aria-label="Sửa số lượng quà"
                        disabled={spinning || wheel?.owner_id !== userId}
                        onClick={() => {
                          const value = prompt(
                            "Số tồn mới (trống = không giới hạn)",
                            String(p.stock ?? ""),
                          );
                          if (value !== null && /^[0-9]*$/.test(value))
                            void updatePrize(p.id, {
                              stock: value === "" ? null : Number(value),
                            });
                        }}
                      >
                        Sửa tồn
                      </button>
                      <button
                        aria-label="Sửa loại và giá trị phần thưởng"
                        disabled={spinning || wheel?.owner_id !== userId}
                        onClick={() => {
                          const type = prompt("Nhập gift (quà) hoặc cash (tiền mặt)", p.reward_kind || "gift");
                          if (type !== "gift" && type !== "cash") return;
                          const amount = type === "cash" ? prompt("Giá trị tiền (VNĐ)", String(p.cash_value || 0)) : "0";
                          if (amount !== null && /^\d+$/.test(amount)) void updatePrize(p.id, { reward_kind: type, cash_value: Number(amount) });
                        }}
                      >
                        Giá trị
                      </button>
                      <button
                        aria-label="Xóa quà"
                        disabled={spinning || wheel?.owner_id !== userId}
                        onClick={() => void remove(p.id)}
                      >
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!prizes.length && (
            <Empty message="Thêm ít nhất 2 phần thưởng để bắt đầu." />
          )}
        </Card>
      </div>
      <Card>
        <div className="page-title">
          <div>
            <h2>Lịch sử lượt quay</h2>
            <p>
              100 lượt gần nhất. Mỗi kết quả giữ nguyên sau khi tải lại trang.
            </p>
          </div>
          <Button
            kind="outline"
            disabled={!selected}
            onClick={() =>
              download("lich-su-quay.json", JSON.stringify(history, null, 2))
            }
          >
            <Download size={16} />
            Xuất lịch sử
          </Button>
        </div>
        {history.map((s) => (
          <div className="history-row" key={s.id}>
            <Gift size={18} />
            <strong>{s.result_label}</strong>
            <span>
              {new Date(s.created_at).toLocaleString("vi-VN", {
                timeZone: "Asia/Ho_Chi_Minh",
              })}
            </span>
            <Button
              kind="subtle"
              disabled={s.delivered || wheel?.owner_id !== userId}
              onClick={() =>
                void rpc("mark_delivered", { p_spin: s.id })
                  .then(() => refresh())
                  .catch((e) => notify(errorText(e)))
              }
            >
              {s.delivered ? "Đã trao" : "Đánh dấu đã trao"}
            </Button>
          </div>
        ))}
        {!history.length && <Empty message="Chưa có lượt quay chính thức." />}
      </Card>
      {result && (
        <Modal
          title={result.test ? "KẾT QUẢ QUAY THỬ" : "CHÚC MỪNG!"}
          onClose={() => setResult(null)}
        >
          <div className="prize-result">
            <Gift size={56} />
            <h2>{result.label}</h2>
            <p>
              {result.test
                ? "Đây là lượt thử, không trừ tồn kho."
                : "Phần thưởng đã được ghi nhận trên server."}
            </p>
            <Button onClick={() => setResult(null)}>Tiếp tục</Button>
          </div>
        </Modal>
      )}
    </>
  );
}
