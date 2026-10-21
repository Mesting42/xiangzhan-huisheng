// Swept collision prevents fast throws from skipping a target between frames.
export function projectileContact(from, to, target, radius = .52) {
  if (target.health <= 0 || target.invulnerable > 0 || target.juggleLocked || target.grabbedBy) return null;
  const dx = to.x - from.x, dz = (to.z - from.z) * 1.2;
  const px = target.x - from.x, pz = (target.z - from.z) * 1.2;
  const t = Math.max(0, Math.min(1, (px * dx + pz * dz) / Math.max(.000001, dx * dx + dz * dz)));
  const y = from.y + (to.y - from.y) * t;
  if (Math.hypot(px - dx * t, pz - dz * t) > radius || y < (target.y || 0) + .2 || y > (target.y || 0) + 1.95) return null;
  return t;
}
