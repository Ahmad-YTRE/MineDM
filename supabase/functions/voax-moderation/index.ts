import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anonKey || !serviceKey) return json({ error: "Moderation service is not configured" }, 500);

  const authorization = req.headers.get("Authorization") || "";
  const token = authorization.replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Authentication required" }, 401);

  const userClient = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: authData, error: authError } = await userClient.auth.getUser(token);
  if (authError || !authData.user) return json({ error: "Invalid session" }, 401);
  const actor = authData.user;

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON body" }, 400); }
  const action = String(body.action || "");
  const targetId = String(body.target_user_id || "");
  if (!targetId || !/^[0-9a-f-]{36}$/i.test(targetId)) return json({ error: "A valid target account is required" }, 400);

  const { data: actorStaff, error: actorRoleError } = await admin.from("voax_staff_roles").select("role").eq("user_id", actor.id).maybeSingle();
  if (actorRoleError) return json({ error: "Could not verify staff permissions" }, 500);
  const actorRole = actorStaff?.role || null;
  const rank = (role: string | null) => role === "owner" ? 3 : role === "admin" ? 2 : role === "moderator" ? 1 : 0;
  if (!actorRole) return json({ error: "Staff access required" }, 403);

  const { data: targetStaff, error: targetRoleError } = await admin.from("voax_staff_roles").select("role").eq("user_id", targetId).maybeSingle();
  if (targetRoleError) return json({ error: "Could not verify target permissions" }, 500);
  const targetRole = targetStaff?.role || null;
  if (targetId === actor.id) return json({ error: "You cannot perform this action on your own account" }, 400);
  if (targetRole && rank(actorRole) <= rank(targetRole)) return json({ error: "You cannot moderate or manage an equal or higher staff role" }, 403);

  if (action === "ban_user") {
    const reason = String(body.reason || "").trim();
    const duration = String(body.duration || "");
    const durations: Record<string, number> = { "1h": 60, "24h": 1440, "7d": 10080, "30d": 43200, "permanent": 52560000 };
    if (reason.length < 3 || reason.length > 500) return json({ error: "Enter a ban reason between 3 and 500 characters" }, 400);
    if (!(duration in durations)) return json({ error: "Invalid ban duration" }, 400);
    const maxMinutes = actorRole === "owner" ? Number.POSITIVE_INFINITY : actorRole === "admin" ? 43200 : 10080;
    if (durations[duration] > maxMinutes) return json({ error: "Your staff role cannot issue a ban of this duration" }, 403);
    const { data: targetUser, error: targetUserError } = await admin.auth.admin.getUserById(targetId);
    if (targetUserError || !targetUser.user) return json({ error: "Account not found" }, 404);
    const banDuration = duration === "permanent" ? "876000h" : duration;
    const { error: authBanError } = await admin.auth.admin.updateUserById(targetId, { ban_duration: banDuration });
    if (authBanError) return json({ error: authBanError.message }, 400);
    const expiresAt = duration === "permanent" ? null : new Date(Date.now() + durations[duration] * 60000).toISOString();
    const { error: revokeError } = await admin.from("voax_account_bans").update({ status: "revoked", revoked_by: actor.id, revoked_at: new Date().toISOString() }).eq("user_id", targetId).eq("status", "active");
    if (revokeError) {
      await admin.auth.admin.updateUserById(targetId, { ban_duration: "none" });
      return json({ error: "Could not record the ban" }, 500);
    }
    const { data: ban, error: insertError } = await admin.from("voax_account_bans").insert({
      user_id: targetId, reason, duration, expires_at: expiresAt, banned_by: actor.id,
    }).select("id,user_id,reason,duration,expires_at,status,created_at").single();
    if (insertError) {
      await admin.auth.admin.updateUserById(targetId, { ban_duration: "none" });
      return json({ error: "Could not save the ban record" }, 500);
    }
    await admin.from("voax_admin_audit_log").insert({ admin_id: actor.id, action: "banned_account", target_type: "account", target_id: targetId, details: { reason, duration, ban_id: ban.id } });
    return json({ ok: true, ban });
  }

  if (action === "unban_user") {
    if (actorRole === "moderator") return json({ error: "Only admins and owners can revoke bans" }, 403);
    const { error: unbanError } = await admin.auth.admin.updateUserById(targetId, { ban_duration: "none" });
    if (unbanError) return json({ error: unbanError.message }, 400);
    const { error: recordError } = await admin.from("voax_account_bans").update({ status: "revoked", revoked_by: actor.id, revoked_at: new Date().toISOString() }).eq("user_id", targetId).eq("status", "active");
    if (recordError) return json({ error: "Account unbanned, but the ban record could not be updated" }, 500);
    await admin.from("voax_admin_audit_log").insert({ admin_id: actor.id, action: "unbanned_account", target_type: "account", target_id: targetId, details: {} });
    return json({ ok: true });
  }

  if (action === "set_staff_role") {
    const requestedRole = body.role === null ? null : String(body.role || "");
    if (actorRole !== "owner" && actorRole !== "admin") return json({ error: "Only admins and owners can manage moderators" }, 403);
    if (requestedRole !== null && !["owner", "admin", "moderator"].includes(requestedRole)) return json({ error: "Invalid staff role" }, 400);
    if (actorRole === "admin" && requestedRole !== "moderator" && requestedRole !== null) return json({ error: "Admins can only assign moderators" }, 403);
    if (actorRole === "admin" && targetRole && targetRole !== "moderator") return json({ error: "Admins cannot change admin or owner roles" }, 403);
    if (actorRole === "owner" && targetRole === "owner") return json({ error: "Owner accounts are protected from role changes" }, 403);
    if (requestedRole === null) {
      const { error } = await admin.from("voax_staff_roles").delete().eq("user_id", targetId);
      if (error) return json({ error: error.message }, 400);
    } else {
      const { error } = await admin.from("voax_staff_roles").upsert({ user_id: targetId, role: requestedRole, granted_by: actor.id, updated_at: new Date().toISOString() });
      if (error) return json({ error: error.message }, 400);
    }
    await admin.from("voax_admin_audit_log").insert({ admin_id: actor.id, action: requestedRole ? "assigned_staff_role" : "removed_staff_role", target_type: "account", target_id: targetId, details: { previous_role: targetRole, role: requestedRole } });
    return json({ ok: true, role: requestedRole });
  }

  return json({ error: "Unknown moderation action" }, 400);
});
