import assert from "node:assert/strict";
import { getMove, nextComboStep, attackTotal, inActiveWindow, resolveHit, resolveEnemyHit, gradeEncounter } from "../src/combat.js";

const player = { x: 0, y: 0, z: 0, facing: 1, height: 1.2, invulnerable: 0 };
const target = { x: 1, y: 0, z: .2, height: 1, invulnerable: 0 };
const linJab = getMove("lin", "light", 0);
assert.equal(inActiveWindow(linJab, .02), false, "startup has no hit");
assert.equal(inActiveWindow(linJab, .12), true, "active frame has a hit");
assert.equal(resolveHit(player, target, linJab).hit, true, "front hit connects");
assert.equal(resolveHit(player, { ...target, x: -1 }, linJab).hit, false, "attack cannot hit behind");
assert.equal(resolveHit(player, { ...target, z: 2 }, linJab).reason, "lane", "depth lanes separate attacks");
assert.equal(resolveHit(player, { ...target, invulnerable: .2 }, linJab).reason, "protected", "dodge protection is respected");
assert.equal(resolveHit(player, { ...target, guard: true }, linJab).reason, "guard", "guard blocks non-breaking attacks");
assert.equal(resolveHit(player, { ...target, guard: true }, getMove("tie", "heavy")).hit, true, "heavy guard break connects");
assert.ok(getMove("qiao", "light").startup < getMove("tie", "light").startup, "swift fighter starts faster");
assert.ok(getMove("tie", "heavy").damage > getMove("lin", "heavy").damage, "power fighter deals more damage");
assert.equal(resolveEnemyHit({ ...player, facing: 1 }, target, { ...linJab, range: .2 }).hit, false, "enemy attack uses range rule");
assert.equal(gradeEncounter({ hits: 20, damageTaken: 0, timeSeconds: 60 }).grade, "S", "clean fast clear earns S");
for (const [fighter, length] of [["lin", 3], ["qiao", 4], ["tie", 2]]) {
  let previous = -1, lastAt = -10, now = 0;
  for (let strike = 0; strike < 30; strike++) {
    const step = nextComboStep(fighter, previous, lastAt, now);
    assert.equal(step, strike % length, fighter + " cycles every move without a NaN combo index");
    const move = getMove(fighter, "light", step);
    assert.ok(Number.isFinite(attackTotal(move)) && attackTotal(move) > 0, "every chained strike can finish");
    assert.ok(inActiveWindow(move, move.startup + move.active / 2), "every chained strike has a valid hit window");
    previous = step; lastAt = now; now += attackTotal(move);
  }
  assert.equal(nextComboStep(fighter, previous, lastAt, now + 2), 0, "a delayed combo restarts");
}
assert.equal(getMove("lin", "light", NaN).name, "直拳", "invalid legacy combo state recovers to the first move");
console.log("combat rules and 90 chained strikes passed");
