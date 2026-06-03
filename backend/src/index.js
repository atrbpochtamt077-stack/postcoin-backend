import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import { validateInitData } from "./telegramAuth.js";
import { db, nowMs, getUserByTelegramId, createUser, updateUserFields } from "./db.js";
import { GAME } from "./gameConfig.js";
import {
  computeEnergy,
  getUpgrades,
  computeTapPower,
  computeEnergyMax,
  computeRegenIntervalMs,
  computePassiveIncomePerHour,
  accrueClaimablePassive,
  upgradePrice,
  setUpgradeLevel
} from "./logic.js";
import { LEVELS } from "./levels.js";
import { startBot } from "./bot.js";

dotenv.config();

const PORT = Number(process.env.PORT || 8080);
const CORS_ORIGIN = process.env.CORS_ORIGIN || "*";
const BOT_TOKEN = process.env.BOT_TOKEN;

if (!BOT_TOKEN) {
  console.error("BOT_TOKEN is required (.env)");
  process.exit(1);
}

const app = express();
app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json());

function auth(req) {
  const initData = req.headers["x-telegram-initdata"];
  const res = validateInitData(initData, BOT_TOKEN);
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, tgUser: res.user };
}

function ensureUser(tgUser, ref) {
  const telegramId = String(tgUser.id);
  let user = getUserByTelegramId(telegramId);
  if (!user) {
    // referral: passed as ?start=ref_<id>
    const referrerTelegramId = ref && ref.startsWith("ref_") ? ref.slice(4) : null;
    user = createUser({ telegramId, username: tgUser.username, referrerTelegramId });

    // give referral bonus to referrer
    if (referrerTelegramId) {
      const referrer = getUserByTelegramId(referrerTelegramId);
      if (referrer) {
        updateUserFields(referrer.id, {
          balance: referrer.balance + GAME.referralBonus,
          total_earned: referrer.total_earned + GAME.referralBonus
        });
      }
    }

    // seed upgrades table
    for (const k of ["tap_power", "energy_max", "regen", "passive"]) {
      db.prepare(
        "INSERT OR IGNORE INTO upgrades (user_id, upgrade_key, level) VALUES (?, ?, 0)"
      ).run(user.id, k);
    }
  }
  return user;
}

function refreshDerivedStats(user) {
  const upgrades = getUpgrades(user.id);
  const energyCalc = computeEnergy(user);

  const tapPower = computeTapPower(user, upgrades);
  const energyMax = computeEnergyMax(user, upgrades);
  const regenIntervalMs = computeRegenIntervalMs(user, upgrades);

  // persist energy and derived stats
  const fields = {
    energy: Math.min(energyMax, energyCalc.energy),
    energy_max: energyMax,
    energy_regen_interval_ms: regenIntervalMs,
    energy_updated_at: energyCalc.energyUpdatedAt,
    tap_power: tapPower
  };

  updateUserFields(user.id, fields);

  const refreshed = getUserByTelegramId(user.telegram_id);
  const passiveIncome = computePassiveIncomePerHour(refreshed, upgrades);
  updateUserFields(refreshed.id, { passive_income_per_hour: passiveIncome });

  return getUserByTelegramId(user.telegram_id);
}

app.get("/health", (req, res) => res.json({ ok: true }));

app.post("/auth/telegram", (req, res) => {
  const initData = req.body?.initData;
  const v = validateInitData(initData, BOT_TOKEN);
  if (!v.ok) return res.status(401).json({ ok: false, error: v.error });
  res.json({ ok: true, user: v.user });
});

