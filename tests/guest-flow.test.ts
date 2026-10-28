import { afterEach, describe, expect, it, vi } from "vitest";
import { establishGuestSession, invitationCodeFromHash } from "../src/lib/api";

const session = (id: string) => ({ user: { id, is_anonymous: true } }) as never;

function authStub(existing: unknown = null) {
  return {
    getSession: vi.fn().mockResolvedValue({ data: { session: existing }, error: null }),
    signInAnonymously: vi.fn().mockResolvedValue({ data: { session: session("guest-new") }, error: null }),
  };
}

describe("guest invitation and anonymous session", () => {
  afterEach(() => vi.restoreAllMocks());

  it("only accepts a complete invitation hash and normalises its code", () => {
    expect(invitationCodeFromHash("#join=ab12cd34")).toBe("AB12CD34");
    expect(invitationCodeFromHash("#join=ABC")).toBe("");
    expect(invitationCodeFromHash("#access_token=secret")).toBe("");
    expect(invitationCodeFromHash("#join=ROOM1&x=1")).toBe("");
  });

  it("reuses the same anonymous browser session after reload", async () => {
    const auth = authStub(session("guest-saved"));
    const result = await establishGuestSession({ auth } as never, "  Lan  ");
    expect(result).toEqual(session("guest-saved"));
    expect(auth.signInAnonymously).not.toHaveBeenCalled();
  });

  it("creates independent identities when browser storage has no session", async () => {
    const first = authStub();
    const second = authStub();
    await establishGuestSession({ auth: first } as never, "Người chơi A");
    await establishGuestSession({ auth: second } as never, "Người chơi B");
    expect(first.signInAnonymously).toHaveBeenCalledWith({ options: { data: { display_name: "Người chơi A" } } });
    expect(second.signInAnonymously).toHaveBeenCalledWith({ options: { data: { display_name: "Người chơi B" } } });
  });

  it("rejects invalid guest names without calling Supabase", async () => {
    const auth = authStub();
    await expect(establishGuestSession({ auth } as never, " ")).rejects.toThrow("2–30");
    expect(auth.getSession).not.toHaveBeenCalled();
  });
});
