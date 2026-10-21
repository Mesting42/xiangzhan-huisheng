import assert from "node:assert/strict";
import { Game } from "../src/game.js";
import { FIGHTERS } from "../src/data.js";
import { getFighterPose } from "../src/fighter-animation.js";
import { rollProtected } from "../src/battle-rules.js";

function fixture(fighter, facing = 1, x = 0) {
  const game = Object.create(Game.prototype);
  game.player = { id: "player", x, y: 0, z: 0, facing, speed: fighter.speed, dodgeScale: fighter.dodge,
    invulnerable: 0, hurtT: 0, dodgeCooldown: 0, attackCooldown: 0, dodgeT: 0, stunT: 0,
    vx: 0, vz: 0, jumpVelocity: 0, action: "idle", actionElapsed: 0, actionTotal: .35,
    attack: null, queuedLight: false, airborne: false, moveT: 0 };
  game.enemies = []; game.tutorial = { enabled: false };
  game.renderer = { getWorldBounds: () => ({ minX: -6, maxX: 6, minZ: -2, maxZ: 2 }), spawnDust() {} };
  game.audio = { sound() {} }; game.ui = { toast() {} };
  return game;
}
const neutral = { pressed: {}, moveX: 0, moveZ: 0 };
for (const fighter of FIGHTERS) for (const facing of [-1,1]) {
  const game = fixture(fighter, facing), p = game.player;
  game.updatePlayer(1 / 120, { ...neutral, pressed: { dodge: true } });
  assert.equal(p.action, "dodge");
  assert.equal(p.dodgeDirection, facing, "a roll with no stick input goes forward");
  assert.ok(Math.abs(p.x) < .01, "roll begins with continuous motion, not a teleport");
  assert.equal(rollProtected(p), false, "the initial tuck is vulnerable");
  assert.equal(rollProtected({ ...p, actionElapsed: p.actionTotal * .4 }), true, "the central rotation protects the player");
  assert.equal(rollProtected({ ...p, actionElapsed: p.actionTotal * .95 }), false, "landing recovery is vulnerable");
  let previous = p.x;
  for (let i = 0; i < 120; i++) {
    game.updatePlayer(1 / 120, neutral);
    assert.ok(Math.abs(p.x - previous) < .09, "roll travel remains continuous at each frame");
    previous = p.x;
  }
  assert.equal(p.action, "idle", "every fighter exits the roll and returns to guard");
  assert.equal(p.dodgeT, 0);
  assert.ok(Math.abs(p.x - facing * 1.65 * fighter.dodge) < .0001, "travel is consistent across frame rates");
  assert.equal(p.invulnerable, 0, "protection expires after the roll");
  const pose = getFighterPose({ action: "dodge", actionElapsed: .21, actionTotal: .42 }, fighter.id);
  assert.ok(pose.rollTuck > .99 && Math.abs(pose.roll - Math.PI) < .001, "the middle of the roll is tucked and inverted");
}
for (const side of [-1,1]) {
  const game = fixture(FIGHTERS[0], side, side * 5.9);
  game.updatePlayer(.01, { ...neutral, pressed: { dodge: true } });
  for (let i = 0; i < 60; i++) game.updatePlayer(.01, neutral);
  assert.equal(game.player.x, side * 6, "roll cannot leave the arena");
  assert.equal(game.player.action, "idle", "a wall does not lock the roll animation");
}
const reverse = fixture(FIGHTERS[0]);
reverse.updatePlayer(.01, { ...neutral, moveX: -1, pressed: { dodge: true } });
assert.equal(reverse.player.dodgeDirection, -1, "stick direction controls the roll");
reverse.updatePlayer(.01, { ...neutral, moveX: 1 });
assert.equal(reverse.player.facing, -1, "facing cannot flip halfway through a roll");
const airborne = fixture(FIGHTERS[0]); airborne.player.y = 1; airborne.player.airborne = true;
airborne.updatePlayer(.01, { ...neutral, pressed: { dodge: true } });
assert.notEqual(airborne.player.action, "dodge", "a ground roll cannot begin in mid-air");
console.log("roll controls: 3 fighters, both directions, continuous travel, guard recovery, immunity expiry, walls and airborne restrictions passed");