app.get("/me", (req, res) => {
  const a = auth(req);
  if (!a.ok) return res.status(401).json(a);

  const ref = req.query?.startapp || null;
  const baseUser = ensureUser(a.tgUser, ref);
  const user = refreshDerivedStats(baseUser);
  const upgrades = getUpgrades(user.id);
  const passive = accrueClaimablePassive(user);

  res.json({
    ok: true,
    user: {
      telegramId: user.telegram_id,
      username: user.username,
      level: user.level,
      levelTitle: LEVELS[user.level - 1]?.title,
      balance: user.balance,
      totalEarned: user.total_earned,
      energy: user.energy,
      energyMax: user.energy_max,
      regenIntervalMs: user.energy_regen_interval_ms,
      tapPower: user.tap_power,
      passiveIncomePerHour: user.passive_income_per_hour,
      passive: {
        claimable: passive.claimable,
        canClaim: passive.canClaim,
        cooldownLeftMs: passive.cooldownLeftMs
      },
      upgrades,
      referralBonus: GAME.referralBonus
    }
  });
});

app.post("/tap", (req, res) => {
  const a = auth(req);
  if (!a.ok) return res.status(401).json(a);

  const userRow = ensureUser(a.tgUser, null);
  const user = refreshDerivedStats(userRow);

  const tapCountRaw = Number(req.body?.tapCount || 0);
  const tapCount = Math.max(0, Math.min(GAME.tapCountMaxPerRequest, Math.floor(tapCountRaw)));

  // basic rate limit
  const now = nowMs();
  if (now - (user.last_tap_request_at || 0) < GAME.minMsBetweenTapRequests) {
    return res.status(429).json({ ok: false, error: "TOO_FAST" });
  }

  const energyAvailable = user.energy;
  const maxByEnergy = Math.floor(energyAvailable / GAME.tapEnergyCost);
  const acceptedTaps = Math.min(tapCount, maxByEnergy);

  const earned = acceptedTaps * user.tap_power;
  const newEnergy = user.energy - acceptedTaps * GAME.tapEnergyCost;

  updateUserFields(user.id, {
    balance: user.balance + earned,
    total_earned: user.total_earned + earned,
    energy: newEnergy,
    energy_updated_at: now,
    last_tap_request_at: now
  });

  // progress quest: 100000 taps (MVP: only one quest)
  db.prepare(
    "INSERT OR IGNORE INTO quests (user_id, quest_key, quest_type, progress, target, reward, status) VALUES (?, 'tap_100k', 'one_time', 0, 100000, 20000, 'active')"
  ).run(user.id);
  db.prepare(
    "UPDATE quests SET progress = MIN(target, progress + ?), updated_at = ? WHERE user_id = ? AND quest_key = 'tap_100k' AND status = 'active'"
  ).run(acceptedTaps, now, user.id);

  const updated = getUserByTelegramId(user.telegram_id);
  const passive = accrueClaimablePassive(updated);

  res.json({
    ok: true,
    acceptedTaps,
    earned,
    balance: updated.balance,
    energy: updated.energy,
    energyMax: updated.energy_max,
    tapPower: updated.tap_power,
    passive: {
      claimable: passive.claimable,
      canClaim: passive.canClaim,
      cooldownLeftMs: passive.cooldownLeftMs
    }
  });
});

app.post("/claim", (req, res) => {
  const a = auth(req);
  if (!a.ok) return res.status(401).json(a);

  const userRow = ensureUser(a.tgUser, null);
  const user = refreshDerivedStats(userRow);

  const passive = accrueClaimablePassive(user);
  if (!passive.canClaim) {
    return res.status(400).json({ ok: false, error: "COOLDOWN", cooldownLeftMs: passive.cooldownLeftMs });
  }

  const amount = passive.claimable;
  updateUserFields(user.id, {
    balance: user.balance + amount,
    total_earned: user.total_earned + amount,
    last_passive_claim_at: passive.now
  });

  const updated = getUserByTelegramId(user.telegram_id);
  res.json({ ok: true, claimed: amount, balance: updated.balance });
});

