/**
 * ============================================================================
 *  CLAUDE USAGE PROXY — Cloudflare Worker
 * ============================================================================
 *  Hace de intermediario entre el widget de Scriptable y el endpoint OAuth de
 *  uso de Anthropic. La llamada sale de un servidor (no del móvil), por lo que
 *  no la bloquea el borde de la API, y las credenciales de Anthropic viven en
 *  Cloudflare (KV + secretos), nunca en el teléfono.
 *
 *  Rutas:
 *    GET  /usage  → devuelve el JSON de uso de Anthropic.
 *    POST /seed   → guarda/actualiza las credenciales OAuth en KV.
 *    GET  /health → comprobación simple.
 *  Todas requieren la cabecera:  Authorization: Bearer <PROXY_TOKEN>
 *
 *  Configuración (ver proxy/README.md):
 *    - Namespace KV enlazado como `OAUTH`.
 *    - Secreto `PROXY_TOKEN` (token compartido con el widget).
 *  Las credenciales de Anthropic se cargan una vez con POST /seed y luego el
 *  Worker renueva el access token automáticamente (guardando el refresh
 *  rotado en KV).
 * ============================================================================
 */

const USAGE_URL = "https://api.anthropic.com/api/oauth/usage";
const TOKEN_URL = "https://console.anthropic.com/v1/oauth/token";
const OAUTH_CLIENT_ID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e";
const OAUTH_BETA = "oauth-2025-04-20";
const ANTHROPIC_VERSION = "2023-06-01";
const USER_AGENT = "claude-cli/1.0.0 (external, cli)";

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);

      // Autenticación: token del proxy en cabecera Bearer.
      if (!authorized(request, env)) {
        return json({ error: "unauthorized" }, 401);
      }

      if (url.pathname === "/health" && request.method === "GET") {
        return json({ ok: true });
      }
      if (url.pathname === "/seed" && request.method === "POST") {
        return await handleSeed(request, env);
      }
      if (url.pathname === "/refresh" && request.method === "POST") {
        return await handleRefresh(env);
      }
      if (url.pathname === "/status" && request.method === "GET") {
        return await handleStatus(env);
      }
      if (url.pathname === "/usage" && request.method === "GET") {
        return await handleUsage(env);
      }
      return json({ error: "not_found" }, 404);
    } catch (e) {
      return json({ error: "proxy_error", message: safeMessage(e) }, 500);
    }
  },
};

// ─── Autenticación del proxy ────────────────────────────────────────────────

function authorized(request, env) {
  const expected = env.PROXY_TOKEN || "";
  if (!expected) return false;
  const auth = request.headers.get("Authorization") || "";
  const got = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  return timingSafeEqual(got, expected);
}

// Comparación en tiempo (casi) constante para no filtrar longitud/contenido.
function timingSafeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ─── /seed — cargar credenciales OAuth en KV ────────────────────────────────

async function handleSeed(request, env) {
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json({ error: "invalid_json" }, 400);
  }
  // Admite el JSON de Claude Code ({"claudeAiOauth":{...}}) o el objeto plano.
  const o = (body && body.claudeAiOauth) || body || {};
  const access = o.accessToken || o.access_token || o.access || null;
  const refresh = o.refreshToken || o.refresh_token || o.refresh || null;
  let expires = o.expiresAt || o.expires_at || o.expires || 0;
  if (typeof expires === "number" && expires < 1e12) expires *= 1000; // seg → ms

  if (!access && !refresh) {
    return json({ error: "missing_credentials", hint: "accessToken o refreshToken" }, 400);
  }

  const ops = [];
  if (access) ops.push(env.OAUTH.put("access", String(access)));
  if (refresh) ops.push(env.OAUTH.put("refresh", String(refresh)));
  ops.push(env.OAUTH.put("expires", String(Number(expires) || 0)));
  await Promise.all(ops);

  return json({ ok: true, stored: { access: !!access, refresh: !!refresh } });
}

// ─── /status — estado de las credenciales en KV (sin exponer tokens) ────────

async function handleStatus(env) {
  const [access, refresh, expiresStr] = await Promise.all([
    env.OAUTH.get("access"),
    env.OAUTH.get("refresh"),
    env.OAUTH.get("expires"),
  ]);
  const expires = Number(expiresStr) || 0;
  const now = Date.now();
  return json({
    has_access: !!access,
    has_refresh: !!refresh,
    access_valid: !!access && now < expires - 60000,
    expires_at: expires ? new Date(expires).toISOString() : null,
    expires_in_seconds: expires ? Math.round((expires - now) / 1000) : null,
    server_time: new Date(now).toISOString(),
  });
}

// ─── /refresh — fuerza una renovación y reporta el resultado ─────────────────

