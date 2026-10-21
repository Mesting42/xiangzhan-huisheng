const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function canCancelAttack(player, into) {
  if (player.grabTarget) return false;
  const attack = player.attack;
  if (!attack) return true;
  const move = attack.move, elapsed = player.actionElapsed || 0;
  if (elapsed >= move.startup + move.active + move.recovery - .09) return true;
  if (!attack.contact || elapsed < move.startup + Math.min(.07, move.active * .45)) return false;
  if (into === "heavy") return attack.kind === "light";
  if (into === "jump") return attack.connected && move.launch > 0;
  if (into === "special" || into === "finisher") return attack.connected && ["light", "heavy", "air"].includes(attack.kind);
  return into === "dodge" && ["light", "air"].includes(attack.kind);
}

export function branchMove(base, fighter, count) {
  if (!count) return { ...base };
  const launcher = count >= 2;
  return { ...base, branch: launcher ? "launcher" : "break", name: launcher ? "挑空追击" : "截势破防",
    startup: fighter === "tie" ? (launcher ? .30 : .22) : (launcher ? .20 : .14),
    active: .17, recovery: launcher ? .42 : .25, damage: Math.round(base.damage * (launcher ? .87 : .66)),
    range: launcher ? 1.72 : 1.65, knock: launcher ? .65 : 1.65, stun: launcher ? .62 : .43,
    launch: launcher ? 1.1 : 0, guardBreak: true, staggerDamage: launcher ? 29 : 24 };
}

export function rollProtected(player) {
  if (player.action !== "dodge") return false;
  const t = player.actionElapsed / Math.max(.01, player.actionTotal);
  return t >= .16 && t <= (player.fighterId === "qiao" ? .78 : .72);
}

export function earnedEnergy(move, actual, attack) {
  if (move.noEnergy || ["special", "finisher"].includes(attack?.kind)) return 0;
  const amount = Math.min(14 - (attack?.energyGained || 0), 4.5 + Math.min(35, actual) * .16);
  return Math.max(0, amount);
}

export function staggerPower(move) {
  return move.staggerDamage || (move.guardBreak ? 28 : move.launch ? 14 : 8);
}

export function mayAttack(enemy, enemies, projectiles, clock, now, kind, difficulty) {
  if (now < (clock.nextAttackAt || 0)) return false;
  const active = enemies.filter(e => e !== enemy && e.health > 0 && ["windup", "feint", "strike"].includes(e.state));
  if (kind === "projectile") return now >= (clock.nextRangedAt || 0) &&
    !active.some(e => e.move?.kind === "projectile") && projectiles.filter(p => p.side === "enemy").length < 2;
  const melee = active.filter(e => e.move?.kind !== "projectile");
  if (melee.some(e => e.boss) || (enemy.boss && melee.length)) return false;
  return melee.length < (difficulty === "master" && !enemy.boss ? 2 : 1);
}

export function formationTarget(enemy, enemies, player) {
  const companions = enemies.filter(e => e.health > 0 && !e.boss && !e.entry).sort((a,b) => a.idNum - b.idNum);
  const index = Math.max(0, companions.indexOf(enemy));
  let side = Math.sign(enemy.x - player.x) || (index % 2 ? -1 : 1);
  let distance = enemy.type === "ranged" ? 4.2 : enemy.type === "charger" ? 2.7 : 1.25 + (index % 3) * .36;
  let z = player.z + (enemy.type === "ranged" ? (index % 2 ? -.85 : .85) : (index % 3 - 1) * .45);
  if (enemy.type === "guard") {
    const shooter = companions.find(e => e.type === "ranged");
    if (shooter) { side = Math.sign(shooter.x - player.x) || side; distance = 1.6; z = player.z * .65 + shooter.z * .35; }
  }
  if (Math.sign(enemy.x - player.x) !== side && Math.abs(enemy.x - player.x) < 1.4) {
    z = clamp(player.z + (player.z > .5 ? -1.15 : 1.15), -1.9, 1.9);
  }
  return { x: player.x + side * distance, z: clamp(z, -1.8, 1.8) };
}

export function lockAim(enemy, bounds) {
  enemy.aimLocked = true;
  enemy.facing = enemy.aimX >= enemy.x ? 1 : -1;
  const distance = Math.min(enemy.move.range, Math.max(1.2, Math.abs(enemy.aimX - enemy.x) + .6));
  enemy.chargeFrom = { x: enemy.x, z: enemy.z };
  enemy.chargeTo = { x: clamp(enemy.x + enemy.facing * distance, bounds.minX, bounds.maxX), z: clamp(enemy.aimZ, -1.8, 1.8) };
}

export function stepCharge(enemy, dt) {
  const before = { x: enemy.x, z: enemy.z };
  enemy.chargeElapsed = Math.min(enemy.move.active, (enemy.chargeElapsed || 0) + dt);
  const t = enemy.chargeElapsed / enemy.move.active, ease = t * t * (3 - 2 * t);
  enemy.x = enemy.chargeFrom.x + (enemy.chargeTo.x - enemy.chargeFrom.x) * ease;
  enemy.z = enemy.chargeFrom.z + (enemy.chargeTo.z - enemy.chargeFrom.z) * ease;
  return before;
}

export function chargeContact(before, after, player) {
  const dx = after.x - before.x, dz = (after.z - before.z) * 1.3;
  const px = player.x - before.x, pz = (player.z - before.z) * 1.3;
  const t = clamp((px * dx + pz * dz) / Math.max(.00001, dx * dx + dz * dz), 0, 1);
  return Math.hypot(px - dx * t, pz - dz * t) < .78 && player.y < 1.5;
}
