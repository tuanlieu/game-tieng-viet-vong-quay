import { createClient } from "@supabase/supabase-js";
const {
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  ADMIN_EMAIL,
  ADMIN_INITIAL_PASSWORD,
} = process.env;
if (
  !SUPABASE_URL ||
  !SUPABASE_SERVICE_ROLE_KEY ||
  !ADMIN_EMAIL ||
  !ADMIN_INITIAL_PASSWORD
)
  throw new Error("Thiếu biến môi trường bootstrap.");
if (ADMIN_INITIAL_PASSWORD.length < 12)
  throw new Error("Mật khẩu ban đầu cần ít nhất 12 ký tự.");
const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const { data, error } = await db.auth.admin.createUser({
  email: ADMIN_EMAIL,
  password: ADMIN_INITIAL_PASSWORD,
  email_confirm: true,
  user_metadata: { display_name: "Quản trị viên" },
});
if (error)
  throw new Error("Không tạo được admin. Kiểm tra dự án và tài khoản trùng.");
const { error: roleError } = await db.rpc("bootstrap_admin", {
  p_user: data.user.id,
  p_email: ADMIN_EMAIL,
});
if (roleError) {
  await db.auth.admin.deleteUser(data.user.id);
  throw new Error("Bootstrap thất bại; đã yêu cầu xóa tài khoản vừa tạo.");
}
console.log(
  "Đã tạo admin tamit. Bắt buộc đổi mật khẩu khi đăng nhập. Không in thông tin bảo mật.",
);
