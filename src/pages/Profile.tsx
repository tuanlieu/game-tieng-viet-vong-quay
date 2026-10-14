import { useEffect, useState } from "react";
import { Button, Card, Field, PageTitle, errorText } from "../components/UI";
import { client, rpc } from "../lib/api";
export default function Profile({
  userId,
  forceChange = false,
  notify,
}: {
  userId: string;
  forceChange?: boolean;
  notify: (s: string) => void;
}) {
  const [name, setName] = useState(""),
    [password, setPassword] = useState(""),
    [qr, setQr] = useState(""),
    [factor, setFactor] = useState(""),
    [code, setCode] = useState("");
  useEffect(() => {
    void client()
      .from("profiles")
      .select("display_name")
      .eq("id", userId)
      .single()
      .then(({ data }) => setName(data?.display_name || ""));
  }, [userId]);
  async function saveName() {
    try {
      const { error } = await client()
        .from("profiles")
        .update({ display_name: name })
        .eq("id", userId);
      if (error) throw error;
      notify("Đã cập nhật tên.");
    } catch (e) {
      notify(errorText(e));
    }
  }
  async function changePassword() {
    try {
      const { error } = await client().auth.updateUser({ password });
      if (error) throw error;
      setPassword("");
      notify("Đã đổi mật khẩu. Tải lại trang để cập nhật quyền.");
      if (forceChange) location.reload();
    } catch (e) {
      notify(errorText(e));
    }
  }
  async function enroll() {
    try {
      const { data, error } = await client().auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "Game Tiếng Việt",
      });
      if (error) throw error;
      setQr(data.totp.qr_code);
      setFactor(data.id);
    } catch (e) {
      notify(errorText(e));
    }
  }
  async function verify() {
    try {
      let id = factor;
      if (!id) {
        const { data, error } = await client().auth.mfa.listFactors();
        if (error) throw error;
        id = data.totp.find((f) => f.status === "verified")?.id || "";
      }
      if (!id) throw new Error("Chưa có thiết bị MFA.");
      const { error } = await client().auth.mfa.challengeAndVerify({
        factorId: id,
        code,
      });
      if (error) throw error;
      setQr("");
      setCode("");
      notify("MFA đã xác thực.");
    } catch (e) {
      notify(errorText(e));
    }
  }
  return (
    <>
      <PageTitle
        title={forceChange ? "Đổi mật khẩu ban đầu" : "Hồ sơ & Bảo mật"}
        description="Quản lý thông tin cá nhân và bảo vệ tài khoản."
      />
      {forceChange && (
        <div className="notice">
          Tài khoản khởi tạo chưa được phép tạo nội dung. Đổi mật khẩu để mở
          quyền sử dụng.
        </div>
      )}
      <div className="two-columns">
        <Card>
          <h2>Thông tin của bạn</h2>
          <Field label="Tên hiển thị">
            <input
              value={name}
              maxLength={80}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <Button onClick={() => void saveName()}>Lưu thông tin</Button>
          <hr />
          <h2>Đổi mật khẩu</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void changePassword();
            }}
          >
            <Field label="Mật khẩu mới (ít nhất 12 ký tự)">
              <input
                required
                type="password"
                minLength={12}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
            <Button type="submit">Đổi mật khẩu</Button>
          </form>
        </Card>
        <Card>
          <h2>Xác thực hai bước (MFA)</h2>
          <p>
            Cần MFA để quản trị vai trò và đọc nhật ký. Sử dụng ứng dụng
            Authenticator để lấy mã 6 chữ số.
          </p>
          <Button kind="outline" onClick={() => void enroll()}>
            Thiết lập Authenticator
          </Button>
          {qr && (
            <img
              className="mfa-qr"
              src={
                qr.startsWith("data:")
                  ? qr
                  : "data:image/svg+xml;utf8," + encodeURIComponent(qr)
              }
              alt="Mã QR thiết lập MFA riêng tư"
            />
          )}
          <Field label="Mã xác thực">
            <input
              value={code}
              inputMode="numeric"
              maxLength={6}
              onChange={(e) => setCode(e.target.value)}
            />
          </Field>
          <Button disabled={code.length !== 6} onClick={() => void verify()}>
            Xác thực MFA
          </Button>
          <hr />
          <h2>Yêu cầu xóa tài khoản</h2>
          <p>
            Yêu cầu được lưu để quản trị viên xử lý. Chưa tự động xóa tài khoản
            Auth và file liên quan.
          </p>
          <Button
            kind="danger"
            onClick={() => {
              if (confirm("Gửi yêu cầu xóa tài khoản?"))
                void client()
                  .from("deletion_requests")
                  .upsert({ user_id: userId })
                  .then(({ error }) =>
                    notify(
                      error
                        ? error.message
                        : "Đã ghi nhận yêu cầu xóa tài khoản.",
                    ),
                  );
            }}
          >
            Gửi yêu cầu xóa
          </Button>
        </Card>
      </div>
    </>
  );
}
export function UsersAdmin({ notify }: { notify: (s: string) => void }) {
  const [users, setUsers] = useState<
    { id: string; display_name: string; role: string }[]
  >([]);
  async function load() {
    try {
      setUsers(await rpc("admin_users"));
    } catch (e) {
      notify(errorText(e));
    }
  }
  useEffect(() => {
    void load();
  }, []);
  return (
    <>
      <PageTitle
        title="Người dùng & Phân quyền"
        description="Chỉ admin đã xác thực MFA mới được thay đổi vai trò."
      />
      <Card>
        {users.map((u) => (
          <div className="history-row" key={u.id}>
            <strong>{u.display_name}</strong>
            <span>{u.role}</span>
            <Button
              kind="outline"
              onClick={() => {
                if (confirm(`Chuyển vai trò của ${u.display_name}?`))
                  void rpc("admin_set_role", {
                    p_user: u.id,
                    p_role: u.role === "admin" ? "user" : "admin",
                  })
                    .then(load)
                    .catch((e) => notify(errorText(e)));
              }}
            >
              Đổi vai trò
            </Button>
          </div>
        ))}
        {!users.length && (
          <p>Chưa tải được danh sách. Xác thực MFA trong Hồ sơ rồi thử lại.</p>
        )}
        <Button kind="outline" onClick={() => void load()}>
          Tải lại danh sách
        </Button>
      </Card>
    </>
  );
}
