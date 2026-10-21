import assert from "node:assert/strict";
import fs from "node:fs";
import * as THREE from "three";
import { bindFighterRig, getFighterPose, applyFighterPose } from "../src/fighter-animation.js";
import { getMove, attackTotal } from "../src/combat.js";
import { getEnemyPose } from "../src/enemy-animation.js";
import { ENEMY_MODELS, enemyModelProfile } from "../src/enemy-models.js";

// Rebuild the actual glTF joint hierarchy without loading materials or a browser.
function assetRig(file) {
  const data = JSON.parse(fs.readFileSync(new URL(file, import.meta.url)));
  const joints = new Set(data.skins.flatMap((skin) => skin.joints));
  const nodes = data.nodes.map((node, index) => {
    const object = joints.has(index) ? new THREE.Bone() : new THREE.Group();
    object.name = node.name || "";
    if (node.translation) object.position.fromArray(node.translation);
    if (node.rotation) object.quaternion.fromArray(node.rotation);
    if (node.scale) object.scale.fromArray(node.scale);
    return object;
  });
  data.nodes.forEach((node, index) => (node.children || []).forEach((child) => nodes[index].add(nodes[child])));
  const outfit = new THREE.Group(), root = new THREE.Group();
  data.scenes[data.scene || 0].nodes.forEach((node) => outfit.add(nodes[node]));
  root.add(outfit);
  return bindFighterRig(root, outfit);
}

for (const fighter of ["lin", "qiao", "tie"]) {
  const sex = fighter === "qiao" ? "Female" : "Male";
  const rig = assetRig("../public/assets/models/quaternius-outfits/" + sex + "_Peasant.gltf");
  const point = (name) => rig.root.worldToLocal(rig.bones.get(name).getWorldPosition(new THREE.Vector3()));
  const idle = getFighterPose({ action: "idle" }, fighter, 0);
  applyFighterPose(rig, idle);
  const guardHand = point("hand_l");
  assert.ok(guardHand.z > .20, fighter + " has a forward guard instead of a T pose");
  for (const action of ["light", "heavy", "air", "special", "finisher"]) {
    const move = ["special", "finisher"].includes(action) ? { startup: .26, active: .25, recovery: .5 } : getMove(fighter, action);
    const state = { action, comboStep: 0, attack: { move }, actionTotal: attackTotal(move), airborne: action === "air" };
    for (const elapsed of [0, move.startup / 2, move.startup, move.startup + move.active / 2, attackTotal(move)]) {
      const pose = getFighterPose({ ...state, actionElapsed: elapsed }, fighter, 0);
      applyFighterPose(rig, pose);
      for (const { bone } of rig.all) assert.ok(bone.quaternion.toArray().every(Number.isFinite), fighter + " " + action + " has finite joint rotations");
      for (const side of ["l", "r"]) {
        const upper = point("upperarm_" + side), elbow = point("lowerarm_" + side), hand = point("hand_" + side);
        assert.ok(Math.abs(upper.distanceTo(elbow) - .2511) < .015, "upper arms keep their physical length");
        assert.ok(Math.abs(elbow.distanceTo(hand) - .2404) < .015, "forearms keep their physical length");
      }
    }
  }
  const move = getMove(fighter, "light", 0);
  const strike = getFighterPose({ action: "light", comboStep: 0, attack: { move }, actionElapsed: move.startup }, fighter, 0);
  applyFighterPose(rig, strike);
  assert.ok(point("hand_l").z + strike.rootForward - guardHand.z > .25, fighter + " actually extends a fist at the hit frame");
  applyFighterPose(rig, idle);
  assert.ok(point("hand_l").distanceTo(guardHand) < .001, "repeated animations return to guard without accumulating joint errors");
}
console.log("male/female asset rigs: guard, 15 attacks, limb lengths and hit-frame extension passed");

const bossStyles = ["ram", "dart", "slam", "feint", "tactician"];
let enemyFrames = 0;
for (const [key, profile] of Object.entries(ENEMY_MODELS)) {
  const boss = bossStyles.includes(key);
  const outfit = (profile.form.startsWith("female") ? "Female" : "Male") + (profile.form.includes("ranger") ? "_Ranger" : "_Peasant");
  const rig = assetRig("../public/assets/models/quaternius-outfits/" + outfit + ".gltf");
  rig.root.scale.set(profile.width * profile.height, profile.height, profile.depth * profile.height);
  for (const facing of [-1, 1]) for (const kind of ["line", "charge", "projectile", "slam", "sweep"]) {
    const move = { startup: .7, active: .2, recovery: .8, kind };
    const base = { type: boss ? "boss" : key, style: key, boss, facing, move };
    for (const frame of [
      { state: "idle", action: "idle" }, { state: "walk", action: "idle", moveT: .3 },
      { state: "windup", action: "warning", windup: .7 }, { state: "windup", action: "warning", windup: .01 },
      { state: "strike", action: "heavy", strikeT: .2 }, { state: "recover", action: "idle", recoverT: .8 },
      { state: "recover", action: "idle", recoverT: 0 }, { state: "hurt", action: "hit", hurtT: .15 },
      { state: "idle", action: "warning", guard: true }, { state: "hurt", action: "hit", airborne: true, hurtT: .15 }
    ]) {
      const pose = getEnemyPose({ ...base, ...frame }, .3);
      rig.root.rotation.y = facing * 1.43;
      applyFighterPose(rig, pose);
      for (const { bone } of rig.all) assert.ok(bone.quaternion.toArray().every(Number.isFinite), key + " " + kind + " " + frame.state + " finite joints");
      for (const side of ["l", "r"]) {
        const local = (name) => rig.root.worldToLocal(rig.bones.get(name).getWorldPosition(new THREE.Vector3()));
        const upper = local("upperarm_" + side), elbow = local("lowerarm_" + side), hand = local("hand_" + side);
        assert.ok(Math.abs(upper.distanceTo(elbow) - .2511) < .015, key + " preserves upper arm length with body proportions");
        assert.ok(Math.abs(elbow.distanceTo(hand) - .2404) < .015, key + " preserves forearm length with body proportions");
        const target = new THREE.Vector3(...pose.hands[side]);
        if (target.distanceTo(upper) < .47) assert.ok(hand.distanceTo(target) < .03, key + " hand reaches its target with nonuniform body proportions");
      }
      enemyFrames++;
    }
    const guard = getEnemyPose({ ...base, state: "idle", action: "idle" }, .3);
    const recovered = getEnemyPose({ ...base, state: "recover", action: "idle", recoverT: 0 }, .3);
    for (const side of ["l", "r"]) assert.deepEqual(recovered.hands[side], guard.hands[side], "enemy returns to guard after recovery");
  }
  assert.equal(enemyModelProfile({ ...profile, type: key, boss, style: key, phase: 1 }).key, key);
}
assert.notEqual(enemyModelProfile({ boss: true, style: "tactician", phase: 1 }).modelKey,
  enemyModelProfile({ boss: true, style: "tactician", phase: 2 }).modelKey, "final boss appearance updates in phase two");
console.log("11 enemy/Boss profiles and " + enemyFrames + " rig frames passed (both facings, guard, warning, 5 attacks, recovery, hurt, airborne)");
