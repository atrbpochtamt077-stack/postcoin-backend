import { GAME, UPGRADE_DEFS } from "./gameConfig.js";
import { LEVELS } from "./levels.js";
import { db, nowMs } from "./db.js";

export function computeEnergy(user) {
  const t = nowMs();
  const last = user.energy_updated_at || t;
  const interval = user.energy_regen_interval_ms;
  if (interval <= 0) return { energy: user.energy, energyUpdatedAt: t };

  const gained = Math.floor((t - last) / interval);
  if (gained <= 0) return { energy: user.energy, energyUpdatedAt: last };

  const newEnergy = Math.min(user.energy_max, user.energy + gained);
  const newUpdatedAt = last + gained * interval;
  return { energy: newEnergy, energyUpdatedAt: newUpdatedAt };
}

export function computeTapPower(user, upgrades) {
  const lvl = upgrades.tap_power || 0;
  return GAME.baseTapPower + lvl;
}

export function computeEnergyMax(user, upgrades) {
  const lvl = upgrades.energy_max || 0;
  return GAME.baseEnergyMax + lvl * 20;
}

export function computeRegenIntervalMs(user, upgrades) {
  const lvl = upgrades.regen || 0;
  return Math.max(600, GAME.baseEnergyRegenIntervalMs - lvl * 150);
}

export function computePassiveIncomePerHour(user, upgrades) {
  const lvl = upgrades.passive || 0;
  return GAME.basePassiveIncomePerHour + 25 * lvl + buildingIncomePerHour(user);
}

export function buildingIncomePerHour(user) {
  // sum buildings purchased
  const rows = db
    .prepare("SELECT building_level FROM buildings WHERE user_id = ?")
    .all(user.id);
  let sum = 0;
  for (const r of rows) {
    const def = LEVELS[r.building_level - 1];
    if (def) sum += def.buildingIncomePerHour;
  }
  return sum;
}

export function getUpgrades(userId) {
  const rows = db
    .prepare("SELECT upgrade_key, level FROM upgrades WHERE user_id = ?")
    .all(userId);
  const map = { tap_power: 0, energy_max: 0, regen: 0, passive: 0 };
  for (const r of rows) map[r.upgrade_key] = r.level;
  return map;
}

export function setUpgradeLevel(userId, key, level) {
  db.prepare(
    "INSERT INTO upgrades (user_id, upgrade_key, level) VALUES (?, ?, ?) ON CONFLICT(user_id, upgrade_key) DO UPDATE SET level = excluded.level"
  ).run(userId, key, level);
}

export function accrueClaimablePassive(user) {
  const now = nowMs();
  const last = user.last_passive_claim_at || now;
  const elapsed = Math.max(0, now - last);
  const incomePerHour = user.passive_income_per_hour;

  const claimable = Math.floor((incomePerHour * elapsed) / (60 * 60 * 1000));
  const canClaim = elapsed >= GAME.claimCooldownMs;
  const cooldownLeftMs = Math.max(0, GAME.claimCooldownMs - elapsed);

  return { claimable, canClaim, cooldownLeftMs, now, last };
}

export function upgradePrice(key, currentLevel) {
  const def = UPGRADE_DEFS[key];
  if (!def) throw new Error("UNKNOWN_UPGRADE");
  return def.price(currentLevel);
}
