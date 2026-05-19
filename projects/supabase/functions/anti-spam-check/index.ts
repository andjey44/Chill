import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

type LimitType = "auth" | "write" | "destructive";

type RateLimitRequest = {
  action?: string;
  type?: LimitType;
  actorHint?: string;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const LIMITS: Record<LimitType, { maxAttempts: number; windowSeconds: number; cooldownSeconds: number }> = {
  auth: { maxAttempts: 5, windowSeconds: 10 * 60, cooldownSeconds: 30 },
  write: { maxAttempts: 20, windowSeconds: 60, cooldownSeconds: 15 },
  destructive: { maxAttempts: 10, windowSeconds: 60, cooldownSeconds: 20 },
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function getIp(req: Request) {
  return (
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown-ip"
  );
}

async function sha256(value: string) {
  const data = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ allowed: false, message: "Method not allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    return json({ allowed: false, message: "Server is not configured" }, 500);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  let body: RateLimitRequest = {};

  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const type: LimitType = body.type && body.type in LIMITS ? body.type : "write";
  const action = String(body.action || type).slice(0, 80);
  const limit = LIMITS[type];
  const now = new Date();

  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7) : "";

  let actorSource = "";

  if (token) {
    const { data } = await supabase.auth.getUser(token);
    if (data?.user?.id) {
      actorSource = `user:${data.user.id}`;
    }
  }

  if (!actorSource) {
    const hint = String(body.actorHint || "").toLowerCase().trim().slice(0, 160);
    actorSource = hint ? `hint:${hint}` : `ip:${getIp(req)}`;
  }

  const actorKey = `${type}:${await sha256(actorSource)}`;

  const { data: existing, error: selectError } = await supabase
    .from("rate_limits")
    .select("id, attempts, window_start, blocked_until")
    .eq("actor_key", actorKey)
    .eq("action", action)
    .maybeSingle();

  if (selectError) {
    console.error(selectError);
    return json({ allowed: true, warning: "Rate limit check failed open" });
  }

  if (existing?.blocked_until && new Date(existing.blocked_until) > now) {
    const retryAfter = Math.ceil((new Date(existing.blocked_until).getTime() - now.getTime()) / 1000);
    return json({ allowed: false, retryAfter, message: `Слишком много действий. Подождите ${retryAfter} сек.` }, 429);
  }

  const windowStart = existing?.window_start ? new Date(existing.window_start) : now;
  const windowAgeSeconds = (now.getTime() - windowStart.getTime()) / 1000;
  const shouldResetWindow = !existing || windowAgeSeconds > limit.windowSeconds;
  const nextAttempts = shouldResetWindow ? 1 : Number(existing.attempts || 0) + 1;

  if (nextAttempts > limit.maxAttempts) {
    const blockedUntil = new Date(now.getTime() + limit.cooldownSeconds * 1000).toISOString();

    await supabase.from("rate_limits").upsert({
      actor_key: actorKey,
      action,
      attempts: nextAttempts,
      window_start: shouldResetWindow ? now.toISOString() : existing.window_start,
      blocked_until: blockedUntil,
    }, { onConflict: "actor_key,action" });

    return json({
      allowed: false,
      retryAfter: limit.cooldownSeconds,
      message: `Защита от спама: ${action}. Попробуйте позже.`,
    }, 429);
  }

  const { error: upsertError } = await supabase.from("rate_limits").upsert({
    actor_key: actorKey,
    action,
    attempts: nextAttempts,
    window_start: shouldResetWindow ? now.toISOString() : existing.window_start,
    blocked_until: null,
  }, { onConflict: "actor_key,action" });

  if (upsertError) {
    console.error(upsertError);
    return json({ allowed: true, warning: "Rate limit update failed open" });
  }

  return json({ allowed: true, attempts: nextAttempts, maxAttempts: limit.maxAttempts });
});
