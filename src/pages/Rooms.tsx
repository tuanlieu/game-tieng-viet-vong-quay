import { useEffect, useState } from "react";
import {
  Play,
  Pause,
  Maximize2,
  RotateCcw,
  Check,
  Plus,
  Users,
  Copy,
  Eye,
  Download,
} from "lucide-react";
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
  startGuestSession,
  type SetRecord,
  type Room,
  type Run,
  type Question,
  type Wheel,
  type PlayState,
  type MySubmission,
  type RoomReward,
} from "../lib/api";
import { secondsLeft, type Theme } from "../lib/game";
type Member = {
  user_id: string;
  display_name: string;
  team_name: string | null;
  last_seen_at: string;
  score: number;
};
export default function Rooms({
  userId,
  isAnonymous,
  notify,
  onActivity,
  onTheme,
}: {
  userId?: string;
  isAnonymous: boolean;
  notify: (s: string) => void;
  onActivity: (active: boolean) => void;
  onTheme: (room: string | null) => void;
}) {
  const savedGuest = (() => {
    try {
      return JSON.parse(sessionStorage.getItem("game-guest-room") || "null") as {
        roomId?: string;
        name?: string;
      } | null;
    } catch {
      return null;
    }
  })();
  const [rooms, setRooms] = useState<Room[]>([]),
    [sets, setSets] = useState<SetRecord[]>([]),
    [selected, setSelected] = useState(savedGuest?.roomId || ""),
    [title, setTitle] = useState(""),
    [setId, setSetId] = useState(""),
    [code, setCode] = useState(
      location.hash.startsWith("#join=") ? location.hash.slice(6, 14) : "",
    ),
    [playerName, setPlayerName] = useState(
      savedGuest?.name || sessionStorage.getItem("game-guest-name") || "",
    ),
    [team, setTeam] = useState("");
  const [run, setRun] = useState<Run | null>(null),
    [members, setMembers] = useState<Member[]>([]),
    [mySubmission, setMySubmission] = useState<MySubmission | null>(null),
    [roomReward, setRoomReward] = useState<RoomReward | null>(null),
    [questions, setQuestions] = useState<Question[]>([]),
    [questionId, setQuestionId] = useState(""),
    [chosen, setChosen] = useState<number[]>([]),
    [typed, setTyped] = useState(""),
    [hint, setHint] = useState(""),
    [offset, setOffset] = useState(0),
    [tick, setTick] = useState(0),
    [busy, setBusy] = useState(false),
    [presentation, setPresentation] = useState(false);
  const [savedThemes, setSavedThemes] = useState<Theme[]>([]),
    [myWheels, setMyWheels] = useState<Wheel[]>([]),
    [rewardWheel, setRewardWheel] = useState("");
  const room = rooms.find((r) => r.id === selected);
  const isOwner = !!userId && !isAnonymous && room?.owner_id === userId;
  async function loadRooms() {
    try {
      const { data, error } = await client()
        .from("rooms")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      setRooms(data);
    } catch (e) {
      notify(errorText(e));
    }
  }
  useEffect(() => {
    if (!userId) return;
    if (!isAnonymous) {
      void client()
        .from("themes")
        .select("*")
        .eq("owner_id", userId)
        .then(({ data }) => setSavedThemes(data || []));
      void client()
        .from("wheels")
        .select("*")
        .eq("owner_id", userId)
        .then(({ data }) => setMyWheels(data || []));
      void listSets()
        .then((s) => setSets(s.filter((s) => s.owner_id === userId)))
        .catch((e) => notify(errorText(e)));
    }
    void loadRooms();
  }, [userId, isAnonymous]);
  useEffect(() => {
    if (!selected) {
      setRun(null);
      onTheme(null);
      return;
    }
    let alive = true;
    let loading = false;
    async function refresh() {
      if (loading) return;
      loading = true;
      try {
        const sent = Date.now();
        const state = await rpc<PlayState>("room_play_state", { p_room: selected });
        if (!alive) return;
        setRun(state.run);
        setMembers(state.members);
        setMySubmission(state.my_submission);
        setRoomReward(state.reward);
        if (state.run)
          setOffset(Date.parse(state.run.server_now) - (sent + Date.now()) / 2);
        await loadRooms();
      } catch (e) {
        if (alive) notify(errorText(e));
      } finally {
        loading = false;
      }
    }
    void refresh();
    const timer = setInterval(() => void refresh(), 4000);
    const channel = client()
      .channel("room:" + selected)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "runs",
          filter: "room_id=eq." + selected,
        },
        () => void refresh(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "room_members", filter: "room_id=eq." + selected },
        () => void refresh(),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "rooms",
          filter: "id=eq." + selected,
        },
        () => void refresh(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "run_rewards", filter: "room_id=eq." + selected },
        () => void refresh(),
      )
      .subscribe();
    onTheme(selected);
    return () => {
      alive = false;
      clearInterval(timer);
      void client().removeChannel(channel);
      onTheme(null);
    };
  }, [selected]);
  useEffect(() => {
    if (!selected || !userId || isOwner) return;
    const touch = () =>
      void rpc("touch_room_member", { p_room: selected }).catch(() => {
        /* A removed player must not silently regain access. */
      });
    touch();
    const timer = setInterval(touch, 20000);
    return () => clearInterval(timer);
  }, [selected, userId, isOwner]);
  useEffect(() => {
    const timer = setInterval(() => setTick((n) => n + 1), 250);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    setChosen([]);
    setTyped("");
    setHint("");
  }, [run?.id]);
  useEffect(() => {
    const active = run?.state === "running" || run?.state === "paused";
    onActivity(active);
    return () => onActivity(false);
  }, [run?.state]);
  useEffect(() => {
    if (!room || !isOwner) {
      setQuestions([]);
      return;
    }
    void client()
      .from("questions")
      .select("*")
      .eq("set_id", room.set_id)
      .order("position")
      .then(({ data, error }) => {
        if (error) notify(error.message);
        else {
          setQuestions(data);
          if (data[0]) setQuestionId(data[0].id);
        }
      });
  }, [room?.set_id, isOwner]);
  useEffect(() => {
    if (room?.reward_wheel_id) setRewardWheel(room.reward_wheel_id);
  }, [room?.reward_wheel_id]);
  const left =
    run?.state === "paused"
      ? Math.ceil(run.remaining)
      : secondsLeft(run?.deadline || null, offset);
  void tick;
  const answered = Boolean(mySubmission?.submitted);
  const canSubmit =
    run?.state === "running" &&
    left > 0 &&
    run?.can_answer !== false &&
    !answered &&
    !busy;
  async function create() {
    try {
      const { data, error } = await client()
        .from("rooms")
        .insert({ title, set_id: setId })
        .select()
        .single();
      if (error) throw error;
      await loadRooms();
      setSelected(data.id);
      setTitle("");
      notify("Phòng đã tạo. Gửi mã phòng cho người chơi.");
    } catch (e) {
      notify(errorText(e));
    }
  }
  async function join() {
    try {
      if (!userId) await startGuestSession(playerName);
      const id = await rpc<string>("join_room", {
        p_code: code,
        p_display_name: playerName,
        p_team: team || null,
      });
      await loadRooms();
      setSelected(id);
      sessionStorage.setItem(
        "game-guest-room",
        JSON.stringify({ roomId: id, name: playerName.trim() }),
      );
      sessionStorage.setItem("game-guest-name", playerName.trim());
      setCode("");
    } catch (e) {
      notify(errorText(e));
    }
  }
  async function control(action: string) {
    setBusy(true);
    try {
      await rpc("control_run", {
        p_room: selected,
        p_action: action,
        p_question: questionId,
      });
      const sent = Date.now();
      const data = await rpc<Run | null>("current_run", { p_room: selected });
      setRun(data);
      if (data)
        setOffset(Date.parse(data.server_now) - (sent + Date.now()) / 2);
    } catch (e) {
      notify(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  async function submit() {
    setBusy(true);
    try {
      const answer =
        typed.trim() ||
        (run?.mode === "words"
          ? chosen.map((i) => run.tiles[i]).join(" ")
          : chosen.map((i) => run?.tiles[i]).join(""));
      await rpc("submit_answer", {
        p_run: run?.id,
        p_answer: answer,
      });
      setMySubmission({ submitted: true, answer, correct: null, score: null });
      notify("Đã gửi câu trả lời. Chờ MC công bố đáp án.");
    } catch (e) {
      notify(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  async function patchRoom(values: Record<string, unknown>) {
    try {
      const { error } = await client()
        .from("rooms")
        .update(values)
        .eq("id", selected);
      if (error) throw error;
      await loadRooms();
    } catch (e) {
      notify(errorText(e));
    }
  }
  async function getHint() {
    try {
      setHint(await rpc<string>("use_hint", { p_run: run?.id }));
    } catch (e) {
      notify(errorText(e));
    }
  }
  async function spinReward() {
    if (!roomReward?.mine || roomReward.state !== "available") return;
    setBusy(true);
    try {
      const result = await rpc<{ label: string; color: string }>("spin_room_reward", {
        p_reward: roomReward.id,
      });
      setRoomReward({ ...roomReward, state: "spun", label: result.label, color: result.color });
      notify(`🎉 Bạn đã quay được: ${result.label}`);
    } catch (e) {
      notify(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  const scores = [...members].sort((a, b) => b.score - a.score || a.display_name.localeCompare(b.display_name));
  return (
    <div className={presentation ? "presentation" : ""}>
      <PageTitle
        title="Phòng chơi"
        description="Một mã phòng. Nhiều người chơi. Chung một niềm vui."
      >
        <Button
          kind="outline"
          onClick={() => {
            setPresentation(!presentation);
            if (!document.fullscreenElement)
              void document.documentElement
                .requestFullscreen()
                .catch(() =>
                  notify("Trình duyệt không cho phép toàn màn hình."),
                );
            else void document.exitFullscreen();
          }}
        >
          <Maximize2 size={16} />
          {presentation ? "Thoát trình chiếu" : "Trình chiếu"}
        </Button>
      </PageTitle>
      {!presentation && !isAnonymous && userId && (
        <div className="two-columns">
          <Card>
            <h2>Tổ chức trò chơi</h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void create();
              }}
            >
              <Field label="Tên phòng">
                <input
                  required
                  maxLength={150}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </Field>
              <Field label="Bộ câu hỏi của bạn">
                <select
                  required
                  value={setId}
                  onChange={(e) => setSetId(e.target.value)}
                >
                  <option value="">Chọn bộ câu hỏi</option>
                  {sets.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.title}
                    </option>
                  ))}
                </select>
              </Field>
              <Button type="submit">
                <Plus size={16} />
                Tạo phòng
              </Button>
            </form>
          </Card>
          <Card>
            <h2>Tham gia phòng chơi</h2>
            <p>Không cần đăng nhập. Nhập tên và mã phòng để bắt đầu.</p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void join();
              }}
            >
              <Field label="Mã phòng">
                <input
                  required
                  value={code}
                  maxLength={8}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                />
              </Field>
              <Field label="Tên người chơi hoặc tên đội">
                <input
                  required
                  value={playerName}
                  minLength={2}
                  maxLength={30}
                  onChange={(e) => setPlayerName(e.target.value)}
                  placeholder="Ví dụ: Đội Sao Mai"
                />
              </Field>
              <Field label="Tên đội (không bắt buộc)">
                <input
                  value={team}
                  maxLength={30}
                  onChange={(e) => setTeam(e.target.value)}
                />
              </Field>
              <Button type="submit">
                <Users size={16} />
                Vào phòng
              </Button>
            </form>
          </Card>
        </div>
      )}
      {!presentation && (isAnonymous || !userId) && (
        <Card className="guest-join-card">
          <span className="eyebrow">VÀO CHƠI NGAY</span>
          <h2>{code ? "Nhập tên để vào phòng" : "Chỉ cần mã phòng và tên của bạn"}</h2>
          <p>{code ? "Mã phòng đã được điền từ link mời." : "Chỉ cần mã phòng và tên của bạn để tham gia."}</p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void join();
            }}
          >
            <div className={code ? "" : "two-columns"}>
              {!code && <Field label="Mã phòng">
                <input
                  required
                  value={code}
                  maxLength={8}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="Ví dụ: A1B2C3D4"
                />
              </Field>}
              <Field label="Tên người chơi hoặc tên đội">
                <input
                  required
                  value={playerName}
                  minLength={2}
                  maxLength={30}
                  onChange={(e) => setPlayerName(e.target.value)}
                  placeholder="Ví dụ: Đội Sao Mai"
                />
              </Field>
            </div>
            <Button type="submit">
              <Play size={16} /> Vào phòng chơi
            </Button>
          </form>
        </Card>
      )}
      {!presentation && userId && (
        <Field label="Phòng của bạn">
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
          >
            <option value="">Chọn phòng</option>
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.title} · {r.code}
              </option>
            ))}
          </select>
        </Field>
      )}
      {room && (
        <>
          <div className="room-bar">
            <div>
              <strong>{room.title}</strong>
              <span className="badge">MÃ PHÒNG · {room.code}</span>
            </div>
            <div className="actions">
              <Button
                kind="subtle"
                onClick={() =>
                  void navigator.clipboard
                    .writeText(
                      location.origin +
                        import.meta.env.BASE_URL +
                        "#join=" +
                        room.code,
                    )
                    .then(() => notify("Đã sao chép link phòng."))
                    .catch(() =>
                      notify("Không sao chép được; hãy gửi mã phòng."),
                    )
                }
              >
                <Copy size={16} />
                Link mời
              </Button>
              {isOwner && (
                <>
                  <Button
                    kind="outline"
                    onClick={() => void patchRoom({ locked: !room.locked })}
                  >
                    {room.locked ? "Mở phòng" : "Khóa phòng"}
                  </Button>
                  <Button
                    kind="outline"
                    onClick={() =>
                      void patchRoom({ status: "finished", locked: true })
                    }
                  >
                    Kết thúc phòng
                  </Button>
                  <Button
                    kind="outline"
                    onClick={() => {
                      const next = prompt("Tên mới cho phòng", room.title);
                      if (next?.trim()) void patchRoom({ title: next.trim() });
                    }}
                  >
                    Sửa phòng
                  </Button>
                  <Button
                    kind="outline"
                    onClick={() =>
                      void rpc<string>("duplicate_room", { p_room: selected })
                        .then(async (id) => { await loadRooms(); setSelected(id); notify("Đã nhân đôi phòng. Phòng mới đang chờ người chơi."); })
                        .catch((e) => notify(errorText(e)))
                    }
                  >
                    Nhân đôi
                  </Button>
                  <Button
                    kind="subtle"
                    disabled={room.status === "playing"}
                    onClick={() => {
                      if (confirm("Xóa phòng này và lịch sử chơi trong phòng? Thao tác không thể hoàn tác."))
                        void rpc("delete_room", { p_room: selected })
                          .then(async () => { await loadRooms(); setSelected(""); notify("Đã xóa phòng."); })
                          .catch((e) => notify(errorText(e)));
                    }}
                  >
                    Xóa phòng
                  </Button>
                </>
              )}
            </div>
          </div>
          <div className="play-layout">
            <Card className="play-card">
              <div className="play-header">
                <span className="eyebrow">
                  {run ? "THỬ THÁCH GHÉP CHỮ" : "PHÒNG CHỜ"}
                </span>
                <span className={"timer " + (left <= 10 ? "urgent" : "")}>
                  {run ? left + " giây" : "Sẵn sàng"}
                </span>
              </div>
              {run ? (
                <>
                  <h2>{run.title}</h2>
                  <p>
                    {run.state === "paused"
                      ? "MC đã tạm dừng."
                      : run.state === "revealed"
                        ? "Đáp án đã được công bố."
                        : run.can_answer === false
                          ? "Bạn vào khi câu này đã bắt đầu. Hãy sẵn sàng cho câu tiếp theo."
                        : "Chạm vào từng ô theo thứ tự. Có thể nhập trực tiếp bằng bàn phím."}
                  </p>
                  <div className="progress">
                    <span
                      style={{
                        width: Math.min(100, (left / run.duration) * 100) + "%",
                      }}
                    />
                  </div>
                  <div className="tiles game-tiles">
                    {run.tiles.map((t, i) => (
                      <button
                        className={"tile " + (chosen.includes(i) ? "used" : "")}
                        disabled={!canSubmit || chosen.includes(i)}
                        draggable={canSubmit && !chosen.includes(i)}
                        onDragStart={(e) =>
                          e.dataTransfer.setData("text/plain", String(i))
                        }
                        key={i}
                        aria-label={`Ô ${i + 1}: ${t}`}
                        onClick={() =>
                          setChosen((c) => (c.includes(i) ? c : [...c, i]))
                        }
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                  <div
                    className="answer-zone"
                    aria-label="Các ô đã chọn"
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      const raw = e.dataTransfer.getData("text/plain");
                      const i = Number(raw);
                      if (
                        /^[0-9]+$/.test(raw) &&
                        canSubmit &&
                        Number.isInteger(i) &&
                        i >= 0 &&
                        i < (run?.tiles.length || 0)
                      )
                        setChosen((c) => (c.includes(i) ? c : [...c, i]));
                    }}
                  >
                    {chosen.length ? (
                      chosen.map((i) => (
                        <button
                          className="tile"
                          key={i}
                          disabled={!canSubmit}
                          onClick={() =>
                            setChosen((c) => c.filter((x) => x !== i))
                          }
                        >
                          {run.tiles[i]}
                        </button>
                      ))
                    ) : (
                      <span>Đáp án của bạn sẽ hiện ở đây</span>
                    )}
                  </div>
                  <Field label="Hoặc nhập đáp án">
                    <input
                      disabled={!canSubmit}
                      value={typed}
                      maxLength={500}
                      onChange={(e) => setTyped(e.target.value)}
                      placeholder="Nhập từ hoặc cụm từ…"
                    />
                  </Field>
                  <div className="actions">
                    <Button
                      disabled={!canSubmit || (!typed && !chosen.length)}
                      onClick={() => void submit()}
                    >
                      <Check size={18} />
                      Gửi đáp án
                    </Button>
                    <Button
                      kind="outline"
                      disabled={!canSubmit}
                      onClick={() => {
                        setChosen([]);
                        setTyped("");
                      }}
                    >
                      <RotateCcw size={16} />
                      Xóa
                    </Button>
                    <Button
                      kind="subtle"
                      disabled={!canSubmit}
                      onClick={() => void getHint()}
                    >
                      Gợi ý −10 điểm
                    </Button>
                  </div>
                  {hint && (
                    <div className="notice">
                      Gợi ý: {hint || "Câu này chưa có gợi ý."}
                    </div>
                  )}
                  {answered && !run.revealed && (
                    <div className="notice">
                      Đã gửi câu trả lời: <strong>{mySubmission?.answer}</strong>. Kết quả được lưu trên server.
                    </div>
                  )}
                  {run.revealed && (
                    <div className="revealed">
                      <small>ĐÁP ÁN</small>
                      <h2>{run.revealed.answer}</h2>
                      <p>{run.revealed.explanation}</p>
                      {mySubmission ? (
                        <p className={mySubmission.correct ? "result-good" : "result-bad"}>
                          Câu trả lời của bạn: <strong>{mySubmission.answer}</strong> · {mySubmission.correct ? `Đúng, +${mySubmission.score} điểm` : "Chưa đúng"}
                        </p>
                      ) : (
                        <p>Bạn chưa gửi câu trả lời.</p>
                      )}
                    </div>
                  )}
                  {roomReward && run.revealed && (
                    <div className={"reward-banner " + (roomReward.state === "spun" ? "spun" : "")}>
                      {roomReward.state === "spun" ? (
                        <><strong>🎊 {roomReward.winner} đã quay được {roomReward.label}</strong><span style={{ background: roomReward.color || "#F8A41E" }} /></>
                      ) : (
                        <>
                          <strong>🎉 {roomReward.winner} trả lời đúng nhanh nhất và nhận 1 lượt quay may mắn!</strong>
                          {roomReward.mine && <Button disabled={busy} onClick={() => void spinReward()}><Play size={16} /> Quay ngay</Button>}
                        </>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <Empty message="Mời người chơi vào phòng rồi bắt đầu câu đầu tiên." />
              )}
              {isOwner && !presentation && (
                <div className="mc-panel">
                  <h3>Điều khiển MC</h3>
                  <Field label="Giao diện chung của phòng">
                    <select
                      value={room.theme_id || ""}
                      disabled={
                        run?.state === "running" || run?.state === "paused"
                      }
                      onChange={(e) =>
                        void patchRoom({ theme_id: e.target.value || null })
                      }
                    >
                      <option value="">Sắc Việt mặc định</option>
                      {savedThemes.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Button
                    kind="outline"
                    onClick={() =>
                      void patchRoom({
                        late_join_enabled: !room.late_join_enabled,
                      })
                    }
                  >
                    {room.late_join_enabled
                      ? "Tắt tham gia muộn"
                      : "Cho phép tham gia muộn"}
                  </Button>
                  <Field label="Vòng quay cấp lượt cho thành viên">
                    <select
                      value={rewardWheel}
                      onChange={(e) => setRewardWheel(e.target.value)}
                    >
                      <option value="">Chọn vòng quay của MC</option>
                      {myWheels.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.title}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <label className="switch-row">
                    <input
                      type="checkbox"
                      checked={Boolean(room.reward_fastest_enabled)}
                      onChange={(e) =>
                        void rpc("configure_room_reward", {
                          p_room: selected,
                          p_enabled: e.target.checked,
                          p_wheel: e.target.checked ? rewardWheel || null : null,
                        })
                          .then(() => loadRooms())
                          .catch((err) => notify(errorText(err)))
                      }
                    />
                    Thưởng 1 lượt quay cho người trả lời đúng nhanh nhất mỗi câu
                  </label>
                  <select
                    aria-label="Chọn câu"
                    value={questionId}
                    onChange={(e) => setQuestionId(e.target.value)}
                  >
                    {questions.map((q, i) => (
                      <option key={q.id} value={q.id}>
                        Câu {i + 1} · {q.tiles.join(" / ")}
                      </option>
                    ))}
                  </select>
                  <div className="actions">
                    <Button
                      disabled={
                        busy ||
                        !questionId ||
                        (!!run && run.state !== "revealed")
                      }
                      onClick={() => void control("start")}
                    >
                      <Play size={15} />
                      Bắt đầu
                    </Button>
                    <Button
                      kind="outline"
                      disabled={
                        busy ||
                        !run ||
                        !["running", "paused"].includes(run.state)
                      }
                      onClick={() =>
                        void control(
                          run?.state === "paused" ? "resume" : "pause",
                        )
                      }
                    >
                      <Pause size={15} />
                      {run?.state === "paused" ? "Tiếp tục" : "Tạm dừng"}
                    </Button>
                    <Button
                      kind="outline"
                      disabled={
                        busy ||
                        !run ||
                        !["running", "paused"].includes(run.state)
                      }
                      onClick={() => void control("extend")}
                    >
                      +15 giây
                    </Button>
                    <Button
                      kind="outline"
                      disabled={busy || !run}
                      onClick={() => void control("end")}
                    >
                      Dừng câu
                    </Button>
                    <Button
                      kind="subtle"
                      disabled={busy || !run}
                      onClick={() => void control("reveal")}
                    >
                      <Eye size={15} />
                      Công bố
                    </Button>
                  </div>
                </div>
              )}
            </Card>
            <Card className="scoreboard">
              <span className="eyebrow">CHUNG MỘT CUỘC VUI</span>
              <h2>Bảng xếp hạng</h2>
              <p>
                {members.length} người chơi · Tổng điểm giảm dần, cùng điểm cùng
                hạng.
              </p>
              {scores.map((m, i) => (
                <div className="score-row" key={m.user_id}>
                  <span>
                    {scores.findIndex((s) => s.score === m.score) + 1}
                  </span>
                  <div>
                    <strong>{m.display_name}</strong>
                    <small>{m.team_name || "Cá nhân"}</small>
                  </div>
                  <b>{m.score}</b>
                  {isOwner && !presentation && (
                    <button
                      aria-label="Loại người chơi"
                      onClick={() => {
                        if (confirm("Loại người chơi khỏi phòng?"))
                          void rpc("remove_room_member", {
                            p_room: selected,
                            p_user: m.user_id,
                          })
                            .then(() => notify("Đã loại người chơi khỏi phòng."))
                            .catch((e) => notify(errorText(e)));
                      }}
                    >
                      ×
                    </button>
                  )}
                  <small>
                    {Date.now() - Date.parse(m.last_seen_at) < 45000
                      ? "Đang hoạt động"
                      : "Ngoại tuyến"}
                  </small>
                  {i === 0 && <span className="sr-only">Đang dẫn đầu</span>}
                </div>
              ))}
              {!members.length && <Empty message="Chưa có người chơi." />}
              <Button
                kind="outline"
                onClick={() =>
                  download(
                    "ket-qua-phong.json",
                    JSON.stringify(
                      { room: room.title, scores },
                      null,
                      2,
                    ),
                  )
                }
              >
                <Download size={16} />
                Xuất kết quả
              </Button>
              <small>
                Điểm đội hiện hiển thị theo thành viên; tổng hợp theo đội chưa
                sẵn sàng.
              </small>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
