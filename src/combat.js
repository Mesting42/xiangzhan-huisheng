export const MOVEBOOK = {
  lin: {
    light: [
      { name: "直拳", startup: .105, active: .13, recovery: .22, range: 1.55, damage: 13, knock: .68, stun: .38, height: "mid" },
      { name: "横掌", startup: .09, active: .15, recovery: .23, range: 1.64, damage: 16, knock: .98, stun: .46, height: "mid" },
      { name: "挑肘", startup: .15, active: .17, recovery: .38, range: 1.75, damage: 23, knock: 3.2, stun: .78, height: "high", launch: .95, guardBreak: true }
    ],
    heavy: { name: "沉桥靠", startup: .3, active: .19, recovery: .51, range: 1.9, damage: 30, knock: 4.7, stun: .72, height: "mid", guardBreak: true },
    air: { name: "落步踢", startup: .12, active: .18, recovery: .29, range: 1.68, damage: 20, knock: 1.8, stun: .48, height: "high", launch: .35 }
  },
  qiao: {
    light: [
      { name: "快手点", startup: .065, active: .105, recovery: .17, range: 1.32, damage: 9, knock: .52, stun: .29, height: "mid" },
      { name: "回身肘", startup: .065, active: .11, recovery: .18, range: 1.42, damage: 11, knock: .72, stun: .31, height: "mid" },
      { name: "雙影踢", startup: .09, active: .13, recovery: .21, range: 1.5, damage: 14, knock: 1.2, stun: .34, height: "high" },
      { name: "穿門掌", startup: .1, active: .15, recovery: .32, range: 1.75, damage: 20, knock: 2.8, stun: .58, height: "mid", guardBreak: true }
    ],
    heavy: { name: "踩線踹", startup: .2, active: .16, recovery: .37, range: 1.85, damage: 23, knock: 3.3, stun: .6, height: "low", guardBreak: true },
    air: { name: "飛燕剪", startup: .08, active: .16, recovery: .23, range: 1.6, damage: 16, knock: 1.5, stun: .4, height: "high", launch: .3 }
  },
  tie: {
    light: [
      { name: "磐石拳", startup: .19, active: .18, recovery: .32, range: 1.65, damage: 21, knock: 1.1, stun: .5, height: "mid" },
      { name: "搬山臂", startup: .2, active: .2, recovery: .44, range: 1.85, damage: 30, knock: 4.3, stun: .72, height: "mid", launch: .45 }
    ],
    heavy: { name: "翻山摔", startup: .4, active: .21, recovery: .58, range: 2.05, damage: 41, knock: 5.4, stun: .9, height: "low", launch: .8, guardBreak: true },
    air: { name: "墜石肘", startup: .16, active: .2, recovery: .33, range: 1.82, damage: 28, knock: 2.3, stun: .58, height: "high", launch: .45 }
  }
};

export function getMove(fighterId, kind, comboIndex = 0) {
  const book = MOVEBOOK[fighterId] || MOVEBOOK.lin;
  if (kind === "light") {
    const index = Number.isFinite(comboIndex) ? Math.max(0, Math.min(Math.trunc(comboIndex), book.light.length - 1)) : 0;
    return book.light[index];
  }
  return book[kind] || book.heavy;
}

export function nextComboStep(fighterId, previousStep, lastAttackAt, now) {
  const count = (MOVEBOOK[fighterId] || MOVEBOOK.lin).light.length;
  const continuing = Number.isInteger(previousStep) && previousStep >= 0 && now - lastAttackAt <= 1.1;
  return continuing ? (previousStep + 1) % count : 0;
}

export function attackTotal(move) {
  return move.startup + move.active + move.recovery;
}

export function inActiveWindow(move, elapsed) {
  return elapsed >= move.startup && elapsed <= move.startup + move.active;
}

export function resolveHit(attacker, target, move, options = {}) {
  const dx = target.x - attacker.x;
  const dz = Math.abs(target.z - attacker.z);
  const forward = attacker.facing >= 0 ? dx : -dx;
  const targetHeight = (target.y || 0) + (target.height || 1);
  const attackerHeight = (attacker.y || 0);
  const lowReach = options.lowReach ?? move.height === "low";
  if (forward < -.12 || forward > move.range) return { hit: false, reason: "facing" };
  if (dz > (options.laneTolerance ?? .95)) return { hit: false, reason: "lane" };
  if (targetHeight < attackerHeight + (lowReach ? .15 : 0)) return { hit: false, reason: "height" };
  if ((target.y || 0) - attackerHeight > (move.height === "high" ? 1.65 : 1.15)) return { hit: false, reason: "height" };
  if (target.invulnerable > 0) return { hit: false, reason: "protected" };
  const flanked = target.facing != null && (attacker.x - target.x) * target.facing < -.05;
  if (target.guard && !flanked && !move.guardBreak && !options.unblockable) return { hit: false, reason: "guard" };
  const scale = options.damageScale ?? 1;
  return {
    hit: true, flanked,
    damage: Math.max(1, Math.round(move.damage * scale)),
    knock: move.knock * (options.knockScale ?? 1),
    stun: move.stun * (options.stunScale ?? 1),
    launch: move.launch || 0,
    guardBreak: Boolean(move.guardBreak)
  };
}

export function resolveEnemyHit(enemy, player, move) {
  return resolveHit(enemy, player, move, { laneTolerance: .82, unblockable: false });
}

export function gradeEncounter({ hits, damageTaken, timeSeconds, defeated, difficultyBonus = 1 }) {
  const score = Math.round((hits * 300 + Math.max(0, 250 - damageTaken) * 22 + Math.max(0, 480 - timeSeconds) * 12) * difficultyBonus);
  const grade = !defeated && damageTaken < 35 && timeSeconds < 180 ? "S" : score > 14000 ? "A" : score > 8500 ? "B" : "C";
  return { score, grade };
}
