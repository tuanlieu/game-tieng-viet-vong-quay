import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  LayoutDashboard,
  BookOpen,
  Users,
  Disc3,
  Gift,
  Palette,
  BarChart3,
  Shield,
  Archive,
  Settings,
  HelpCircle,
  Menu,
  X,
  ChevronRight,
  ArrowUpRight,
  Sun,
  Moon,
  LogOut,
  LogIn,
  Sparkles,
  Play,
  UserRound,
  History,
  Monitor,
  CheckCircle2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { db, configured, rpc, client, download } from "./lib/api";
import { themes, type Theme } from "./lib/game";
import {
  Button,
  Card,
  PageTitle,
  Unavailable,
  errorText,
} from "./components/UI";
import Auth from "./pages/Auth";
import Questions from "./pages/Questions";
import Rooms from "./pages/Rooms";
import Wheels from "./pages/Wheels";
import Themes from "./pages/Themes";
import Profile, { UsersAdmin } from "./pages/Profile";
const NAME = "Game Tiếng Việt - Vòng Quay May Mắn";
type Page =
  | "overview"
  | "questions"
  | "rooms"
  | "wheels"
  | "themes"
  | "profile"
  | "users"
  | "history"
  | "stats"
  | "audit"
  | "backup"
  | "settings"
  | "guide"
  | "login"
  | "rewards"
  | "media"
  | "privacy";
