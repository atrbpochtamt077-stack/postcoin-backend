// Minimal Telegram WebApp initData validation (MVP)
// In production, keep this strict and audited.
import crypto from "crypto";

export function parseInitData(initData) {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  params.delete("hash");

  const dataCheckString = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");

  return { hash, dataCheckString, params };
}

export function validateInitData(initData, botToken) {
  if (!initData) return { ok: false, error: "NO_INIT_DATA" };
  const { hash, dataCheckString, params } = parseInitData(initData);
  if (!hash) return { ok: false, error: "NO_HASH" };

  // secret_key = HMAC_SHA256("WebAppData", botToken)
  const secretKey = crypto
    .createHmac("sha256", "WebAppData")
    .update(botToken)
    .digest();

  const computedHash = crypto
    .createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest("hex");

  if (computedHash !== hash) return { ok: false, error: "BAD_HASH" };

  const userRaw = params.get("user");
  if (!userRaw) return { ok: false, error: "NO_USER" };

  let user;
  try {
    user = JSON.parse(userRaw);
  } catch {
    return { ok: false, error: "BAD_USER_JSON" };
  }

  return { ok: true, user, params: Object.fromEntries(params.entries()) };
}
