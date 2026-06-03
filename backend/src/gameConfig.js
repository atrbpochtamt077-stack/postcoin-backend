export const GAME = {
  currencyName: "UzPost конверты",

  // Tap
  tapEnergyCost: 1,
  tapCountMaxPerRequest: 200,

  // Energy regen (server-side)
  // energy_regen_interval_ms means: +1 energy per this many ms
  baseEnergyMax: 100,
  baseEnergyRegenIntervalMs: 3000,

  // Tap power
  baseTapPower: 1,

  // Passive income
  // Claimed by button; we accrue claimable amount based on time since last claim.
  basePassiveIncomePerHour: 50,
  claimCooldownMs: 60 * 60 * 1000, // 1 hour

  // Referral
  referralBonus: 5000,

  // Rate limits (soft anti-abuse)
  minMsBetweenTapRequests: 800
};

export const UPGRADE_DEFS = {
  tap_power: {
    key: "tap_power",
    title: "Сила тапа",
    // tap_power = baseTapPower + level
    price: (level) => Math.round(50 * Math.pow(1.18, level))
  },
  energy_max: {
    key: "energy_max",
    title: "Макс энергия",
    // energy_max = baseEnergyMax + level*20
    price: (level) => Math.round(80 * Math.pow(1.2, level))
  },
  regen: {
    key: "regen",
    title: "Реген энергии",
    // regen_interval_ms = max(600, base - level*150)
    price: (level) => Math.round(120 * Math.pow(1.22, level))
  },
  passive: {
    key: "passive",
    title: "Пассивный доход",
    // passive_income_per_hour += 25*level (computed)
    price: (level) => Math.round(100 * Math.pow(1.25, level))
  }
};