app.post("/buy-upgrade", (req, res) => {
  const a = auth(req);
  if (!a.ok) return res.status(401).json(a);

  const key = String(req.body?.upgradeKey || "");
  if (!["tap_power", "energy_max", "regen", "passive"].includes(key)) {
    return res.status(400).json({ ok: false, error: "BAD_KEY" });
  }

  const userRow = ensureUser(a.tgUser, null);
  const user = refreshDerivedStats(userRow);

  const upgrades = getUpgrades(user.id);
  const currentLevel = upgrades[key] || 0;
  const price = upgradePrice(key, currentLevel);

  if (user.balance < price) return res.status(400).json({ ok: false, error: "NO_MONEY", price });

  // pay + upgrade
  updateUserFields(user.id, { balance: user.balance - price });
  setUpgradeLevel(user.id, key, currentLevel + 1);

  const refreshed = refreshDerivedStats(getUserByTelegramId(user.telegram_id));
  res.json({ ok: true, upgradeKey: key, newLevel: currentLevel + 1, balance: refreshed.balance, user: refreshed });
});

app.post("/buy-building", (req, res) => {
  const a = auth(req);
  if (!a.ok) return res.status(401).json(a);

  const userRow = ensureUser(a.tgUser, null);
  const user = refreshDerivedStats(userRow);

  const nextBuildingLevel = user.level; // for MVP: buy current level's building to advance to next
  const def = LEVELS[nextBuildingLevel - 1];
  if (!def) return res.status(400).json({ ok: false, error: "NO_DEF" });

  // already purchased?
  const has = db.prepare("SELECT 1 FROM buildings WHERE user_id = ? AND building_level = ?").get(user.id, nextBuildingLevel);
  if (has) return res.status(400).json({ ok: false, error: "ALREADY" });

  if (user.balance < def.buildingCost) return res.status(400).json({ ok: false, error: "NO_MONEY", price: def.buildingCost });

  db.prepare("INSERT INTO buildings (user_id, building_level, purchased_at) VALUES (?, ?, ?)").run(user.id, nextBuildingLevel, nowMs());
  updateUserFields(user.id, { balance: user.balance - def.buildingCost });

  // level up when building is purchased (max 15)
  const newLevel = Math.min(15, user.level + 1);
  updateUserFields(user.id, { level: newLevel });

  const refreshed = refreshDerivedStats(getUserByTelegramId(user.telegram_id));
  res.json({ ok: true, buildingLevel: nextBuildingLevel, newLevel, balance: refreshed.balance, user: refreshed });
});

app.get("/leaderboard", (req, res) => {
  const rows = db
    .prepare("SELECT username, telegram_id, total_earned, level FROM users ORDER BY total_earned DESC LIMIT 50")
    .all();
  res.json({ ok: true, top: rows });
});

app.get("/quests", (req, res) => {
  const a = auth(req);
  if (!a.ok) return res.status(401).json(a);

  const userRow = ensureUser(a.tgUser, null);
  const user = refreshDerivedStats(userRow);

  const rows = db.prepare("SELECT quest_key, quest_type, progress, target, reward, status FROM quests WHERE user_id = ?").all(user.id);
  res.json({ ok: true, quests: rows });
});

app.post("/quests/claim", (req, res) => {
  const a = auth(req);
  if (!a.ok) return res.status(401).json(a);

  const questKey = String(req.body?.questKey || "");
  const userRow = ensureUser(a.tgUser, null);
  const user = refreshDerivedStats(userRow);

  const q = db.prepare("SELECT * FROM quests WHERE user_id = ? AND quest_key = ?").get(user.id, questKey);
  if (!q) return res.status(404).json({ ok: false, error: "NO_QUEST" });
  if (q.status !== "active") return res.status(400).json({ ok: false, error: "NOT_ACTIVE" });
  if (q.progress < q.target) return res.status(400).json({ ok: false, error: "NOT_DONE" });

  db.prepare("UPDATE quests SET status = 'claimed', updated_at = ? WHERE user_id = ? AND quest_key = ?").run(nowMs(), user.id, questKey);
  updateUserFields(user.id, { balance: user.balance + q.reward, total_earned: user.total_earned + q.reward });

  const refreshed = getUserByTelegramId(user.telegram_id);
  res.json({ ok: true, reward: q.reward, balance: refreshed.balance });
});

app.listen(PORT, () => {
  console.log(`PostCoin backend listening on :${PORT}`);
});

startBot({ botToken: BOT_TOKEN });
