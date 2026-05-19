import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const MASTER_USERNAME = "MasterAcc1000";

async function assertMaster(callerUserId: string | undefined): Promise<void> {
  if (!callerUserId) throw new Error("Forbidden: missing caller");
  const { data } = await supabaseAdmin
    .from("app_users")
    .select("username")
    .eq("id", callerUserId)
    .maybeSingle();
  if (!data || data.username !== MASTER_USERNAME) {
    throw new Error("Forbidden");
  }
}

export const listAppUsers = createServerFn({ method: "POST" })
  .inputValidator((d: { callerUserId: string }) => d)
  .handler(async ({ data }) => {
    await assertMaster(data.callerUserId);
    const { data: u } = await supabaseAdmin
      .from("app_users")
      .select("id,username,created_at")
      .order("created_at", { ascending: false });
    return { users: u || [] };
  });

export const deleteAppUserById = createServerFn({ method: "POST" })
  .inputValidator((d: { callerUserId: string; userId: string }) => d)
  .handler(async ({ data }) => {
    await assertMaster(data.callerUserId);
    const { data: target } = await supabaseAdmin
      .from("app_users").select("username").eq("id", data.userId).maybeSingle();
    if (!target) throw new Error("User not found");
    if (target.username === MASTER_USERNAME) throw new Error("Cannot delete master");
    const { data: chars } = await supabaseAdmin
      .from("characters").select("id").eq("user_id", data.userId);
    const charIds = (chars || []).map((c: any) => c.id);
    if (charIds.length) {
      await supabaseAdmin.from("items").delete().in("owner_character_id", charIds);
      await supabaseAdmin.from("achievements").delete().in("character_id", charIds);
      await supabaseAdmin.from("character_conditions").delete().in("character_id", charIds);
      await supabaseAdmin.from("character_notes" as any).delete().in("character_id", charIds);
      await supabaseAdmin.from("characters").delete().in("id", charIds);
    }
    await supabaseAdmin.from("campaign_members").delete().eq("user_id", data.userId);
    await supabaseAdmin.from("campaigns").delete().eq("owner_user_id", data.userId);
    await supabaseAdmin.from("app_users").delete().eq("id", data.userId);
    return { ok: true };
  });

export const listLoginAttempts = createServerFn({ method: "POST" })
  .inputValidator((d: { callerUserId: string }) => d)
  .handler(async ({ data }) => {
    await assertMaster(data.callerUserId);
    const { data: a } = await supabaseAdmin
      .from("login_attempts" as any)
      .select("ip,username,failed_count,blocked_until,next_try_at");
    return { attempts: a || [] };
  });

export const clearAllBlocks = createServerFn({ method: "POST" })
  .inputValidator((d: { callerUserId: string }) => d)
  .handler(async ({ data }) => {
    await assertMaster(data.callerUserId);
    await supabaseAdmin.from("login_attempts" as any).delete().not("ip", "is", null);
    return { ok: true };
  });

export const clearBlockByIp = createServerFn({ method: "POST" })
  .inputValidator((d: { callerUserId: string; ip: string }) => d)
  .handler(async ({ data }) => {
    await assertMaster(data.callerUserId);
    await supabaseAdmin.from("login_attempts" as any).delete().eq("ip", data.ip);
    return { ok: true };
  });

export const setAppBackground = createServerFn({ method: "POST" })
  .inputValidator((d: { callerUserId: string; url: string }) => d)
  .handler(async ({ data }) => {
    await assertMaster(data.callerUserId);
    const url = (data.url || "").trim().slice(0, 2000);
    await supabaseAdmin.from("app_settings").upsert(
      { key: "background_url", value: url },
      { onConflict: "key" } as any,
    );
    return { ok: true };
  });
