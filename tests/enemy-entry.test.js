import assert from "node:assert/strict";
import { Game } from "../src/game.js";
import { LEVELS } from "../src/data.js";
import { planEnemyEntries, placeEnemyEntry, stepEnemyEntry } from "../src/enemy-entry.js";

const bounds = { minX: -6, maxX: 6, minZ: -2.15, maxZ: 2.15 };
const view = { minX: -8.7, maxX: 8.7 };
const tickets = planEnemyEntries(["swift", "guard", "ranged", "charger"], { playerX: -2, wave: 1 });
assert.deepEqual(tickets.map((t) => t.side), [1, -1, 1, -1], "a wave enters from both sides in alternating batches");
assert.ok(tickets[0].delay >= .9, "there is time to see the entrance cue before the first actor appears");
for (let i = 1; i < tickets.length; i++) assert.ok(tickets[i].delay - tickets[i - 1].delay >= .6 - 1e-9, "individual arrivals are staggered");
assert.equal(planEnemyEntries(["swift"], { playerX: 5 })[0].side, -1, "the first enemy enters from the side away from a player camping an edge");

for (const half of [2.4, 4.5, 7.5, 15]) for (const side of [-1, 1]) {
  const play = { minX: -half, maxX: half };
  const screen = { minX: -half - 2.7, maxX: half + 2.7 };
  const enemy = { speed: 3, health: 40 };
  placeEnemyEntry(enemy, { side, z: .8 }, play, screen);
  assert.ok(side > 0 ? enemy.x > screen.maxX + 1 : enemy.x < screen.minX - 1, "models start wholly beyond the viewport at every aspect ratio");
  let steps = 0;
  while (enemy.entry && steps++ < 600) {
    const oldX = enemy.x;
    stepEnemyEntry(enemy, 1 / 60, { x: 0, z: -1 }, play);
    assert.ok(Math.abs(enemy.x - oldX) <= 6.2 / 60 + 1e-8, "entry is continuous movement rather than a teleport");
  }
  assert.equal(enemy.entry, null, "entry eventually completes even on ultrawide and portrait screens");
  assert.ok(enemy.x >= play.minX && enemy.x <= play.maxX, "entry completes within the playable area");
  assert.ok(enemy.cooldown >= .9, "a newly arrived enemy gives a fair response window");
}

const blockingPlayer = { x: 5.8, z: 0 };
const blocked = placeEnemyEntry({ speed: 4 }, { side: 1, z: 0 }, bounds, view);
while (blocked.entry) stepEnemyEntry(blocked, .05, blockingPlayer, bounds);
assert.ok(blocked.x - blockingPlayer.x >= .79, "an incoming enemy stops in front of the player instead of running through them");

function gameFixture(level = 0, difficulty = "standard") {
  const game = Object.create(Game.prototype);
  Object.assign(game, {
    mode: "play", selectedDifficulty: difficulty, currentLevel: LEVELS[level], levelIndex: level,
    waveIndex: 0, waveSpawned: false, bossStarted: false, transitionT: 0, bossIntroT: 0,
    enemyEntryQueue: [], enemies: [], projectiles: [], drops: [], nextEntityId: 1,
    gameTime: 0, hitStop: 0, comboTimer: 0,
    player: { id: "player", x: 2.2, z: 0, y: 0, health: 100, maxHealth: 100, invulnerable: 999,
      score: 0, hits: 0, energy: 0, lastHitAt: -10, comboCount: 0, bestCombo: 0, facing: 1 },
    renderer: { getWorldBounds: () => bounds, getEntryBounds: () => view, setLevel() {}, spawnDust() {}, spawnHit() {}, shake() {} },
    audio: { sound() {}, startMusic() {}, stopMusic() {} }, ui: { toast() {}, render() {} },
    input: { clear() {}, sample: () => ({ pressed: {} }) }, spawnDrop() {},
    goto(mode) { this.mode = mode; }
  });
  return game;
}

