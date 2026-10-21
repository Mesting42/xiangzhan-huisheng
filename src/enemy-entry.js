const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function planEnemyEntries(types, { playerX = 0, playerZ = 0, wave = 0, delay = .95, stagger = .62, boss = false } = {}) {
  const firstSide = playerX <= 0 ? 1 : -1;
  const lanes = [-.8, .8, 0, -1.4, 1.4];
  return types.map((type, index) => ({
    type, boss, side: index % 2 === 0 ? firstSide : -firstSide,
    delay: delay + index * stagger,
    z: boss ? 0 : clamp(playerZ * .3 + lanes[(wave + index) % lanes.length], -1.8, 1.8)
  }));
}

export function placeEnemyEntry(enemy, ticket, bounds, view) {
  const side = ticket.side;
  // Use the whole possible camera pan, not the current player's position.
  // The actor is created beyond the viewport and physically crosses its edge.
  enemy.x = side > 0 ? view.maxX + 1.2 : view.minX - 1.2;
  enemy.z = ticket.z;
  enemy.y = 0;
  enemy.facing = -side;
  enemy.state = "entering";
  enemy.action = "idle";
  enemy.guard = false;
  enemy.moveT = 0;
  enemy.entry = {
    side, targetX: side > 0 ? Math.min(7.8, bounds.maxX - .55) : Math.max(-7.8, bounds.minX + .55),
    targetZ: ticket.z,
    speed: enemy.boss ? 3.2 : clamp((enemy.speed || 3) * 1.4, 4.4, 6.2)
  };
  enemy.cooldown = Math.max(enemy.cooldown || 0, 1);
  return enemy;
}

export function stepEnemyEntry(enemy, dt, player, bounds) {
  const entry = enemy.entry;
  if (!entry) return true;
  entry.targetX = clamp(entry.targetX, Math.max(-7.8, bounds.minX + .25), Math.min(7.8, bounds.maxX - .25));
  const delta = entry.targetX - enemy.x;
  const step = Math.sign(delta) * Math.min(Math.abs(delta), entry.speed * dt);
  const nextX = enemy.x + step;
  const playerBlocks = player && Math.abs(player.z - enemy.z) < .64 &&
    Math.abs(enemy.x - player.x) >= .78 && (Math.abs(nextX - player.x) < .78 || (enemy.x - player.x) * (nextX - player.x) < 0);
  enemy.x = playerBlocks ? player.x + entry.side * .8 : nextX;
  enemy.z += clamp(entry.targetZ - enemy.z, -entry.speed * dt * .5, entry.speed * dt * .5);
  enemy.facing = -entry.side;
  enemy.guard = false;
  enemy.state = "entering";
  enemy.action = "idle";
  enemy.moveT = (enemy.moveT || 0) + dt;
  if (playerBlocks || Math.abs(entry.targetX - enemy.x) < .02) {
    enemy.entry = null;
    enemy.state = "idle";
    enemy.moveT = 0;
    enemy.cooldown = Math.max(enemy.cooldown || 0, .9);
    return true;
  }
  return false;
}
