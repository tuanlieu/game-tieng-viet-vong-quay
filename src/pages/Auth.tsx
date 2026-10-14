import { useState } from "react";
import { Button, Field, errorText } from "../components/UI";
import { client, configured, callbackUrl } from "../lib/api";
export default function Auth({ notify }: { notify: (text: string) => void }) {
  const [mode, setMode] = useState<"login" | "register" | "reset">("login"),
    [identity, setIdentity] = useState(""),
    [password, setPassword] = useState(""),
    [name, setName] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit() {
    setBusy(true);
    try {
      const db = client();
      if (mode === "register") {
        const { error } = await db.auth.signUp({
          email: identity,
          password,
          options: {
            data: { display_name: name || "Người chơi" },
            emailRedirectTo: callbackUrl(),
          },
        });
        if (error) throw error;
        notify("Kiểm tra email để xác minh tài khoản.");
      } else if (mode === "reset") {
        const { error } = await db.auth.resetPasswordForEmail(identity, {
          redirectTo: callbackUrl(),
        });
        if (error) throw error;
        notify("Nếu email hợp lệ, bạn sẽ nhận được liên kết đặt lại mật khẩu.");
      } else if (identity.includes("@")) {
        const { error } = await db.auth.signInWithPassword({
          email: identity,
          password,
        });
        if (error) throw error;
      } else {
        const { data, error } = await db.functions.invoke("username-login", {
          body: { username: identity, password },
        });
        if (error || data?.error)
          throw new Error(
            data?.error ||
              "Không thể đăng nhập. Kiểm tra cấu hình username-login.",
          );
        const { error: sessionError } = await db.auth.setSession(data);
        if (sessionError) throw sessionError;
      }
    } catch (e) {
      notify(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  async function oauth(provider: "google" | "facebook") {
    try {
      const { error } = await client().auth.signInWithOAuth({
        provider,
        options: { redirectTo: callbackUrl() },
      });
      if (error) throw error;
    } catch (e) {
      notify(errorText(e));
    }
  }
  return (
    <div className="auth-layout">
      <div className="auth-story">
        <span className="eyebrow">MỖI CON CHỮ, MỘT NIỀM VUI</span>
        <h1>
          Chơi cùng nhau.
          <br />
          Kết nối bằng
          <br />
          <em>tiếng Việt.</em>
        </h1>
        <p>Game Tiếng Việt - Vòng Quay May Mắn</p>
        <div className="tiles decorative">
          {"TIẾNGVIỆT".split("").map((t, i) => (
            <span className="tile" key={i}>
              {t}
            </span>
          ))}
        </div>
      </div>
      <section className="card auth-card">
        <h2>
          {mode === "login"
            ? "Chào mừng bạn trở lại"
            : mode === "register"
              ? "Tạo tài khoản của bạn"
              : "Lấy lại mật khẩu"}
        </h2>
        <p>Lưu bộ câu hỏi, tổ chức phòng chơi và giữ những khoảnh khắc vui.</p>
        {!configured && (
          <div className="notice">
            Chưa kết nối Supabase. Các chức năng tài khoản sẽ mở sau khi cấu
            hình backend.
          </div>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          {mode === "register" && (
            <Field label="Tên hiển thị">
              <input
                required
                maxLength={80}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>
          )}
          <Field
            label={mode === "login" ? "Email hoặc tên đăng nhập" : "Email"}
          >
            <input
              required
              autoComplete="username"
              type={mode === "login" ? "text" : "email"}
              value={identity}
              onChange={(e) => setIdentity(e.target.value)}
            />
          </Field>
          {mode !== "reset" && (
            <Field label="Mật khẩu">
              <input
                type="password"
                required
                minLength={mode === "register" ? 12 : 1}
                autoComplete={
                  mode === "register" ? "new-password" : "current-password"
                }
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
          )}
          <Button type="submit" disabled={!configured || busy}>
            {busy
              ? "Đang xử lý…"
              : mode === "login"
                ? "Đăng nhập"
                : mode === "register"
                  ? "Đăng ký"
                  : "Gửi liên kết"}
          </Button>
        </form>
        <div className="divider">hoặc đăng nhập với</div>
        <div className="actions">
          <Button
            kind="outline"
            disabled={
              !configured || import.meta.env.VITE_GOOGLE_ENABLED !== "true"
            }
            onClick={() => void oauth("google")}
          >
            Google
          </Button>
          <Button
            kind="outline"
            disabled={
              !configured || import.meta.env.VITE_FACEBOOK_ENABLED !== "true"
            }
            onClick={() => void oauth("facebook")}
          >
            Facebook
          </Button>
        </div>
        <small>Nút mạng xã hội mở khi nhà cung cấp đã được cấu hình.</small>
        <div className="auth-links">
          <button
            onClick={() => setMode(mode === "register" ? "login" : "register")}
          >
            {mode === "register"
              ? "Đã có tài khoản? Đăng nhập"
              : "Tạo tài khoản mới"}
          </button>
          <button onClick={() => setMode(mode === "reset" ? "login" : "reset")}>
            {mode === "reset" ? "Quay lại đăng nhập" : "Quên mật khẩu?"}
          </button>
        </div>
      </section>
    </div>
  );
}
