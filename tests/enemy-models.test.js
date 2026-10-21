import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { WorldRenderer } from "../src/renderer.js";
import { ENEMY_MODELS, enemyModelProfile } from "../src/enemy-models.js";
import { FIGHTERS } from "../src/data.js";

// Load the real glTF geometry and buffers in Node. GPU texture upload is not
// needed for checking skinning; texture URI existence is checked separately.
globalThis.ProgressEvent ||= class ProgressEvent { constructor(type, data) { this.type = type; Object.assign(this, data); } };
const previousFetch = globalThis.fetch;
globalThis.fetch = async (resource, ...args) => {
  const url = typeof resource === "string" ? resource : resource.url;
  if (url.startsWith("file:")) {
    const data = await fs.readFile(fileURLToPath(url));
    return new Response(data, { headers: { "Content-Length": String(data.length) } });
  }
  return previousFetch(resource, ...args);
};

const loader = new GLTFLoader();
loader.register(() => ({ name: "LOCAL_TEST_TEXTURES", loadTexture: () => Promise.resolve(new THREE.Texture()) }));
async function load(relative) {
  const url = new URL("../public/assets/models/" + relative, import.meta.url);
  const text = await fs.readFile(url, "utf8");
  const json = JSON.parse(text);
  for (const entry of [...json.buffers, ...json.images]) if (entry.uri) await fs.access(new URL(entry.uri, url));
  return (await loader.parseAsync(text, new URL("./", url).href)).scene;
}
const maleHead = await load("quaternius/Superhero_Male_FullBody.gltf");
const femaleHead = await load("quaternius/Superhero_Female_FullBody.gltf");
const world = Object.create(WorldRenderer.prototype);
world.keepBaseHead(maleHead); world.keepBaseHead(femaleHead);
assert.ok(maleHead.userData.hasHeadMesh && femaleHead.userData.hasHeadMesh, "both base heads contain visible skinned geometry");
world.characterTemplates = new Map();
for (const [key, sex, outfit] of [["male", "Male", "Peasant"], ["female", "Female", "Peasant"], ["male-ranger", "Male", "Ranger"], ["female-ranger", "Female", "Ranger"]]) {
  world.characterTemplates.set(key, { outfit: await load("quaternius-outfits/" + sex + "_" + outfit + ".gltf"), head: sex === "Male" ? maleHead : femaleHead });
}
world.actors = new Map(); world.actorGroup = new THREE.Group(); world.healthBarGroup = new THREE.Group();
world.camera = new THREE.OrthographicCamera(-8, 8, 4.5, -4.5, .1, 90);
world.canvas = { clientWidth: 1280, clientHeight: 720 }; world.ambientTime = .3; world.frameDelta = .016;
world.neutralClothTexture = (texture) => texture;
let checkedVertices = 0;
const bosses = ["ram", "dart", "slam", "feint", "tactician"];
for (const [key, profile] of Object.entries(ENEMY_MODELS)) {
  const boss = bosses.includes(key);
  const id = "test-" + key;
  const state = { id, type: boss ? "boss" : key, style: key, boss, phase: 1, health: 100, maxHealth: 100, x: 0, y: 0, z: 0, facing: 1, action: "idle", state: "idle" };
  const sync = (changes) => {
    Object.assign(state, changes);
    state.visual = world.enemyVisual(state);
    world.syncOne(id, state);
    const actor = world.actors.get(id);
    actor.group.updateMatrixWorld(true);
    return actor;
  };
  let actor = sync({});
  assert.equal(actor.enemyModel.key, key, "every type attaches its imported model");
  assert.equal(actor.body.visible, false, "old procedural body is hidden");
  assert.equal(actor.costume, profile.costume, "every enemy wears its own cut and equipment");
  assert.ok(actor.modelRoot.getObjectByName("enemy-hair-" + profile.hair), "enemy hair does not reuse the hero fringe");
  assert.ok(actor.modelRoot.getObjectByName("costume-" + profile.costume), "modern garment geometry is attached to the spine");
  assert.equal(actor.hpBar.visible, !boss, "ordinary/elite health bars remain visible; Boss uses HUD");
  const hasMeshes = [];
  actor.modelRoot.traverse((node) => { if (node.isSkinnedMesh && node.visible) hasMeshes.push(node); });
  assert.ok(hasMeshes.length >= 5, key + " has imported head and clothed body parts");
  for (const frame of [
    { action: "warning", state: "windup", windup: .02 },
    { action: "heavy", state: "strike", strikeT: .15 },
    { action: "hit", state: "hurt", hurtT: .18, airborne: true, y: .8 },
    { action: "idle", state: "recover", recoverT: 0, airborne: false, y: 0, facing: -1 }
  ]) {
    actor = sync({ ...frame, move: { startup: .7, active: .2, recovery: .8, kind: key === "ranged" || key === "dart" ? "projectile" : key === "slam" || key === "heavy" ? "slam" : key === "charger" || key === "ram" ? "charge" : "line" } });
    for (const mesh of hasMeshes) {
      mesh.skeleton.update();
      const position = mesh.geometry.getAttribute("position");
      const step = Math.max(1, Math.floor(position.count / 100));
      for (let index = 0; index < position.count; index += step) {
        const vertex = new THREE.Vector3().fromBufferAttribute(position, index);
        mesh.applyBoneTransform(index, vertex).applyMatrix4(mesh.matrixWorld);
        assert.ok(vertex.toArray().every(Number.isFinite), key + " actual skinned vertices remain finite");
        assert.ok(Math.abs(vertex.x - state.x) < 4 && Math.abs(vertex.y - state.y) < 4 && Math.abs(vertex.z - state.z) < 4, key + " geometry stays attached to its skeleton");
        checkedVertices++;
      }
    }
  }
  if (key === "tactician") {
    actor = sync({ phase: 2 });
    assert.equal(actor.enemyModel.phase2, true, "final Boss swaps appearance at phase change");
    assert.equal(actor.modelKey, enemyModelProfile(state).modelKey);
  }
  sync({ health: 0 });
  assert.equal(actor.group.visible, false, "defeated model disappears");
  assert.equal(actor.hpBar.visible, false, "defeated enemy health bar disappears");
  world.resetActor(id);
  assert.equal(world.healthBarGroup.children.length, 0, "switching opponents clears old bars");
}
let rollVertices = 0;
for (const fighter of FIGHTERS) for (const facing of [-1, 1]) {
  let low = Infinity, high = -Infinity;
  for (let frame = 0; frame <= 40; frame++) {
    const state = { id: "player", visual: world.fighterVisual(fighter), x: 0, y: 0, z: 0, facing,
      dodgeDirection: facing, action: "dodge", actionTotal: .42 * fighter.dodge,
      actionElapsed: frame / 40 * .42 * fighter.dodge };
    world.syncOne("player", state);
    const actor = world.actors.get("player"); actor.group.updateMatrixWorld(true);
    assert.ok(Math.abs(actor.modelPose.rotation.z + facing * Math.PI * 2) < .0001 || frame < 40, "the body completes a full forward rotation");
    actor.modelRoot.traverseVisible(mesh => {
      if (!mesh.isSkinnedMesh) return;
      mesh.skeleton.update();
      const position = mesh.geometry.getAttribute("position");
      for (let i = 0; i < position.count; i += Math.max(1, Math.floor(position.count / 250))) {
        const vertex = new THREE.Vector3().fromBufferAttribute(position, i);
        mesh.applyBoneTransform(i, vertex).applyMatrix4(mesh.matrixWorld);
        assert.ok(vertex.toArray().every(Number.isFinite), "roll has finite skinned vertices");
        low = Math.min(low, vertex.y); high = Math.max(high, vertex.y); rollVertices++;
      }
    });
  }
  assert.ok(low > -.08, fighter.id + " roll stays above pavement: " + low);
  assert.ok(high < 2.6, fighter.id + " roll stays close to the ground: " + high);
  world.syncOne("player", { visual: world.fighterVisual(fighter), x: 0, y: 0, z: 0, facing, action: "idle" });
  assert.equal(world.actors.get("player").modelPose.rotation.z, 0, "the model returns upright after a roll");
}
console.log("3 fighters, both facings: " + rollVertices + " rolling skinned vertices, full rotation, floor clearance and upright recovery passed");

globalThis.fetch = previousFetch;
console.log("11 real glTF enemy/Boss models: " + checkedVertices + " skinned vertices, local resources, head/clothes, phase change and health-bar cleanup passed");

// Reuse the GPU-free asset world for local mesh inspection artifacts.
export { world };