const navigation: { id: Page; label: string; icon: LucideIcon }[] = [
  { id: "overview", label: "Tổng quan", icon: LayoutDashboard },
  { id: "questions", label: "Bộ câu hỏi", icon: BookOpen },
  { id: "rooms", label: "Phòng chơi", icon: Users },
  { id: "wheels", label: "Vòng quay", icon: Disc3 },
  { id: "themes", label: "Giao diện & Sự kiện", icon: Palette },
  { id: "history", label: "Lịch sử & Thành tích", icon: History },
];
function initialTheme() {
  try {
    const parsed = JSON.parse(
      localStorage.getItem("game-theme") || "null",
    ) as Theme | null;
    if (
      parsed &&
      parsed.tokens &&
      Object.values(parsed.tokens).every((c) => /^#[a-fA-F0-9]{6}$/.test(c))
    )
      return parsed;
  } catch {
    /* Use known tokens for corrupt preferences. */
  }
  return themes[0];
}
export default function App() {
  const [page, setPage] = useState<Page>("overview"),
    [session, setSession] = useState<Session | null>(null),
    [role, setRole] = useState("guest"),
    [mustChange, setMustChange] = useState(false),
    [drawer, setDrawer] = useState(false),
    [compact, setCompact] = useState(false),
    [toast, setToast] = useState(""),
    [dark, setDark] = useState(localStorage.getItem("game-dark") === "true"),
    [baseTheme, setBaseTheme] = useState(initialTheme),
    [eventTheme, setEventTheme] = useState<Theme | null>(null),
    [active, setActive] = useState(false),
    [roomScope, setRoomScope] = useState<string | null>(null),
    [connected, setConnected] = useState(navigator.onLine),
    [counts, setCounts] = useState({ sets: 0, rooms: 0, wheels: 0 });
  const effective = eventTheme || baseTheme;
  const accountName = session
    ? String(
        session.user.user_metadata?.display_name ||
          session.user.user_metadata?.full_name ||
          session.user.email ||
          "Tài khoản của bạn",
      )
    : "Khách tham quan";
  function go(p: Page) {
    setPage(p);
    setDrawer(false);
  }
  useEffect(() => {
    if (!db) return;
    let alive = true;
    async function update(s: Session | null) {
      if (!alive) return;
      setSession(s);
      if (!s) {
        setRole("guest");
        setMustChange(false);
        return;
      }
      try {
        const data = await rpc<{ role: string; must_change_password: boolean }>(
          "my_access",
        );
        if (alive) {
          setRole(data.role);
          setMustChange(data.must_change_password);
        }
      } catch (e) {
        setToast(errorText(e));
      }
    }
    void db.auth.getSession().then(({ data }) => void update(data.session));
    const { data } = db.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === "PASSWORD_RECOVERY") {
        setPage("profile");
      }
      if (s && event === "SIGNED_IN") {
        setPage(location.hash.startsWith("#join=") ? "rooms" : "overview");
      }
      setTimeout(() => void update(s), 0);
    });
    return () => {
      alive = false;
      data.subscription.unsubscribe();
    };
  }, []);
  useEffect(() => {
    const online = () => setConnected(true),
      offline = () => setConnected(false);
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
    };
  }, []);
  useEffect(() => {
    document.documentElement.dataset.mode = dark ? "dark" : "light";
    localStorage.setItem("game-dark", String(dark));
  }, [dark]);
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--primary", effective.tokens.primary);
    root.style.setProperty("--accent", effective.tokens.accent);
    root.style.setProperty("--page", effective.tokens.background);
    root.style.setProperty("--ink", effective.tokens.ink);
  }, [effective]);
  useEffect(() => {
    if (!session || !db) {
      setEventTheme(null);
      return;
    }
    let stopped = false;
    async function check() {
      try {
        const result = await rpc<{ theme: Theme | null; server_now: string }>(
          "active_theme",
          { p_room: roomScope },
        );
        if (!stopped && !active)
          setEventTheme(result.theme || (roomScope ? themes[0] : null));
      } catch {
        /* Keep base theme on connection failure. */
      }
    }
    void check();
    const timer = setInterval(() => void check(), 15000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [session?.user.id, active, roomScope]);
  useEffect(() => {
    if (!session || !db) return;
    let alive = true;
    void Promise.all(
      ["question_sets", "rooms", "wheels"].map((table) =>
        client()
          .from(table)
          .select("id", { count: "exact", head: true })
          .eq("owner_id", session.user.id),
      ),
    ).then((results) => {
      if (alive)
        setCounts({
          sets: results[0].count || 0,
          rooms: results[1].count || 0,
          wheels: results[2].count || 0,
        });
    });
    return () => {
      alive = false;
    };
  }, [page, session?.user.id]);
  function selectTheme(t: Theme) {
    if (active) {
      setToast("Chờ câu hỏi hoặc vòng quay kết thúc để đổi giao diện.");
      return;
    }
    setBaseTheme(t);
    localStorage.setItem("game-theme", JSON.stringify(t));
    setToast(
      "Đã chọn giao diện nền. Lịch sự kiện đang hiệu lực có ưu tiên cao hơn.",
    );
  }
  const protectedPage = ![
    "overview",
    "login",
    "guide",
    "privacy",
    "settings",
  ].includes(page);
  const visiblePage =
    mustChange && session
      ? "profile"
      : protectedPage && !session
        ? "login"
        : page;
  const nav = [
    ...navigation,
    ...(role === "admin"
      ? [
          { id: "rewards" as Page, label: "Kho phần thưởng", icon: Gift },
          {
            id: "users" as Page,
            label: "Người dùng & Phân quyền",
            icon: Shield,
          },
          {
            id: "media" as Page,
            label: "Thư viện ảnh/âm thanh",
            icon: Monitor,
          },
          { id: "stats" as Page, label: "Thống kê", icon: BarChart3 },
          { id: "audit" as Page, label: "Nhật ký quản trị", icon: Archive },
          { id: "backup" as Page, label: "Sao lưu & Khôi phục", icon: Archive },
        ]
      : []),
  ];
  return (
    <div className={"app-shell " + (compact ? "compact" : "")}>
      <a className="skip-link" href="#main">
        Bỏ qua điều hướng
      </a>
      {drawer && (
        <div className="drawer-shade" onClick={() => setDrawer(false)} />
      )}
      <aside className={"sidebar " + (drawer ? "open" : "")}>
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            go("overview");
          }}
        >
          <div className="brand-icon">
            <span>V</span>
            <Sparkles size={16} />
          </div>
          <div>
            <strong>GAME TIẾNG VIỆT</strong>
            <small>VÒNG QUAY MAY MẮN</small>
          </div>
        </a>
        <span className="side-label">KHÔNG GIAN SÁNG TẠO</span>
        <nav aria-label="Điều hướng chính">
          {nav.map((n) => (
            <button
              key={n.id}
              className={page === n.id ? "active" : ""}
              title={n.label}
              aria-label={n.label}
              onClick={() => go(n.id)}
            >
              <n.icon size={19} />
              <span>{n.label}</span>
              {page === n.id && <ChevronRight size={16} />}
            </button>
          ))}
        </nav>
        <div className="side-bottom">
          <button onClick={() => go("settings")}>
            <Settings size={18} />
            Cài đặt
          </button>
          <button onClick={() => go("guide")}>
            <HelpCircle size={18} />
            Hướng dẫn
          </button>
          <div className="side-tip">
            <Sparkles size={20} />
            <strong>
              Ý tưởng nhỏ.
              <br />
              Cuộc vui lớn.
            </strong>
            <p>Biến những con chữ quen thuộc thành thử thách bất ngờ.</p>
          </div>
          <button
            className="profile-chip"
            onClick={() => go(session ? "profile" : "login")}
          >
            <span className="avatar">
              <UserRound size={19} />
            </span>
            <div>
              <strong>
                {accountName}
              </strong>
              <small>
                {role === "admin"
                  ? "Quản trị viên"
                  : session
                    ? "Người dùng"
                    : "Đăng nhập để lưu nội dung"}
              </small>
            </div>
          </button>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumbs">
            <button
              className="menu-toggle"
              aria-label="Mở điều hướng"
              onClick={() => {
                if (window.innerWidth >= 1024) setCompact(!compact);
                else setDrawer(true);
              }}
            >
              <Menu />
            </button>
            <span>Không gian của bạn</span>
            <ChevronRight size={14} />
            <strong>
              {navigation.find((n) => n.id === page)?.label ||
                "Tài khoản & Hệ thống"}
            </strong>
          </div>
          <div className="actions">
            <span className={"connection " + (configured ? "" : "pending")}>
              <i />
              {configured ? "Đã cấu hình backend" : "Chờ kết nối Supabase"}
            </span>
            <button
              aria-label={dark ? "Chuyển sang sáng" : "Chuyển sang tối"}
              onClick={() => setDark(!dark)}
            >
              {dark ? <Sun size={19} /> : <Moon size={19} />}
            </button>
            {session ? (
              <button
                onClick={() =>
                  void client()
                    .auth.signOut()
                    .then(() => go("overview"))
                }
              >
                <LogOut size={17} />
                <span>Đăng xuất</span>
              </button>
            ) : (
              <Button kind="outline" onClick={() => go("login")}>
                <LogIn size={16} />
                Đăng nhập
              </Button>
            )}
          </div>
        </header>
        <main id="main">
          <div className="mobile-name">{NAME}</div>
          {!connected && (
            <div className="notice" role="alert">
              Mất kết nối mạng. Dữ liệu đã lưu vẫn ở server; kết nối lại để tiếp
              tục.
            </div>
          )}
          {toast && (
            <div className="toast" role="alert">
              <span>{toast}</span>
              <button aria-label="Đóng thông báo" onClick={() => setToast("")}>
                <X size={16} />
              </button>
            </div>
          )}
          {visiblePage === "overview" && (
            <>
              <PageTitle
                title={
                  session
                    ? "Hôm nay, mình chơi gì?"
                    : "Chào bạn, cùng tạo một cuộc vui!"
                }
                description="Ghép chữ thật hay. Quay quà thật vui. Kết nối mọi người theo cách của bạn."
              >
                <span className="date-chip">
                  TIẾNG VIỆT · NIỀM VUI KHÔNG GIỚI HẠN
                </span>
              </PageTitle>
              <section className="hero">
                <div className="hero-copy">
                  <span className="hero-kicker">
                    <Sparkles size={16} /> NƠI CON CHỮ BẮT ĐẦU CUỘC VUI
                  </span>
                  <h2>
                    Mỗi con chữ,
                    <br />
                    một <em>bất ngờ.</em>
                  </h2>
                  <p>
                    Tạo thử thách ghép chữ, mời bạn bè vào phòng chơi
                    <br className="desktop-only" /> và để vòng quay chọn điều
                    may mắn tiếp theo.
                  </p>
                  <div className="actions">
                    <Button kind="yellow" onClick={() => go("rooms")}>
                      <Play size={17} />
                      Tổ chức trò chơi
                      <ArrowUpRight size={17} />
                    </Button>
                    <Button kind="hero-outline" onClick={() => go("questions")}>
                      Tạo bộ câu hỏi
                    </Button>
                  </div>
                  <small>{NAME}</small>
                </div>
                <div
                  className="hero-art"
                  aria-label="Minh họa các ô chữ và vòng quay"
                >
                  <div className="orbit orbit-one" />
                  <div className="orbit orbit-two" />
                  <span className="art-spark">✦</span>
                  <div className="mini-wheel">
                    <div className="mini-hub">
                      <Gift size={28} />
                    </div>
                  </div>
                  <div className="floating-tiles">
                    {"TIẾNG".split("").map((c, i) => (
                      <span className="tile" key={i}>
                        {c}
                      </span>
                    ))}
                  </div>
                  <div className="floating-tiles lower">
                    {"VIỆT".split("").map((c, i) => (
                      <span className="tile" key={i}>
                        {c}
                      </span>
                    ))}
                  </div>
                  <span className="reward-float">
                    <Gift size={18} /> May mắn đang chờ!
                  </span>
                </div>
              </section>
              <div className="metrics">
                <Metric
                  icon={BookOpen}
                  title="Bộ câu hỏi của bạn"
                  value={session ? String(counts.sets) : "—"}
                  note={
                    session
                      ? "Được lưu trong tài khoản"
                      : "Đăng nhập để bắt đầu"
                  }
                />
                <Metric
                  icon={Users}
                  title="Phòng chơi đã tạo"
                  value={session ? String(counts.rooms) : "—"}
                  note="Kết nối bạn bè, đội và lớp"
                />
                <Metric
                  icon={Disc3}
                  title="Vòng quay của bạn"
                  value={session ? String(counts.wheels) : "—"}
                  note="Phần thưởng theo cách của bạn"
                />
                <Metric
                  icon={Palette}
                  title="Bảng phối sẵn có"
                  value={String(themes.length)}
                  note="Mặc định, xu hướng & sự kiện"
                />
              </div>
              <div className="section-title">
                <h2>Bắt đầu một điều thú vị</h2>
                <button onClick={() => go("guide")}>
                  Xem hướng dẫn <ArrowUpRight size={16} />
                </button>
              </div>
              <div className="activity-grid">
                <Activity
                  icon={BookOpen}
                  no="01"
                  title="Thử tài tiếng Việt"
                  text="Biến chữ cái quen thuộc thành những câu đố khiến cả phòng bật cười."
                  color="teal"
                  label="Tạo bộ câu hỏi"
                  onClick={() => go("questions")}
                />
                <Activity
                  icon={Users}
                  no="02"
                  title="Chơi vui cùng nhau"
                  text="Mời mọi người bằng mã phòng. MC điều khiển nhịp chơi và công bố đáp án."
                  color="navy"
                  label="Mở phòng chơi"
                  onClick={() => go("rooms")}
                />
                <Activity
                  icon={Gift}
                  no="03"
                  title="Quay là có bất ngờ"
                  text="Tùy chỉnh phần thưởng, xác suất và số lượng. Lưu từng khoảnh khắc may mắn."
                  color="gold"
                  label="Tạo vòng quay"
                  onClick={() => go("wheels")}
                />
              </div>
              <div className="overview-bottom">
                <Card className="sample-card">
                  <div>
                    <span className="eyebrow">Ô CHỮ MINH HỌA</span>
                    <h2>Nhìn quen mà không dễ!</h2>
                    <p>Mỗi chữ cái có dấu nằm gọn trong một ô riêng.</p>
                  </div>
                  <div className="tiles">
                    {["C", "Ậ", "V", "Ư", "B", "Ợ", "T"].map((c, i) => (
                      <span className="tile" key={i}>
                        {c}
                      </span>
                    ))}
                  </div>
                  <button onClick={() => go("questions")}>
                    Biên soạn thử thách của bạn <ArrowUpRight size={16} />
                  </button>
                </Card>
                <Card className="event-card">
                  <span className="eyebrow">SẮC MÀU CHO CUỘC VUI</span>
                  <div className="petal-decoration">✿</div>
                  <h2>
                    Rạng rỡ
                    <br />
                    tháng Mười
                  </h2>
                  <p>
                    Bảng phối 20/10 với teal và hồng champagne. Xem trước trước
                    khi áp dụng.
                  </p>
                  <Button kind="outline" onClick={() => go("themes")}>
                    Khám phá giao diện
                    <ArrowUpRight size={16} />
                  </Button>
                </Card>
              </div>
              <div className="onboarding">
                <CheckCircle2 size={20} />
                <p>
                  {configured
                    ? "Backend đã được khai báo. Đăng nhập để tạo nội dung; trạng thái kết nối được xác nhận khi thao tác thành công."
                    : "Mã nguồn đã sẵn sàng để kết nối. Cần Supabase để đăng nhập, lưu câu hỏi và tổ chức trò chơi thật."}
                </p>
                <button onClick={() => go("guide")}>
                  Hướng dẫn thiết lập →
                </button>
              </div>
            </>
          )}
          {visiblePage === "login" && <Auth notify={setToast} />}
          {visiblePage === "questions" && <Questions notify={setToast} />}
          {visiblePage === "rooms" && session && (
            <Rooms
              userId={session.user.id}
              notify={setToast}
              onActivity={setActive}
              onTheme={setRoomScope}
            />
          )}
          {visiblePage === "wheels" && (
            <Wheels notify={setToast} onActivity={setActive} />
          )}
          {visiblePage === "themes" && (
            <Themes
              current={baseTheme}
              onSelect={selectTheme}
              notify={setToast}
            />
          )}
          {visiblePage === "profile" && session && (
            <Profile
              userId={session.user.id}
              forceChange={mustChange}
              notify={setToast}
            />
          )}
          {visiblePage === "users" && <UsersAdmin notify={setToast} />}
          {visiblePage === "guide" && <Guide onClick={go} />}
          {visiblePage === "privacy" && <Privacy />}
          {visiblePage === "settings" && (
            <>
              <PageTitle title="Cài đặt hiển thị" />
              <Card>
                <h2>Trải nghiệm của bạn</h2>
                <div className="actions">
                  <Button kind="outline" onClick={() => setDark(!dark)}>
                    {dark ? "Chuyển giao diện sáng" : "Chuyển giao diện tối"}
                  </Button>
                  <Button kind="outline" onClick={() => go("themes")}>
                    Chọn bộ màu
                  </Button>
                </div>
                <p>
                  Hiệu ứng tự giảm theo tùy chọn “Reduce motion” của thiết bị.
                  Phiên bản này không phát âm thanh.
                </p>
                <p>
                  Logo cơ quan chưa có file khả dụng. Logo, hình nền tùy chỉnh
                  và tên thương hiệu chưa sẵn sàng.
                </p>
                <Button kind="subtle" onClick={() => go("privacy")}>
                  Quyền riêng tư & Xóa dữ liệu
                </Button>
              </Card>
            </>
          )}
          {visiblePage === "history" && <HistoryPage notify={setToast} />}
          {visiblePage === "audit" && <AuditPage notify={setToast} />}
          {visiblePage === "backup" && <BackupPage notify={setToast} />}
          {visiblePage === "stats" && (
            <Unavailable
              title="Thống kê"
              reason="Dashboard phân tích theo thời gian chưa sẵn sàng. Xem bảng điểm trong phòng và lịch sử vòng quay để lấy kết quả đã ghi nhận."
            />
          )}
          {visiblePage === "rewards" && (
            <Unavailable
              title="Kho phần thưởng"
              reason="Kho dùng chung chưa sẵn sàng. Bạn có thể quản lý phần thưởng và tồn kho trực tiếp trong từng vòng quay."
            />
          )}
          {visiblePage === "media" && (
            <Unavailable
              title="Thư viện ảnh/âm thanh"
              reason="Upload ảnh, âm thanh và kiểm tra nội dung file chưa sẵn sàng. Không có nút tải lên giả."
            />
          )}
        </main>
        <footer>
          <span>{NAME}</span>
          <button onClick={() => go("privacy")}>Quyền riêng tư</button>
          <span>Được tạo để chơi vui cùng nhau.</span>
        </footer>
      </div>
    </div>
  );
}
function Metric({
  icon: Icon,
  title,
  value,
  note,
}: {
  icon: LucideIcon;
  title: string;
  value: string;
  note: string;
}) {
  return (
    <Card className="metric">
      <span className="metric-icon">
        <Icon size={20} />
      </span>
      <p>{title}</p>
      <strong>{value}</strong>
      <small>{note}</small>
    </Card>
  );
}
function Activity({
  icon: Icon,
  no,
  title,
  text,
  color,
  label,
  onClick,
}: {
  icon: LucideIcon;
  no: string;
  title: string;
  text: string;
  color: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <Card className={"activity " + color}>
      <div className="activity-head">
        <span className="activity-icon">
          <Icon size={26} />
        </span>
        <b>{no}</b>
      </div>
      <h3>{title}</h3>
      <p>{text}</p>
      <button onClick={onClick}>
        {label}
        <ArrowUpRight size={18} />
      </button>
    </Card>
  );
}
function Guide({ onClick }: { onClick: (p: Page) => void }) {
  return (
    <>
      <PageTitle
        title="Hướng dẫn bắt đầu"
        description="Thiết lập một lần. Tạo cuộc vui theo cách của bạn."
      />
      <div className="two-columns">
        <Card>
          <h2>1. Kết nối dịch vụ</h2>
          <p>
            Tạo dự án Supabase, áp dụng hai migration theo thứ tự, triển khai
            hàm username-login. Điền URL dự án và publishable key vào biến Vite.
            Không đưa service-role key vào frontend.
          </p>
          <p>
            Tạo repository riêng game-tieng-viet-vong-quay, bật GitHub Pages với
            nguồn GitHub Actions. Cấu hình backend và kiểm thử trước khi bật
            biến ALLOW_PRODUCTION_DEPLOY.
          </p>
          <h2>2. Tạo tài khoản</h2>
          <p>
            Email cần xác minh. Google/Facebook chỉ hoạt động khi provider đã
            bật và callback đúng. Admin được tạo bằng script riêng, bắt buộc đổi
            mật khẩu; tác vụ quản trị vai trò cần MFA.
          </p>
          <Button kind="outline" onClick={() => onClick("login")}>
            Đến đăng nhập
          </Button>
        </Card>
        <Card>
          <h2>3. Tạo bộ câu hỏi</h2>
          <p>
            Tạo bộ → nhập đáp án → tạo ô chữ → kiểm tra chữ thiếu/thừa → đặt
            thời gian → lưu. Hai kiểu: ghép chữ hoặc ghép từ. Câu hỏi được lưu ở
            database.
          </p>
          <h2>4. Chơi trong phòng</h2>
          <p>
            MC tạo phòng, gửi mã cho người chơi đã đăng nhập. Chọn câu và bắt
            đầu. Người chơi chạm ô hoặc nhập đáp án. MC có thể dừng, tiếp tục,
            thêm giờ và công bố.
          </p>
          <h2>5. Vòng quay</h2>
          <p>
            Tạo vòng và ít nhất 2 phần thưởng. Chọn trọng số hoặc phần trăm; xem
            xác suất hiệu lực trước khi quay. Quay thử không ghi kết quả chính
            thức. Ô bằng nhau không phản ánh xác suất.
          </p>
        </Card>
      </div>
      <Card>
        <h2>Quy tắc và giới hạn</h2>
        <p>
          Chữ NFC, không phân biệt hoa/thường; bỏ dấu câu . , ! ? ; :. Ghép chữ
          bỏ khoảng trắng khi chấm, ghép từ gộp khoảng trắng. Đúng: điểm câu +
          thưởng tốc độ tối đa 50, gợi ý trừ 10. Một lần trả lời mỗi câu; cùng
          điểm cùng hạng.
        </p>
        <p>
          Theme lịch dùng giờ backend, kết thúc theo khoảng [bắt đầu, kết thúc).
          Nếu trùng, chọn ưu tiên lớn nhất, rồi mốc bắt đầu mới nhất, rồi ID
          tăng dần. Chờ câu hoặc vòng quay kết thúc mới áp dụng.
        </p>
        <p>
          Chưa sẵn sàng: khách ẩn danh, QR phòng, ảnh/âm thanh, chơi cá nhân tự
          động, một số màn quản trị nâng cao. Xem docs/STATUS.md trong mã nguồn
          để có trạng thái đầy đủ.
        </p>
      </Card>
    </>
  );
}
function Privacy() {
  return (
    <>
      <PageTitle title="Quyền riêng tư & Xóa dữ liệu" />
      <Card>
        <h2>Dữ liệu được sử dụng</h2>
        <p>
          Tài khoản Auth, tên hiển thị, câu hỏi, phòng chơi, điểm và lịch sử
          nhận quà được lưu trên Supabase của chủ website. Không sử dụng quyền
          đọc bài đăng, bạn bè hay tin nhắn mạng xã hội.
        </p>
        <h2>Phiên đăng nhập</h2>
        <p>
          Ứng dụng SPA lưu phiên Supabase trong localStorage để duy trì đăng
          nhập. Chỉ dùng thiết bị tin cậy, đăng xuất trên máy dùng chung. Phiên
          có thể bị đọc nếu ứng dụng có XSS; không dùng HTML do người dùng cung
          cấp. Không ghi token vào log.
        </p>
        <h2>Xóa tài khoản</h2>
        <p>
          Gửi yêu cầu trong Hồ sơ. Quản trị viên cần xác minh và xử lý xóa tài
          khoản, dữ liệu phụ thuộc và Storage theo hướng dẫn. Quy trình tự động
          chưa sẵn sàng. Chủ website cần công bố email liên hệ và thời hạn lưu
          trữ trước khi vận hành thật.
        </p>
      </Card>
    </>
  );
}
function HistoryPage({ notify }: { notify: (s: string) => void }) {
  const [rows, setRows] = useState<
    { id: string; score: number; correct: boolean; submitted_at: string }[]
  >([]);
  useEffect(() => {
    void client()
      .auth.getUser()
      .then(async ({ data }) => {
        const { data: rows, error } = await client()
          .from("submissions")
          .select("*")
          .eq("user_id", data.user?.id)
          .order("submitted_at", { ascending: false })
          .limit(100);
        if (error) notify(error.message);
        else setRows(rows);
      });
  }, []);
  return (
    <>
      <PageTitle
        title="Lịch sử & Thành tích"
        description="100 câu trả lời gần nhất của bạn."
      />
      <Card>
        <h2>
          Tổng điểm trong danh sách: {rows.reduce((s, r) => s + r.score, 0)}
        </h2>
        {rows.map((r) => (
          <div className="history-row" key={r.id}>
            <strong>{r.correct ? "✓ Đúng" : "× Chưa đúng"}</strong>
            <span>{r.score} điểm</span>
            <span>
              {new Date(r.submitted_at).toLocaleString("vi-VN", {
                timeZone: "Asia/Ho_Chi_Minh",
              })}
            </span>
          </div>
        ))}
        {!rows.length && <p>Chưa có câu trả lời.</p>}
        <small>Huy hiệu và hệ thống thành tích nâng cao chưa sẵn sàng.</small>
      </Card>
    </>
  );
}
function AuditPage({ notify }: { notify: (s: string) => void }) {
  const [rows, setRows] = useState<
    { id: number; action: string; created_at: string }[]
  >([]);
  useEffect(() => {
    void client()
      .from("audit_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100)
      .then(({ data, error }) => {
        if (error) notify(error.message);
        else setRows(data);
      });
  }, []);
  return (
    <>
      <PageTitle title="Nhật ký quản trị" />
      <Card>
        {rows.map((r) => (
          <div className="history-row" key={r.id}>
            <strong>{r.action}</strong>
            <span>
              {new Date(r.created_at).toLocaleString("vi-VN", {
                timeZone: "Asia/Ho_Chi_Minh",
              })}
            </span>
          </div>
        ))}
        {!rows.length && (
          <p>Chưa có nhật ký khả dụng. Cần admin và phiên MFA.</p>
        )}
        <small>
          Hiện ghi bootstrap và đổi vai trò; nhật ký toàn bộ thao tác nội dung
          chưa sẵn sàng.
        </small>
      </Card>
    </>
  );
}
function BackupPage({ notify }: { notify: (s: string) => void }) {
  async function exportOwned() {
    try {
      const user = (await client().auth.getUser()).data.user;
      if (!user) throw new Error("Cần đăng nhập.");
      const results = await Promise.all(
        ["question_sets", "wheels", "themes", "event_schedules"].map((t) =>
          client().from(t).select("*").eq("owner_id", user.id),
        ),
      );
      for (const r of results) if (r.error) throw r.error;
      download(
        "noi-dung-tai-khoan.json",
        JSON.stringify(
          Object.fromEntries(
            ["question_sets", "wheels", "themes", "event_schedules"].map(
              (k, i) => [k, results[i].data],
            ),
          ),
          null,
          2,
        ),
      );
      notify(
        "Đã xuất danh mục tài khoản. Đây không phải backup đầy đủ database.",
      );
    } catch (e) {
      notify(errorText(e));
    }
  }
  return (
    <>
      <PageTitle title="Sao lưu & Khôi phục" />
      <Card>
        <h2>Xuất danh mục tài khoản</h2>
        <p>
          Xuất metadata bộ câu hỏi, vòng quay, theme và lịch sự kiện. Câu
          hỏi/đáp án cần xuất trong Bộ câu hỏi; quà và lượt quay cần xuất trong
          Vòng quay.
        </p>
        <Button onClick={() => void exportOwned()}>Xuất danh mục</Button>
        <h2>Sao lưu toàn hệ thống</h2>
        <p>
          Dùng scripts/backup.mjs từ môi trường tin cậy, mã hóa age và lưu ở kho
          riêng. scripts/restore.mjs kiểm tra checksum rồi chỉ khôi phục vào
          database kiểm thử.
        </p>
        <p>
          Chưa có backup thật hoặc restore thật vì chưa kết nối Supabase. Khôi
          phục tự động từ dashboard chưa sẵn sàng.
        </p>
      </Card>
    </>
  );
}
