import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const MAX_ATTEMPTS = 4;
const COOLDOWN_MS = 15_000;

function readIp(): string {
  const h = getRequestHeader("cf-connecting-ip")
    || getRequestHeader("x-forwarded-for")
    || getRequestHeader("x-real-ip")
    || "unknown";
  return (h.split(",")[0] || "unknown").trim();
}

function tomorrowMidnight(): Date {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(0, 0, 0, 0);
  return d;
}

export type LoginResult =
  | { ok: true; user: { id: string; username: string; isMaster: boolean } }
  | { ok: false; reason: "blocked" | "cooldown" | "bad_pin" | "invalid"; message: string; retryAt?: string };

export const attemptLogin = createServerFn({ method: "POST" })
  .inputValidator((d: { username: string; pin: string }) => d)
  .handler(async ({ data }): Promise<LoginResult> => {
    const uname = (data.username || "").trim();
    const pin = (data.pin || "").trim();
    if (!uname || !/^[0-9]{4}$/.test(pin)) {
      return { ok: false, reason: "invalid", message: "Usuario o PIN inválido" };
    }
    const ip = readIp();
    const now = new Date();

    // Read attempts row for this IP
    const { data: row } = await supabaseAdmin
      .from("login_attempts" as any)
      .select("*")
      .eq("ip", ip)
      .maybeSingle();

    const r: any = row;
    if (r?.blocked_until && new Date(r.blocked_until) > now) {
      return {
        ok: false, reason: "blocked",
        message: "Demasiados intentos. Bloqueado hasta mañana.",
        retryAt: r.blocked_until,
      };
    }
    if (r?.next_try_at && new Date(r.next_try_at) > now) {
      const secs = Math.ceil((new Date(r.next_try_at).getTime() - now.getTime()) / 1000);
      return { ok: false, reason: "cooldown", message: `Espera ${secs}s antes de reintentar.`, retryAt: r.next_try_at };
    }

    // Look up user (case-insensitive)
    const { data: existing } = await supabaseAdmin
      .from("app_users")
      .select("*")
      .ilike("username", uname)
      .maybeSingle();

    if (existing) {
      if (existing.pin === pin) {
        // success: clear attempts
        await supabaseAdmin.from("login_attempts" as any).delete().eq("ip", ip);
        return {
          ok: true,
          user: {
            id: existing.id,
            username: existing.username,
            isMaster: existing.username === "MasterAcc1000",
          },
        };
      }
      // wrong pin → record failure
      const failed = (r?.failed_count || 0) + 1;
      const blocked = failed >= MAX_ATTEMPTS;
      const blocked_until = blocked ? tomorrowMidnight().toISOString() : null;
      const next_try_at = blocked ? null : new Date(now.getTime() + COOLDOWN_MS).toISOString();
      await supabaseAdmin.from("login_attempts" as any).upsert({
        ip,
        failed_count: failed,
        last_failed_at: now.toISOString(),
        next_try_at,
        blocked_until,
      }, { onConflict: "ip" } as any);
      if (blocked) {
        return { ok: false, reason: "blocked", message: "Demasiados intentos fallidos. Bloqueado hasta mañana." };
      }
      return {
        ok: false, reason: "bad_pin",
        message: `PIN incorrecto. Espera 15s. (${failed}/${MAX_ATTEMPTS})`,
        retryAt: next_try_at!,
      };
    }

    // New account: usernames are unique (case-insensitive index). Reject Master clones.
    if (uname.toLowerCase() === "masteracc1000") {
      return { ok: false, reason: "invalid", message: "Nombre reservado." };
    }
    const { data: created, error } = await supabaseAdmin
      .from("app_users")
      .insert({ username: uname, pin })
      .select()
      .single();
    if (error || !created) {
      return { ok: false, reason: "invalid", message: error?.message || "No se pudo crear la cuenta" };
    }
    await supabaseAdmin.from("login_attempts" as any).delete().eq("ip", ip);
    return { ok: true, user: { id: created.id, username: created.username, isMaster: false } };
  });

export const masterUnblock = createServerFn({ method: "POST" })
  .inputValidator((d: { ip?: string; userId?: string }) => d)
  .handler(async () => {
    // Clear all blocks (simple admin action).
    await supabaseAdmin.from("login_attempts" as any).delete().gte("created_at", "1970-01-01");
    return { ok: true };
  });
