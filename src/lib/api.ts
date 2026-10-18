import { createClient } from "@supabase/supabase-js";
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const configured =
  !!url && !!key && !url.includes("YOUR_") && !key.includes("YOUR_");
export const db = configured
  ? createClient(url, key, {
      auth: {
        // GitHub Pages is a browser-only app. The implicit flow puts the
        // session in the confirmation redirect, so email links opened from
        // Gmail/Safari can complete without the PKCE verifier from the tab
        // where the account was created.
        flowType: "implicit",
        persistSession: true,
        autoRefreshToken: true,
        // Consume the returned fragment explicitly in App.tsx. This is more
        // reliable when a confirmation link opens in Gmail/Safari.
        detectSessionInUrl: false,
      },
    })
  : null;
const AUTH_OPERATION_TIMEOUT_MS = 8000;

function withAuthTimeout<T>(operation: Promise<T>, message: string) {
  return Promise.race<T>([
    operation,
    new Promise<T>((_, reject) => {
      window.setTimeout(() => reject(new Error(message)), AUTH_OPERATION_TIMEOUT_MS);
    }),
  ]);
}
export function client() {
  if (!db) throw new Error("Chưa kết nối Supabase. Xem Hướng dẫn để cấu hình.");
  return db;
}

/**
 * Give a walk-in player a Supabase anonymous session.  This is not an
 * account: it needs no email or password, but gives the database a safe,
 * per-browser identity so answers and scores cannot overwrite each other.
 */
export async function startGuestSession(displayName: string) {
  const cleanName = displayName.trim();
  if (cleanName.length < 2 || cleanName.length > 30)
    throw new Error("Nhập tên người chơi hoặc tên đội (2–30 ký tự).");
  const supabase = client();
  // A stale WebView storage lock must not prevent a new player from joining.
  // If the read times out, continue with anonymous sign-in instead.
  try {
    const { data: existing, error: existingError } = await withAuthTimeout(
      supabase.auth.getSession(),
      "Không thể đọc phiên cũ trên trình duyệt này.",
    );
    if (existingError) throw existingError;
    if (existing.session) return existing.session;
  } catch (error) {
    if (!(error instanceof Error) || error.message !== "Không thể đọc phiên cũ trên trình duyệt này.") {
      throw error;
    }
  }
  const { data, error } = await withAuthTimeout(
    supabase.auth.signInAnonymously({
      options: { data: { display_name: cleanName } },
    }),
    "Không thể tạo phiên khách. Hãy tải lại trang hoặc mở bằng Safari/Chrome.",
  );
  if (error) throw error;
  if (!data.session) throw new Error("Không thể tạo phiên khách. Hãy thử lại.");
  return data.session;
}

/** Store a session returned by OAuth or an email-confirmation link. */
export async function consumeAuthCallback() {
  if (!db || typeof window === "undefined") return;
  const params = new URLSearchParams(window.location.hash.slice(1));
  const access_token = params.get("access_token");
  const refresh_token = params.get("refresh_token");
  if (!access_token || !refresh_token) return;
  const { error } = await db.auth.setSession({ access_token, refresh_token });
  if (error) throw error;
  // Never keep session credentials in the visible URL/history.
  window.history.replaceState({}, document.title, window.location.pathname);
}
export async function rpc<T>(
  name: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  const { data, error } = await client().rpc(name, args);
  if (error) throw new Error(error.message);
  return data as T;
}
export const callbackUrl = () => location.origin + import.meta.env.BASE_URL;
export type SetRecord = {
  id: string;
  title: string;
  description: string;
  visibility: string;
  owner_id: string;
  created_at: string;
};
export type Question = {
  id: string;
  set_id: string;
  title: string;
  tiles: string[];
  mode: "letters" | "words";
  duration: number;
  points: number;
  position: number;
  ignore_accents: boolean;
  hint: string;
  question_type?: "vua_tieng_viet" | "duoi_hinh_bat_chu";
  image_url?: string | null;
};
export type Prize = {
  id: string;
  wheel_id: string;
  label: string;
  color: string;
  weight: number;
  stock: number | null;
  enabled: boolean;
  reward_kind: "gift" | "cash";
  cash_value: number;
};
export type Wheel = {
  id: string;
  title: string;
  owner_id: string;
  duration: number;
  probability_mode: "weights" | "percent";
};
export type Room = {
  id: string;
  code: string;
  title: string;
  owner_id: string;
  set_id: string;
  status: string;
  locked: boolean;
  max_members: number;
  theme_id: string | null;
  late_join_enabled: boolean;
  reward_fastest_enabled: boolean;
  reward_wheel_id: string | null;
};
export type Run = {
  id: string;
  room_id: string;
  question_id: string;
  state: string;
  deadline: string | null;
  remaining: number;
  duration: number;
  tiles: string[];
  title: string;
  mode: "letters" | "words";
  hint: string;
  question_type?: "vua_tieng_viet" | "duoi_hinh_bat_chu";
  image_url?: string | null;
  server_now: string;
  revealed?: { answer: string; explanation: string };
  can_answer?: boolean;
};
export type PlayMember = {
  user_id: string;
  display_name: string;
  team_name: string | null;
  last_seen_at: string;
  score: number;
};
export type MySubmission = {
  submitted: boolean;
  answer: string;
  correct: boolean | null;
  score: number | null;
};
export type RoomReward = {
  id: string;
  run_id: string;
  winner: string;
  state: "available" | "spun" | "void";
  mine: boolean;
  label: string | null;
  color: string | null;
};
export type RewardStatus = {
  enabled: boolean;
  available_count: number;
  wheel: {
    id: string;
    title: string;
    items: Array<{
      id: string;
      label: string;
      color: string;
      remaining: number | null;
      position: number;
      reward_kind: "gift" | "cash";
      cash_value: number;
    }>;
  } | null;
  history: Array<{
    id: string;
    state: "available" | "spun" | "void";
    label: string | null;
    color: string | null;
    awarded_at: string;
    spun_at: string | null;
  }>;
};
export type RewardTotals = {
  player: { gifts: number; cash: number };
  host: { gifts: number; cash: number } | null;
};
export type PlayState = {
  run: Run | null;
  members: PlayMember[];
  my_submission: MySubmission | null;
  reward: RoomReward | null;
  reward_status: RewardStatus;
  reward_totals: RewardTotals;
};
export async function listSets() {
  const { data, error } = await client()
    .from("question_sets")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as SetRecord[];
}
export function download(
  name: string,
  contents: string,
  type = "application/json",
) {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