async function handleRefresh(env) {
  const refresh = await env.OAUTH.get("refresh");
  if (!refresh) return json({ ok: false, error: "no_refresh_token" }, 400);

  const r = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
      "User-Agent": USER_AGENT,
    },
    body: JSON.stringify({
      grant_type: "refresh_token",
      refresh_token: refresh,
      client_id: OAUTH_CLIENT_ID,
    }),
  });

  const text = await r.text();
  let j = null;
  try { j = JSON.parse(text); } catch (e) { /* no-JSON */ }

  if (r.ok && j && j.access_token) {
    const ops = [env.OAUTH.put("access", j.access_token)];
    if (j.refresh_token) ops.push(env.OAUTH.put("refresh", j.refresh_token));
    const ttl = Number(j.expires_in) || 0;
    ops.push(env.OAUTH.put("expires", String(Date.now() + ttl * 1000)));
    await Promise.all(ops);
    return json({
      ok: true,
      refreshed: true,
      rotated_refresh: !!j.refresh_token,
      expires_in: j.expires_in,
    });
  }

  // Falló: devolvemos el motivo (sin tokens). "invalid_grant" = el refresh
  // token fue revocado o rotado por otro cliente (p. ej. Claude Code).
  return json({
    ok: false,
    token_status: r.status,
    error: j ? (j.error || j.type) : null,
    error_description: j ? (j.error_description || j.message) : safeParse(text),
  }, 200);
}

// ─── /usage — obtener el uso desde Anthropic ────────────────────────────────

async function handleUsage(env) {
  const access = await getAccessToken(env);
  if (!access) {
    return json({ error: "no_credentials", hint: "Ejecuta POST /seed primero." }, 400);
  }

  const resp = await fetch(USAGE_URL, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${access}`,
      "anthropic-beta": OAUTH_BETA,
      "anthropic-version": ANTHROPIC_VERSION,
      "User-Agent": USER_AGENT,
      "x-app": "cli",
      "Accept": "application/json",
    },
  });

  const text = await resp.text();

  // Éxito: reenviamos el JSON de Anthropic tal cual.
  if (resp.status >= 200 && resp.status < 300) {
    return new Response(text, {
      status: resp.status,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  }

  // Error de Anthropic (p. ej. 401 por token OAuth caducado). NO lo reenviamos
  // como 401 tal cual, porque el 401 del proxy está reservado para "PROXY_TOKEN
  // incorrecto". Lo envolvemos como 502 con el detalle, para que el widget lo
  // distinga y muestre "re-seed" en vez de "token del proxy incorrecto".
  return json(
    { error: "upstream_error", upstream_status: resp.status, body: safeParse(text) },
    502
  );
}

/**
 * Devuelve un access token válido, renovándolo con el refresh token si hace
 * falta y guardando en KV el nuevo access + el refresh rotado + la caducidad.
 */
async function getAccessToken(env) {
  const [access, refresh, expiresStr] = await Promise.all([
    env.OAUTH.get("access"),
    env.OAUTH.get("refresh"),
    env.OAUTH.get("expires"),
  ]);
  const expires = Number(expiresStr) || 0;

  // Margen de 60 s para no usar un token a punto de caducar.
  if (access && Date.now() < expires - 60000) return access;
  if (!refresh) return access; // sin refresh: se usa el access tal cual

  const r = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
      "User-Agent": USER_AGENT,
    },
    body: JSON.stringify({
      grant_type: "refresh_token",
      refresh_token: refresh,
      client_id: OAUTH_CLIENT_ID,
    }),
  });

  if (!r.ok) return access; // último recurso: probamos con el que había
  const j = await r.json().catch(() => null);
  if (j && j.access_token) {
    const ops = [env.OAUTH.put("access", j.access_token)];
    // El refresh token rota: si viene uno nuevo, hay que persistirlo o se
    // invalida el flujo en la siguiente renovación.
    if (j.refresh_token) ops.push(env.OAUTH.put("refresh", j.refresh_token));
    const ttl = Number(j.expires_in) || 0;
    ops.push(env.OAUTH.put("expires", String(Date.now() + ttl * 1000)));
    await Promise.all(ops);
    return j.access_token;
  }
  return access;
}

// ─── Utilidades ─────────────────────────────────────────────────────────────

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function safeMessage(e) {
  const m = e && e.message ? String(e.message) : String(e);
  return m.length > 200 ? m.slice(0, 200) : m;
}

// Intenta parsear JSON; si no, devuelve el texto recortado.
function safeParse(text) {
  try {
    return JSON.parse(text);
  } catch (e) {
    const s = String(text || "");
    return s.length > 300 ? s.slice(0, 300) : s;
  }
}
