import { createClient } from "@supabase/supabase-js";
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const configured =
  !!url && !!key && !url.includes("YOUR_") && !key.includes("YOUR_");
export const db = configured
  ? createClient(url, key, {
      auth: {
        flowType: "pkce",
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;
export function client() {
  if (!db) throw new Error("Chưa kết nối Supabase. Xem Hướng dẫn để cấu hình.");
  return db;
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
};
export type Prize = {
  id: string;
  wheel_id: string;
  label: string;
  color: string;
  weight: number;
  stock: number | null;
  enabled: boolean;
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
  server_now: string;
  revealed?: { answer: string; explanation: string };
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
