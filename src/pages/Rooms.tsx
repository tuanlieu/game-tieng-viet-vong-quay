import { useEffect, useLayoutEffect, useRef, useState } from "react";
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
  Gift,
} from "lucide-react";
import {
  Button,
  Card,
  Field,
  Modal,
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
  type RewardStatus,
  type RewardTotals,
} from "../lib/api";
import { secondsLeft, wheelRotation, type Theme } from "../lib/game";
import { useAudio } from "../lib/audio";
import { AudioButton, AudioSettings } from "../components/AudioControls";
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
  const audio = useAudio();
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
  // A fresh invitation must take precedence over a stale room remembered in
  // this browser. This is particularly important in Zalo/Safari, where an
  // anonymous session can survive when a user opens a second room link.
  const invitationCode = location.hash.startsWith("#join=")
    ? location.hash.slice(6, 14).toUpperCase()
    : "";
  const [rooms, setRooms] = useState<Room[]>([]),
    [sets, setSets] = useState<SetRecord[]>([]),
    [selected, setSelected] = useState(
      invitationCode
        ? ""
        : savedGuest?.roomId || sessionStorage.getItem("game-room-selection") || "",
    ),
    [title, setTitle] = useState(""),
    [setId, setSetId] = useState(""),
    [code, setCode] = useState(invitationCode),
    [playerName, setPlayerName] = useState(
      savedGuest?.name || sessionStorage.getItem("game-guest-name") || "",
    ),
    [team, setTeam] = useState("");
  const [run, setRun] = useState<Run | null>(null),
    [members, setMembers] = useState<Member[]>([]),
    [mySubmission, setMySubmission] = useState<MySubmission | null>(null),
    [roomReward, setRoomReward] = useState<RoomReward | null>(null),
    [rewardStatus, setRewardStatus] = useState<RewardStatus | null>(null),
    [rewardTotals, setRewardTotals] = useState<RewardTotals | null>(null),
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
    [rewardWheel, setRewardWheel] = useState(""),
    [rewardEnabled, setRewardEnabled] = useState(false),
    [rewardSpinDuration, setRewardSpinDuration] = useState(10),
    [rewardSaving, setRewardSaving] = useState(false),
    [rewardMessage, setRewardMessage] = useState(""),
    [rewardMessageError, setRewardMessageError] = useState(false);
  const [answerPopupRunId, setAnswerPopupRunId] = useState<string | null>(null);
  const [countdownReadyRunId, setCountdownReadyRunId] = useState<string | null>(null);
  const [rewardSpin, setRewardSpin] = useState<{
    rewardId: string;
    spinning: boolean;
    rotation: number;
    result: { label: string; color: string } | null;
    endsAt: string;
  } | null>(null);
  const revealedRunRef = useRef<string | null>(null);
  const receivedRunRef = useRef<string | null>(null);
  const warnedRunRef = useRef<string | null>(null);
  const resultSoundRunRef = useRef<string | null>(null);
  const submittingRef = useRef(false);
  const staleRoomRef = useRef<string | null>(null);
  const room = rooms.find((r) => r.id === selected);
  const isOwner = !!userId && !isAnonymous && room?.owner_id === userId;
  const rewardDirty = Boolean(
    isOwner && room &&
      (rewardEnabled !== Boolean(room.reward_fastest_enabled) ||
        rewardWheel !== (room.reward_wheel_id || "") ||
        rewardSpinDuration !== room.reward_spin_duration_seconds),
  );
  function chooseRoom(nextRoomId: string) {
    if (nextRoomId !== selected && rewardDirty && !confirm("Cấu hình thưởng chưa được lưu. Đổi phòng sẽ bỏ các thay đổi này?")) return;
    setSelected(nextRoomId);
  }
  function abandonStaleRoom(error: unknown) {
    const message = errorText(error);
    if (!/không còn là người chơi|không có quyền xem phòng|không có quyền\.?/i.test(message))
      return false;
    if (staleRoomRef.current !== selected) {
      staleRoomRef.current = selected;
      notify("Bạn không còn ở phòng trước đó. Hãy nhập mã để tham gia một phòng khác.");
    }
    sessionStorage.removeItem("game-guest-room");
    sessionStorage.removeItem("game-room-selection");
    setSelected("");
    return true;
  }
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
        setRewardStatus(state.reward_status);
        setRewardTotals(state.reward_totals);
        if (state.run)
          setOffset(Date.parse(state.run.server_now) - (sent + Date.now()) / 2);
        await loadRooms();
      } catch (e) {
        if (alive && !abandonStaleRoom(e)) notify(errorText(e));
      } finally {
        loading = false;
      }
    }
    void refresh();
    const timer = setInterval(() => void refresh(), 4000);
    const resume = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("online", resume);
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
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("online", resume);
      void client().removeChannel(channel);
      onTheme(null);
    };
  }, [selected]);
  useEffect(() => {
    if (!selected || !userId || isOwner) return;
    const touch = () =>
      void rpc("touch_room_member", { p_room: selected }).catch((error) => {
        // Stop the heartbeat as soon as the server confirms that this saved
        // browser session is no longer a member. Retrying would only produce
        // repeated 400s and can leave the player on an unusable screen.
        abandonStaleRoom(error);
      });
    touch();
    const timer = setInterval(touch, 20000);
    return () => clearInterval(timer);
  }, [selected, userId, isOwner]);
  useEffect(() => {
    if (selected) sessionStorage.setItem("game-room-selection", selected);
  }, [selected]);
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
    if (run?.state === "revealed") notify("");
  }, [run?.state]);
  useEffect(() => {
    if (run?.state !== "revealed") {
      setAnswerPopupRunId(null);
      return;
    }
    if (revealedRunRef.current !== run.id) {
      revealedRunRef.current = run.id;
      setAnswerPopupRunId(run.id);
    }
  }, [run?.id, run?.state]);
  useEffect(() => {
    if (!answerPopupRunId) return;
    const timer = window.setTimeout(() => setAnswerPopupRunId(null), 7000);
    return () => window.clearTimeout(timer);
  }, [answerPopupRunId]);
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
    if (!room) return;
    setRewardWheel(room.reward_wheel_id || "");
    setRewardEnabled(Boolean(room.reward_fastest_enabled));
    setRewardSpinDuration(room.reward_spin_duration_seconds || 10);
    setRewardMessage("");
    setRewardMessageError(false);
  }, [room?.id, room?.reward_wheel_id, room?.reward_fastest_enabled]);
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
  useEffect(() => {
    audio.setContext(presentation);
    return () => audio.setContext(false);
  }, [presentation]);
  useEffect(() => {
    if (!room || run || rewardSpin) audio.stop("waiting");
    else audio.loop("waiting", "waitingRoom", 0.28);
  }, [room?.id, run?.id, rewardSpin, audio.foregroundTick, audio.prefs.enabled, audio.prefs.music]);
  useLayoutEffect(() => {
    if (!run?.id || isOwner || receivedRunRef.current === run.id) return;
    receivedRunRef.current = run.id;
    setCountdownReadyRunId(null);
    const isNewlyOpened = left >= run.duration - 1;
    if (!audio.prefs.enabled || !isNewlyOpened) {
      setCountdownReadyRunId(run.id);
      return;
    }
    audio.play("questionStart", { volume: 0.9, onEnded: () => setCountdownReadyRunId(run.id) });
  }, [run?.id, run?.duration, left, isOwner, audio.prefs.enabled]);
  useEffect(() => {
    const shouldPlay = !isOwner && countdownReadyRunId === run?.id && run?.state === "running" && !answered && run.can_answer !== false && left > 0;
    if (shouldPlay) audio.loop("countdown", "countdown", 0.5);
    else { audio.stop("countdown"); if (run?.state !== "running") audio.stopEffects(["tenSeconds"]); }
  }, [run?.id, run?.state, run?.can_answer, countdownReadyRunId, answered, left, isOwner, audio.foregroundTick, audio.prefs.enabled, audio.prefs.effects]);
  useEffect(() => () => audio.stopEffects(["tenSeconds"]), [run?.id]);
  useLayoutEffect(() => {
    if (!run?.id || isOwner || run.state !== "running" || answered || run.duration <= 10 || left <= 0 || left > 10 || warnedRunRef.current === run.id) return;
    warnedRunRef.current = run.id;
    audio.stop("countdown");
    audio.play("tenSeconds", { volume: 1, onEnded: () => {
      if (!document.hidden) audio.loop("countdown", "countdown", 0.5);
    } });
  }, [run?.id, run?.state, run?.duration, left, answered, isOwner]);
  useLayoutEffect(() => {
    if (!run?.id || run.state !== "revealed" || !mySubmission || mySubmission.correct === null || resultSoundRunRef.current === run.id) return;
    resultSoundRunRef.current = run.id;
    audio.play(mySubmission.correct ? "correct" : "incorrect", { volume: 0.95 });
  }, [run?.id, run?.state, mySubmission?.correct]);
  useEffect(() => {
    if (!rewardSpin) { audio.stop("wheelMusic"); audio.stop("wheelSpin"); return; }
    if (rewardSpin.spinning) audio.stop("wheelMusic");
    else { audio.stop("wheelSpin"); audio.loop("wheelMusic", "wheelBackground", 0.2); }
  }, [rewardSpin?.spinning, rewardSpin?.rewardId, audio.foregroundTick, audio.prefs.enabled, audio.prefs.music]);
  const rewardWheelItems = rewardStatus?.wheel?.items || [];
  const rewardWheelBackground = rewardWheelItems.length
    ? `conic-gradient(${rewardWheelItems.map((item, index) => {
      const start = (index * 360) / rewardWheelItems.length;
      const end = ((index + 1) * 360) / rewardWheelItems.length;
      return `${item.color} ${start}deg ${end}deg`;
    }).join(", ")})`
    : "conic-gradient(#04605e 0deg 72deg, #10aa8b 72deg 144deg, #f8a41e 144deg 216deg, #151b45 216deg 288deg, #cc3333 288deg 360deg)";
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
      // Prevent iOS Safari from keeping the page zoomed after the name/code
      // field is submitted. The controls are also kept at 16px in CSS.
      const focused = document.activeElement as HTMLElement | null;
      focused?.blur();
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
      if (location.hash.startsWith("#join="))
        history.replaceState({}, document.title, location.pathname + location.search);
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
      if (action === "start" && data) audio.play("questionStart", { volume: 0.9 });
      if (data)
        setOffset(Date.parse(data.server_now) - (sent + Date.now()) / 2);
    } catch (e) {
      notify(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  async function submit() {
    if (!canSubmit || submittingRef.current) return;
    submittingRef.current = true;
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
      audio.stop("countdown");
      audio.stopEffects(["tenSeconds"]);
      audio.play("submit", { volume: 0.7 });
      setMySubmission({ submitted: true, answer, correct: null, score: null });
      notify("Đã gửi câu trả lời. Chờ MC công bố đáp án.");
    } catch (e) {
      notify(errorText(e));
    } finally {
      submittingRef.current = false;
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
  const availableReward = rewardStatus?.history.find((item) => item.state === "available");
  async function spinReward(rewardId = availableReward?.id || (roomReward?.mine ? roomReward.id : undefined)) {
    if (!rewardId || rewardSpin) return;
    setBusy(true);
    setRewardSpin({ rewardId, spinning: true, rotation: 0, result: null, endsAt: new Date().toISOString() });
    try {
      const requestKey = `game-spin-request:${rewardId}`;
      const requestId = sessionStorage.getItem(requestKey) || crypto.randomUUID();
      sessionStorage.setItem(requestKey, requestId);
      const result = await rpc<{ label: string; color: string; ends_at: string; duration_seconds: number }>(
        "begin_room_reward_spin",
        { p_reward: rewardId, p_request_id: requestId },
      );
      const target = rewardWheelItems.findIndex(
        (item) => item.label === result.label && item.color === result.color,
      );
      const rotation = wheelRotation(target < 0 ? 0 : target, Math.max(1, rewardWheelItems.length));
      audio.stop("wheelMusic");
      audio.loop("wheelSpin", "wheelSpin", 0.7);
      window.requestAnimationFrame(() =>
        setRewardSpin((current) => current && current.rewardId === rewardId
          ? { ...current, rotation, endsAt: result.ends_at }
          : current),
      );
      window.setTimeout(() => {
        audio.stop("wheelSpin");
        if (roomReward?.id === rewardId)
          setRoomReward({ ...roomReward, state: "spun", label: result.label, color: result.color });
        setRewardStatus((previous) => previous ? {
          ...previous,
          available_count: Math.max(0, previous.available_count - 1),
          wheel: previous.wheel ? {
            ...previous,
            items: previous.wheel.items.map((item) =>
              item.label === result.label && item.color === result.color && item.remaining !== null
                ? { ...item, remaining: Math.max(0, item.remaining - 1) }
                : item,
            ),
          } : null,
          history: previous.history.map((item) => item.id === rewardId
            ? { ...item, state: "spun", label: result.label, color: result.color, spun_at: new Date().toISOString() }
            : item),
        } : previous);
        setRewardSpin({ rewardId, spinning: false, rotation, result, endsAt: result.ends_at });
        setBusy(false);
        notify(`🎉 Bạn đã quay được: ${result.label}`);
        void rpc("confirm_room_reward_seen", { p_reward: rewardId })
          .then(() => sessionStorage.removeItem(requestKey))
          .catch((error) => notify(errorText(error)));
      }, Math.max(0, Date.parse(result.ends_at) - Date.now()));
    } catch (e) {
      audio.stop("wheelSpin");
      setRewardSpin(null);
      setBusy(false);
      notify(errorText(e));
    }
  }
  async function saveRewardConfig() {
    if (!room) return;
    setRewardSaving(true);
    setRewardMessage("");
    setRewardMessageError(false);
    try {
      await rpc("configure_room_reward", {
        p_room: room.id,
        p_enabled: rewardEnabled,
        p_wheel: rewardEnabled ? rewardWheel || null : null,
      });
      if (rewardSpinDuration !== room.reward_spin_duration_seconds) {
        await rpc("set_room_reward_spin_duration", { p_room: room.id, p_seconds: rewardSpinDuration });
      }
      await loadRooms();
      setRewardMessage("Đã lưu cấu hình thưởng cho các câu tiếp theo.");
    } catch (e) {
      setRewardEnabled(Boolean(room.reward_fastest_enabled));
      setRewardWheel(room.reward_wheel_id || "");
      setRewardSpinDuration(room.reward_spin_duration_seconds || 10);
      setRewardMessage(errorText(e));
      setRewardMessageError(true);
    } finally {
      setRewardSaving(false);
    }
  }
  const canConfigureReward = !run || run.state === "revealed";
  const scores = [...members].sort((a, b) => b.score - a.score || a.display_name.localeCompare(b.display_name));
  return (
    <div className={presentation ? "presentation" : ""}>
      <PageTitle
        title={room ? "Phòng của bạn" : "Phòng chơi"}
        description={room ? "Sẵn sàng trả lời câu hỏi và nhận phần thưởng." : "Một mã phòng. Nhiều người chơi. Chung một niềm vui."}
      >
        <AudioButton />
        <AudioSettings />
        {!isAnonymous && userId && (
          <div className="room-toolbar">
            <label className="room-picker">
              <span>Chọn phòng của bạn</span>
              <select value={selected} onChange={(e) => chooseRoom(e.target.value)}>
                <option value="">Chọn phòng</option>
                {rooms.map((r) => <option key={r.id} value={r.id}>{r.title} · {r.code}</option>)}
              </select>
            </label>
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
          </div>
        )}
      </PageTitle>
      {!presentation && !isAnonymous && userId && !room && (
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
      {!presentation && (isAnonymous || !userId) && !room && !(isAnonymous && savedGuest?.roomId === selected) && (
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
                  {run ? run.question_type === "duoi_hinh_bat_chu" ? "ĐUỔI HÌNH BẮT CHỮ" : "THỬ THÁCH GHÉP CHỮ" : "PHÒNG CHỜ"}
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
                        : run.question_type === "duoi_hinh_bat_chu"
                          ? "Quan sát hình ảnh và đoán từ hoặc cụm từ có nghĩa."
                          : "Chạm vào từng ô theo thứ tự. Có thể nhập trực tiếp bằng bàn phím."}
                  </p>
                  <div className="progress">
                    <span
                      style={{
                        width: Math.min(100, (left / run.duration) * 100) + "%",
                      }}
                    />
                  </div>
                  {run.question_type === "duoi_hinh_bat_chu" && run.image_url && (
                    <figure className="picture-question">
                      <img src={import.meta.env.BASE_URL + run.image_url.replace(/^\//, "")} alt="Hình gợi ý câu hỏi" />
                    </figure>
                  )}
                  {run.question_type !== "duoi_hinh_bat_chu" && <><div className="tiles game-tiles">
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
                        onClick={() => {
                          if (!canSubmit || chosen.includes(i)) return;
                          audio.play("tileClick", { volume: 0.38 });
                          setChosen((c) => (c.includes(i) ? c : [...c, i]));
                        }}
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
                        audio.play("tileClick", { volume: 0.38 });
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
                  </div></>}
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
                  {roomReward && run.revealed && (
                    <div className={"reward-banner " + (roomReward.state === "spun" ? "spun" : "")}>
                      {roomReward.state === "spun" ? (
                        <><strong>🎊 {roomReward.winner} đã quay được {roomReward.label}</strong><span style={{ background: roomReward.color || "#F8A41E" }} /></>
                      ) : (
                        <>
                          <strong>{roomReward.mine ? "🎉 Bạn trả lời đúng nhanh nhất! Bạn được tặng 1 lượt quay." : `🎉 ${roomReward.winner} trả lời đúng nhanh nhất và nhận 1 lượt quay may mắn!`}</strong>
                          {roomReward.mine && <div className="actions"><Button disabled={busy} onClick={() => void spinReward(roomReward.id)}><Play size={16} /> Quay ngay</Button><Button kind="outline" onClick={() => notify("Lượt quay đã được giữ lại để bạn dùng sau.")}>Để sau</Button></div>}
                        </>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <Empty message="Mời người chơi vào phòng rồi bắt đầu câu đầu tiên." />
              )}
              {!isOwner && (
                <section className="player-rewards" aria-label="Quay thưởng">
                  <div className="player-reward-heading"><span>🎁</span><div><small>QUAY THƯỞNG</small><h3>Quay thưởng</h3></div><b>{rewardStatus?.available_count || 0} lượt</b></div>
                  <div className="reward-totals" aria-label="Tổng phần thưởng đã nhận">
                    <span><small>TỔNG QUÀ ĐÃ NHẬN</small><strong>{rewardTotals?.player.gifts || 0}</strong></span>
                    <span><small>TỔNG TIỀN ĐÃ NHẬN</small><strong>{Number(rewardTotals?.player.cash || 0).toLocaleString("vi-VN")} ₫</strong></span>
                  </div>
                  {!rewardStatus?.enabled ? (
                    <p>Phòng chưa bật thưởng quay.</p>
                  ) : (rewardStatus.available_count || 0) > 0 ? (
                    <div className="reward-ready"><strong>Bạn có {rewardStatus.available_count} lượt quay</strong><Button disabled={busy || !availableReward} onClick={() => void spinReward(availableReward?.id)}><Gift size={16} /> Quay ngay</Button></div>
                  ) : (
                    <p>Trả lời đúng nhanh nhất để nhận lượt quay!</p>
                  )}
                  {!!rewardStatus?.history.length && <div className="reward-history">{rewardStatus.history.map((item) => <span key={item.id} className={item.state}>{item.state === "spun" ? `Đã quay: ${item.label}` : "Lượt quay đang chờ"}</span>)}</div>}
                  {!!rewardStatus?.wheel?.items.length && (
                    <div className="reward-stock-list" aria-label="Phần thưởng còn lại">
                      {rewardStatus.wheel.items.map((item) => (
                        <span key={item.id}>
                          <i style={{ background: item.color }} />
                          {item.label} · {item.remaining === null ? "∞" : `còn ${item.remaining}`}
                        </span>
                      ))}
                    </div>
                  )}
                </section>
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
                  <div className="reward-settings">
                    <div className="reward-settings-head">
                      <div><strong>Thưởng vòng quay</strong><small>{room.reward_fastest_enabled ? "Đang bật" : "Đang tắt"}</small></div>
                      {!canConfigureReward && <small>Có thể thay đổi sau khi kết thúc câu hiện tại.</small>}
                    </div>
                  <div className="reward-totals host" aria-label="Tổng phần thưởng đã phát">
                    <span><small>TỔNG QUÀ ĐÃ PHÁT</small><strong>{rewardTotals?.host?.gifts || 0}</strong></span>
                    <span><small>TỔNG TIỀN ĐÃ PHÁT</small><strong>{Number(rewardTotals?.host?.cash || 0).toLocaleString("vi-VN")} ₫</strong></span>
                  </div>
                  <Field label="Vòng quay đang dùng">
                    <select
                      value={rewardWheel}
                      disabled={!canConfigureReward || rewardSaving}
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
                  <Field label="Thời lượng quay (giây)">
                    <input type="number" min="2" max="60" value={rewardSpinDuration}
                      disabled={!canConfigureReward || rewardSaving}
                      onChange={(e) => setRewardSpinDuration(Math.min(60, Math.max(2, Number(e.target.value) || 2)))} />
                  </Field>
                  <label className="switch-row">
                    <input
                      type="checkbox"
                      checked={rewardEnabled}
                      disabled={!canConfigureReward || rewardSaving}
                      onChange={(e) => setRewardEnabled(e.target.checked)}
                    />
                    <span>Thưởng 1 lượt quay cho người trả lời đúng nhanh nhất mỗi câu</span>
                  </label>
                  <Button disabled={!canConfigureReward || rewardSaving || (rewardEnabled && !rewardWheel)} onClick={() => void saveRewardConfig()}>
                    {rewardSaving ? "Đang lưu…" : "Lưu cấu hình thưởng"}
                  </Button>
                  {rewardMessage && <small className={"config-message " + (rewardMessageError ? "error" : "")}>{rewardMessage}</small>}
                  {rewardStatus?.wheel && (
                    <div className="room-reward-stock" aria-live="polite">
                      <strong>Tồn kho phần thưởng trong phòng</strong>
                      <div>
                        {rewardStatus.wheel.items.map((item) => (
                          <span key={item.id} title={`${item.label}: ${item.remaining === null ? "không giới hạn" : `còn ${item.remaining}`}`}>
                            <i style={{ background: item.color }} />
                            {item.label} · {item.remaining === null ? "∞" : `còn ${item.remaining}`}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  </div>
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
              {isOwner && <Button
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
              </Button>}
              {isOwner && <small>Điểm đội hiện hiển thị theo thành viên.</small>}
            </Card>
          </div>
        </>
      )}
      {answerPopupRunId === run?.id && run?.revealed && (
        <Modal title="Kết quả câu hỏi" onClose={() => setAnswerPopupRunId(null)}>
          <div className="answer-popup">
            <small>ĐÁP ÁN</small>
            <h2>{run.revealed.answer}</h2>
            {run.revealed.explanation && <p>{run.revealed.explanation}</p>}
            {mySubmission ? (
              <p className={mySubmission.correct ? "result-good" : "result-bad"}>
                Câu trả lời của bạn: <strong>{mySubmission.correct ? run.revealed.answer : mySubmission.answer}</strong> · {mySubmission.correct ? `Đúng, +${mySubmission.score} điểm` : "Chưa đúng"}
              </p>
            ) : (
              <p>Bạn chưa gửi câu trả lời.</p>
            )}
            <small className="popup-countdown">Tự đóng sau 7 giây</small>
          </div>
        </Modal>
      )}
      {rewardSpin && (
        <Modal
          title="🎁 Vòng quay may mắn"
          onClose={() => {
            if (!rewardSpin.spinning) setRewardSpin(null);
          }}
        >
          <div className="reward-spin-popup">
            <div className="reward-spin-wheel-wrap" aria-label="Vòng quay phần thưởng">
              <div className="wheel-pointer" />
              <div
                className="reward-spin-wheel"
                style={{ transform: `rotate(${rewardSpin.rotation}deg)`, background: rewardWheelBackground }}
              >
                {rewardWheelItems.map((item, index) => {
                  const angle = ((index + 0.5) * 360) / rewardWheelItems.length;
                  return (
                    <span
                      className="reward-spin-label"
                      key={item.id}
                      title={`${item.label} · ${item.remaining === null ? "không giới hạn" : `còn ${item.remaining}`}`}
                      style={{ transform: `rotate(${angle}deg) translateY(-112px) rotate(${90 - angle}deg)` }}
                    >
                      {item.label}
                    </span>
                  );
                })}
                <div className="reward-spin-center"><Gift size={35} /></div>
              </div>
            </div>
            {rewardSpin.spinning ? (
              <><strong>Vòng quay đang chọn phần thưởng cho bạn…</strong><p>Kết quả chỉ hiển thị cho bạn khi vòng quay dừng.</p></>
            ) : (
              <div className="reward-spin-result">
                <small>CHÚC MỪNG BẠN NHẬN ĐƯỢC</small>
                <h2>{rewardSpin.result?.label}</h2>
                <span style={{ background: rewardSpin.result?.color || "#F8A41E" }} />
                <Button onClick={() => setRewardSpin(null)}>Hoàn tất</Button>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