const waiting = gameFixture();
waiting.spawnWave(1);
assert.equal(waiting.enemies.length, 0, "announcing a wave does not insert enemies inside the arena");
const originalX = waiting.player.x;
waiting.updateRoomFlow(5);
assert.equal(waiting.waveIndex, 1, "pending enemies prevent a false empty-wave clear");
assert.equal(waiting.player.x, originalX, "the player stays in place between encounters");
waiting.updateEnemyEntries(1.0);
assert.equal(waiting.enemies.length, 1, "only the first scheduled actor is released");
assert.equal(waiting.enemyEntryQueue.length, 1, "later actors stay in the queue");
const entering = waiting.enemies[0];
waiting.startEnemyWindup(entering);
assert.equal(entering.move, undefined, "an incoming ranged or melee actor cannot start an attack");
assert.equal(waiting.checkEnemyStrike(entering), false, "entry actors cannot damage the player");
entering.health = 0; entering.state = "ko";
waiting.updateRoomFlow(5);
assert.equal(waiting.waveIndex, 1, "killing the early entrant cannot skip a delayed second entrant");

const intercepted = gameFixture();
intercepted.spawnWave(0); intercepted.updateEnemyEntries(1);
intercepted.applyPlayerHit(intercepted.enemies[0], { damage: 10 }, { damage: 10, knock: 1, stun: .3 });
assert.equal(intercepted.enemies[0].entry, null, "a visible entry can be intercepted normally with an attack");
assert.equal(intercepted.enemies[0].health, intercepted.enemies[0].maxHealth - 10, "incoming enemies are not given artificial damage immunity");

let campaigns = 0;
for (const difficulty of ["story", "standard", "master"]) for (let level = 0; level < 5; level++) {
  const game = gameFixture(level, difficulty);
  const seen = new Set();
  let ticks = 0;
  while (!game.bossStarted && ticks++ < 2400) {
    game.gameTime += .05;
    game.updateEnemies(.05);
    for (const enemy of game.enemies) {
      if (enemy.health > 0 && !enemy.entry) { seen.add(enemy.id); enemy.health = 0; game.killEnemy(enemy); }
    }
    game.updateRoomFlow(.05);
  }
  assert.equal(game.mode, "bossIntro", "every designed wave progresses to the separate Boss entry");
  assert.ok(seen.size >= 5, "the planned enemy groups have been played through");
  assert.equal(game.enemies.length, 0, "Boss announcement begins before the model is created off screen");
  assert.equal(game.player.x, 2.2, "wave transitions preserve the player's location");
  game.startBossFight();
  assert.equal(game.mode, "bossIntro", "pressing the intro button never teleports an unfinished entrant");
  while (game.mode === "bossIntro" && ticks++ < 3000) game.update(.05);
  assert.equal(game.mode, "play", "Boss entry finishes and the fight begins");
  assert.equal(game.enemies.length, 1, "Boss has a solo entrance");
  assert.equal(game.enemies[0].boss, true);
  assert.equal(game.enemies[0].entry, null);
  assert.ok(game.enemies[0].x >= bounds.minX && game.enemies[0].x <= bounds.maxX, "Boss stands inside the arena before combat");
  campaigns++;
}

const support = gameFixture(4);
const boss = support.makeBoss(); support.enemies = [boss];
support.changeBossPhase(boss);
assert.equal(support.enemies.length, 1, "Boss reinforcements are not created in the middle of the arena");
assert.equal(support.enemyEntryQueue.length, 2, "phase-two support uses the same staggered entrances");
boss.health = 0; support.killEnemy(boss);
assert.equal(support.enemyEntryQueue.length, 0, "defeating a Boss cancels pending reinforcement spawns");

const paused = gameFixture(); paused.mode = "bossIntro";
paused.pauseGame(); assert.equal(paused.modeBeforePause, "bossIntro");
paused.resumeGame(); assert.equal(paused.mode, "bossIntro", "pausing and resuming keeps the entrance sequence intact");
console.log("enemy entries: " + campaigns + " chapter/difficulty flows, off-screen/staggered arrivals, interception, waiting-wave guard, solo Boss, reinforcement cancellation and pause passed");
