import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
const owner = "11111111-1111-4111-8111-111111111111",
  player = "22222222-2222-4222-8222-222222222222",
  outsider = "33333333-3333-4333-8333-333333333333";
let db: PGlite,
  setId: string,
  questionId: string,
  roomId: string,
  runId: string,
  wheelId: string;
async function as(id: string, sql: string, args: unknown[] = []) {
  await db.exec(
    `reset role;select set_config('request.jwt.claim.sub','${id}',false);set role authenticated;`,
  );
  return db.query(sql, args);
}
async function root(sql: string, args: unknown[] = []) {
  await db.exec("reset role");
  return db.query(sql, args);
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema extensions;
 create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}',encrypted_password text);
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 create function auth.jwt() returns jsonb language sql stable as $$ select jsonb_build_object('aal',coalesce(nullif(current_setting('request.jwt.claim.aal',true),''),'aal1')) $$;
 grant usage on schema auth to authenticated;grant execute on all functions in schema auth to authenticated;
 create publication supabase_realtime;
 -- Test-only pgcrypto shim: production uses pgcrypto CSPRNG. This validates SQL logic, not cryptographic entropy.
 create function extensions.gen_random_bytes(n integer) returns bytea language sql as $$ select decode(repeat('40',n),'hex') $$;`);
  const core = readFileSync(
    new URL("../supabase/migrations/202610140001_core.sql", import.meta.url),
    "utf8",
  ).replace(
    "create extension if not exists pgcrypto with schema extensions;",
    "",
  );
  await db.exec(core);
  await db.exec(
    readFileSync(
      new URL(
        "../supabase/migrations/202610140002_security.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await db.exec(
    readFileSync(
      new URL("../supabase/migrations/202610150001_guest_players.sql", import.meta.url),
      "utf8",
    ),
  );
  await db.exec(
    readFileSync(
      new URL("../supabase/migrations/202610150002_room_rewards_and_secure_play.sql", import.meta.url),
      "utf8",
    ),
  );
  await db.exec(
    readFileSync(
      new URL("../supabase/migrations/202610150003_room_config_and_question_bulk.sql", import.meta.url),
      "utf8",
    ),
  );
  await db.exec(
    readFileSync(
      new URL("../supabase/migrations/202610150004_reward_inventory_snapshot.sql", import.meta.url),
      "utf8",
    ),
  );
  await root("insert into auth.users(id) values($1),($2),($3)", [
    owner,
    player,
    outsider,
  ]);
  const set = await as(
    owner,
    "insert into public.question_sets(title) values('Kiểm thử') returning id",
  );
  setId = String(set.rows[0].id);
  const q = await as(
    owner,
    "select public.save_question($1,null,'Ghép chữ',array['c','ậ','v','ư','b','ợ','t'],'vượt bậc','letters',60,100,'Gợi ý') as id",
    [setId],
  );
  questionId = String(q.rows[0].id);
  const room = await as(
    owner,
    "insert into public.rooms(set_id,title) values($1,'Phòng kiểm thử') returning id,code",
    [setId],
  );
  roomId = String(room.rows[0].id);
  await as(player, "select public.join_room($1,$2)", [room.rows[0].code, "Người chơi"]);
  const run = await as(
    owner,
    "select public.control_run($1,'start',$2) as id",
    [roomId, questionId],
  );
  runId = String(run.rows[0].id);
  const wheel = await as(
    owner,
    "insert into public.wheels(title) values('Quà cuối') returning id",
  );
  wheelId = String(wheel.rows[0].id);
  await as(
    owner,
    "insert into public.prizes(wheel_id,label,weight,stock) values($1,'Quà',1,1),($1,'Tắt',0,0)",
    [wheelId],
  );
}, 60000);
afterAll(async () => {
  await db?.close();
});
describe("SQL thực thi trong PostgreSQL PGlite (Auth/Realtime giả lập)", () => {
  it("người lạ không đọc bộ riêng hay phòng", async () => {
    expect(
      (
        await as(outsider, "select * from public.question_sets where id=$1", [
          setId,
        ])
      ).rows,
    ).toHaveLength(0);
    expect(
      (await as(outsider, "select * from public.rooms where id=$1", [roomId]))
        .rows,
    ).toHaveLength(0);
  });
  it("người chơi không đọc câu thô hoặc đáp án", async () => {
    expect(
      (
        await as(player, "select * from public.questions where id=$1", [
          questionId,
        ])
      ).rows,
    ).toHaveLength(0);
    await expect(as(player, "select * from private.answers")).rejects.toThrow();
    const r = await as(player, "select public.current_run($1) as result", [
      roomId,
    ]);
    expect(r.rows[0].result).not.toHaveProperty("revealed");
    expect(r.rows[0].result).toHaveProperty("hint", "");
    await expect(
      as(player, "select public.author_answers($1)", [setId]),
    ).rejects.toThrow();
  });
  it("không tự nâng vai trò hay sửa bộ người khác", async () => {
    await expect(
      as(
        player,
        "update private.user_roles set role='admin' where user_id=$1",
        [player],
      ),
    ).rejects.toThrow();
    expect(
      (
        await as(
          player,
          "update public.question_sets set title='Xâm nhập' where id=$1 returning id",
          [setId],
        )
      ).rows,
    ).toHaveLength(0);
    await expect(
      as(player, "select public.control_run($1,'reveal')", [roomId]),
    ).rejects.toThrow();
  });
  it("chữ thiếu/lặp bị từ chối ở backend", async () => {
    await expect(
      as(
        owner,
        "select public.save_question($1,null,'x',array['a','b'],'aba','letters',60,100)",
        [setId],
      ),
    ).rejects.toThrow("không khớp");
  });
  it("tạm dừng khóa nộp, tiếp tục khôi phục hạn giờ", async () => {
    await as(owner, "select public.control_run($1,'pause')", [roomId]);
    await expect(
      as(player, "select public.submit_answer($1,$2)", [runId, "vượt bậc"]),
    ).rejects.toThrow("tạm dừng");
    await as(owner, "select public.control_run($1,'resume')", [roomId]);
  });
  it("gợi ý trừ điểm; Unicode; một câu chỉ ghi một lần", async () => {
    await as(player, "select public.use_hint($1)", [runId]);
    const s = await as(player, "select public.submit_answer($1,$2) as result", [
      runId,
      "VƯỢT BẬC",
    ]);
    expect(s.rows[0].result).toMatchObject({ correct: true });
    expect((s.rows[0].result as { score: number }).score).toBeLessThanOrEqual(
      140,
    );
    const second = await as(
      player,
      "select public.submit_answer($1,$2) as result",
      [runId, "sai"],
    );
    expect(second.rows[0].result).toEqual(s.rows[0].result);
  });
  it("người vào muộn do DB chặn ở câu đang mở", async () => {
    const code = (
      await root("select code from public.rooms where id=$1", [roomId])
    ).rows[0].code;
    await as(outsider, "select public.join_room($1,$2)", [code, "Người mới"]);
    await root(
      "update public.runs set deadline=clock_timestamp()-interval '1 second' where id=$1",
      [runId],
    );
    await expect(
      as(outsider, "select public.submit_answer($1,$2)", [runId, "vượt bậc"]),
    ).rejects.toThrow("chưa tham gia câu này");
  });
  it("công bố mới trả đáp án", async () => {
    await as(owner, "select public.control_run($1,'reveal')", [roomId]);
    const r = await as(player, "select public.current_run($1) as result", [
      roomId,
    ]);
    expect(r.rows[0].result).toHaveProperty("revealed.answer", "vượt bậc");
  });
  it("thưởng được đổi giữa các câu, cấp đúng một lượt và quay lặp không đổi kết quả", async () => {
    const configuredWheel = await as(
      owner,
      "insert into public.wheels(title) values('Vòng thưởng phòng') returning id",
    );
    const configuredWheelId = String(configuredWheel.rows[0].id);
    await as(
      owner,
      "insert into public.prizes(wheel_id,label,weight,stock) values($1,'Huy hiệu',1,5),($1,'Bút mực',1,5)",
      [configuredWheelId],
    );
    await as(owner, "select public.configure_room_reward($1,true,$2)", [roomId, configuredWheelId]);
    const before = await as(player, "select public.room_play_state($1) as state", [roomId]);
    expect(before.rows[0].state).toMatchObject({ reward_status: { enabled: true, available_count: 0 } });
    expect(before.rows[0].state.reward_status.wheel.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Huy hiệu", remaining: 5 }),
        expect.objectContaining({ label: "Bút mực", remaining: 5 }),
      ]),
    );
    const next = await as(owner, "select public.control_run($1,'start',$2) as id", [roomId, questionId]);
    const nextRunId = String(next.rows[0].id);
    await expect(as(owner, "select public.configure_room_reward($1,false,null)", [roomId])).rejects.toThrow("Có thể thay đổi");
    await as(player, "select public.submit_answer($1,$2)", [nextRunId, "vượt bậc"]);
    await as(owner, "select public.control_run($1,'reveal')", [roomId]);
    const awarded = await as(player, "select public.room_play_state($1) as state", [roomId]);
    expect(awarded.rows[0].state).toMatchObject({ reward_status: { available_count: 1 } });
    const ticket = awarded.rows[0].state.reward_status.history[0].id;
    // Tắt chỉ áp dụng từ câu sau, không làm mất lượt đang chờ.
    await as(owner, "select public.configure_room_reward($1,false,null)", [roomId]);
    const first = await as(player, "select public.spin_room_reward($1) as result", [ticket]);
    const second = await as(player, "select public.spin_room_reward($1) as result", [ticket]);
    expect(second.rows[0].result).toEqual(first.rows[0].result);
    const afterSpin = await as(player, "select public.room_play_state($1) as state", [roomId]);
    const spun = afterSpin.rows[0].state.reward_status.wheel.items.find(
      (item: { label: string }) => item.label === first.rows[0].result.label,
    );
    expect(spun.remaining).toBe(4);
  });
  it("người khác không quay vòng riêng", async () =>
    await expect(
      as(player, "select public.spin_wheel($1,gen_random_uuid())", [wheelId]),
    ).rejects.toThrow("cấp lượt"));
  it("lượt trùng giữ kết quả và quà cuối không bị trao hai lần", async () => {
    const id = "44444444-4444-4444-8444-444444444444";
    const a = await as(owner, "select public.spin_wheel($1,$2) as result", [
      wheelId,
      id,
    ]);
    const b = await as(owner, "select public.spin_wheel($1,$2) as result", [
      wheelId,
      id,
    ]);
    expect(a.rows[0].result).toEqual(b.rows[0].result);
    expect(
      (
        await as(
          owner,
          "select stock from public.prizes where wheel_id=$1 and label='Quà'",
          [wheelId],
        )
      ).rows[0].stock,
    ).toBe(0);
    await expect(
      as(owner, "select public.spin_wheel($1,gen_random_uuid())", [wheelId]),
    ).rejects.toThrow("Không còn");
  });
  it("MC cấp một lượt; người nhận chỉ đọc, không sửa vòng; nộp trùng không mất thêm lượt", async () => {
    const wheel = await as(
      owner,
      "insert into public.wheels(title) values('Vòng cho thành viên') returning id",
    );
    const w = String(wheel.rows[0].id);
    await as(
      owner,
      "insert into public.prizes(wheel_id,label,weight,stock) values($1,'A',1,10),($1,'B',1,10)",
      [w],
    );
    await as(owner, "select public.grant_spins($1,$2,$3,1)", [
      roomId,
      w,
      player,
    ]);
    expect(
      (await as(player, "select * from public.wheels where id=$1", [w])).rows,
    ).toHaveLength(1);
    expect(
      (
        await as(
          player,
          "update public.wheels set title='Sai quyền' where id=$1 returning id",
          [w],
        )
      ).rows,
    ).toHaveLength(0);
    const id = "55555555-5555-4555-8555-555555555555";
    const first = await as(
      player,
      "select public.spin_wheel($1,$2) as result",
      [w, id],
    );
    expect(
      (await as(player, "select public.spin_wheel($1,$2) as result", [w, id]))
        .rows[0],
    ).toEqual(first.rows[0]);
    await expect(
      as(player, "select public.spin_wheel($1,gen_random_uuid())", [w]),
    ).rejects.toThrow("hết lượt");
  });
  it("theme phòng nhất quán giữa MC và người chơi; lịch cá nhân không ghi đè phòng", async () => {
    const palette = {
      primary: "#04605E",
      accent: "#F8A41E",
      background: "#F6F8F7",
      ink: "#151B45",
    };
    const t = await as(
      owner,
      "insert into public.themes(name,tokens) values($1,$2) returning id",
      ["MC Theme", palette],
    );
    const tid = String(t.rows[0].id);
    await as(owner, "update public.rooms set theme_id=$1 where id=$2", [
      tid,
      roomId,
    ]);
    const pt = await as(
      player,
      "insert into public.themes(name,tokens) values($1,$2) returning id",
      ["Player Theme", palette],
    );
    await as(
      player,
      "insert into public.event_schedules(theme_id,starts_at,ends_at,priority) values($1,clock_timestamp()-interval '1 hour',clock_timestamp()+interval '1 hour',999)",
      [pt.rows[0].id],
    );
    const mc = await as(owner, "select public.active_theme($1) as result", [
      roomId,
    ]);
    const member = await as(
      player,
      "select public.active_theme($1) as result",
      [roomId],
    );
    expect(mc.rows[0].result).toHaveProperty("theme.id", tid);
    expect(member.rows[0].result).toHaveProperty("theme.id", tid);
  });
  it("gate mật khẩu ban đầu chặn writes và chỉ Auth password change mới mở gate", async () => {
    await root(
      "update private.user_roles set must_change_password=true where user_id=$1",
      [owner],
    );
    await expect(
      as(
        owner,
        "insert into public.question_sets(title) values('Không được tạo')",
      ),
    ).rejects.toThrow("đổi mật khẩu");
    await root(
      "update auth.users set encrypted_password='test-only-new-hash' where id=$1",
      [owner],
    );
    expect(
      (
        await as(
          owner,
          "insert into public.question_sets(title) values('Được tạo') returning id",
        )
      ).rows,
    ).toHaveLength(1);
  });
  it("admin vẫn cần MFA để đổi quyền", async () => {
    await root("update private.user_roles set role='admin' where user_id=$1", [
      owner,
    ]);
    await expect(
      as(owner, "select public.admin_set_role($1,'admin')", [player]),
    ).rejects.toThrow("MFA");
  });
});
