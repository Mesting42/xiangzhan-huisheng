import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";
import { bindFighterRig, getFighterPose, applyFighterPose } from "./fighter-animation.js";
import { getEnemyPose } from "./enemy-animation.js";
import { enemyModelProfile } from "./enemy-models.js";
import { tailorEnemyMesh, makeEnemyHair, addEnemyCostume } from "./enemy-costumes.js";

const LEVEL_LOOKS = [
  { sky: "#425b61", far: "#314746", near: "#35423d", light: 0xadc2bc, lamp: 0xeeb274, fog: 0x536765 },
  { sky: "#493d48", far: "#393641", near: "#393a36", light: 0xd0b2a1, lamp: 0xffa954, fog: 0x51464b },
  { sky: "#3f4544", far: "#343c3c", near: "#42423c", light: 0xa4b1a7, lamp: 0xee8d47, fog: 0x505754 },
  { sky: "#425b65", far: "#344a4f", near: "#3d5152", light: 0xb3c6c5, lamp: 0xc4d5d1, fog: 0x4d676c },
  { sky: "#302b2c", far: "#332f2c", near: "#443930", light: 0xcbb89a, lamp: 0xed9a60, fog: 0x493d35 }
];

function canvasTexture(canvas, repeatX = 1, repeatY = 1) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  texture.anisotropy = 4;
  return texture;
}

function tileTexture(levelIndex) {
  const c = document.createElement("canvas");
  c.width = c.height = 512;
  const ctx = c.getContext("2d");
  const palettes = [
    ["#596158", "#677068", "#444d47"],
    ["#574e45", "#695d4e", "#453f38"],
    ["#545958", "#686a63", "#414744"],
    ["#465558", "#536266", "#384649"],
    ["#544b40", "#655a49", "#443b33"]
  ];
  const colors = palettes[levelIndex % 5];
  const bg = ctx.createLinearGradient(0, 0, 0, 512);
  bg.addColorStop(0, colors[0]);
  bg.addColorStop(1, colors[1]);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 512, 512);
  let seed = 73 + levelIndex * 9187;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  if (levelIndex === 2) {
    ctx.strokeStyle = "rgba(21,27,26,.55)";
    ctx.lineWidth = 5;
    for (let y = 0; y < 512; y += 64) {
      ctx.strokeRect(0, y, 512, 64);
      for (let x = 0; x < 512; x += 48) {
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 64); ctx.stroke();
      }
      ctx.fillStyle = "rgba(217,137,67,.18)";
      ctx.fillRect(0, y + 7, 512, 2);
    }
  } else if (levelIndex === 4) {
    ctx.strokeStyle = "rgba(31,21,17,.56)";
    ctx.lineWidth = 3;
    for (let y = 0; y < 512; y += 50) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(512, y); ctx.stroke();
    }
    ctx.strokeStyle = "rgba(224,188,136,.12)";
    ctx.lineWidth = 1;
    for (let x = 0; x < 512; x += 64) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 512); ctx.stroke();
    }
  } else {
    ctx.lineWidth = 2;
    for (let y = -40; y < 560; y += 68) {
      const shift = Math.floor(y / 68) % 2 ? -35 : 0;
      for (let x = shift; x < 560; x += 104) {
        ctx.fillStyle = random() > .5 ? "rgba(221,207,171,.055)" : "rgba(16,23,21,.08)";
        ctx.fillRect(x + 2, y + 2, 100, 63);
        ctx.strokeStyle = "rgba(23,29,27,.31)";
        ctx.strokeRect(x, y, 104, 68);
        if (random() > .68) {
          ctx.fillStyle = "rgba(225,220,191,.12)";
          ctx.beginPath(); ctx.ellipse(x + random() * 84, y + random() * 50, 18 + random() * 28, 5 + random() * 8, -.2, 0, Math.PI * 2); ctx.fill();
        }
      }
    }
  }
  for (let i = 0; i < 700; i++) {
    ctx.fillStyle = random() > .5 ? "rgba(229,217,185,.05)" : "rgba(4,13,12,.07)";
    ctx.fillRect(random() * 512, random() * 512, 1 + random() * 4, 1 + random() * 3);
  }
  return canvasTexture(c, 4, 2);
}

function makeLabel(text, background, ink, width = 512, height = 176) {
  const canvas = document.createElement("canvas");
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = background; ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = ink; ctx.globalAlpha = .26;
  for (let i = 0; i < 500; i++) ctx.fillRect((i * 71) % width, (i * 139) % height, 1 + i % 4, 1);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = "rgba(241,223,184,.42)"; ctx.lineWidth = 8; ctx.strokeRect(12, 12, width - 24, height - 24);
  ctx.fillStyle = ink; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.font = "bold " + Math.floor(height * .54) + "px KaiTi, STKaiti, serif";
  ctx.fillText(text, width / 2, height / 2 + 4, width - 45);
  return canvasTexture(canvas);
}

function mat(color, roughness = .82, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness, ...extra });
}

function makeClub() {
  const group = new THREE.Group();
  const profile = [[.035,-.58],[.057,-.55],[.051,-.36],[.048,-.12],[.065,.12],[.079,.47],[.073,.55],[.035,.58]];
  const wood = new THREE.Mesh(new THREE.LatheGeometry(profile.map(([x,y])=>new THREE.Vector2(x,y)),14),mat("#a87948"));
  wood.castShadow = true; group.add(wood);
  for (let i=0;i<8;i++) {
    const wrap = new THREE.Mesh(new THREE.TorusGeometry(.055,.009,5,14),mat(i%2?"#c8af7a":"#685440"));
    wrap.rotation.x = Math.PI/2; wrap.position.y = -.38+i*.035; group.add(wrap);
  }
  return group;
}

function taperedLimb(length, topRadius, bottomRadius, material) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(bottomRadius, topRadius, length, 12, 2), material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function extractHeadGeometry(mesh) {
  if (!mesh.geometry?.attributes?.position || !mesh.geometry.attributes.skinIndex || !mesh.geometry.attributes.skinWeight || !mesh.skeleton) return null;
  const source = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
  const position = source.getAttribute("position");
  const skinIndex = source.getAttribute("skinIndex");
  const skinWeight = source.getAttribute("skinWeight");
  const headJoints = new Set();
  mesh.skeleton.bones.forEach((bone, index) => {
    if (["head", "neck_01"].includes(bone.name.toLowerCase())) headJoints.add(index);
  });
  const headVertex = (index) => {
    let influence = 0;
    const joints = [skinIndex.getX(index), skinIndex.getY(index), skinIndex.getZ(index), skinIndex.getW(index)];
    const weights = [skinWeight.getX(index), skinWeight.getY(index), skinWeight.getZ(index), skinWeight.getW(index)];
    for (let slot = 0; slot < skinIndex.itemSize; slot++) {
      if (headJoints.has(joints[slot])) influence += weights[slot];
    }
    return influence >= .18;
  };
  const vertices = [];
  for (let triangle = 0; triangle + 2 < position.count; triangle += 3) {
    const headCount = Number(headVertex(triangle)) + Number(headVertex(triangle + 1)) + Number(headVertex(triangle + 2));
    if (headCount >= 2) vertices.push(triangle, triangle + 1, triangle + 2);
  }
  if (vertices.length < 60) {
    vertices.length = 0;
    for (let triangle = 0; triangle + 2 < position.count; triangle += 3) {
      const headCount = [triangle, triangle + 1, triangle + 2].filter((index) => position.getY(index) >= 1.5).length;
      if (headCount >= 2) vertices.push(triangle, triangle + 1, triangle + 2);
    }
  }
  if (!vertices.length) return null;
  const geometry = new THREE.BufferGeometry();
  for (const [name, attribute] of Object.entries(source.attributes)) {
    const array = new attribute.array.constructor(vertices.length * attribute.itemSize);
    vertices.forEach((vertex, index) => {
      const offset = vertex * attribute.itemSize;
      array.set(attribute.array.subarray(offset, offset + attribute.itemSize), index * attribute.itemSize);
    });
    geometry.setAttribute(name, new THREE.BufferAttribute(array, attribute.itemSize, attribute.normalized));
  }
  geometry.computeBoundingSphere();
  return geometry;
}

function spherePart(parent, material, position, scale, detail = 16) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, detail, Math.max(10, Math.floor(detail * .65))), material);
  mesh.position.set(position[0], position[1], position[2]);
  mesh.scale.set(scale[0], scale[1], scale[2]);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function makeScarf(parent, color, z) {
  const shape = new THREE.Shape();
  shape.moveTo(-.08, .18); shape.quadraticCurveTo(.23, .35, .36, .08);
  shape.lineTo(.95, -.05); shape.quadraticCurveTo(.64, -.03, .22, -.2);
  shape.lineTo(-.08, -.1); shape.closePath();
  const geo = new THREE.ShapeGeometry(shape, 8);
  const scarf = new THREE.Mesh(geo, mat(color, .86, { side: THREE.DoubleSide }));
  scarf.position.set(-.14, 1.54, z);
  scarf.rotation.y = -.16;
  scarf.name = "scarf";
  parent.add(scarf);
  return scarf;
}

export class WorldRenderer {
  constructor(canvas, settings = {}) {
    this.canvas = canvas;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color("#405853");
    this.scene.fog = new THREE.Fog("#536765", 19, 58);
    this.camera = new THREE.OrthographicCamera(-8, 8, 4.5, -4.5, .1, 90);
    this.camera.position.set(0, 6.4, 17);
    this.camera.lookAt(0, 1.25, 0);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "high-performance" });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.quality = settings.quality || "high";
    this.settings = { ...settings };
    this.renderer.setPixelRatio(this.pixelRatio());
    this.resize();
    window.addEventListener("resize", () => this.resize());
    this.canvasObserver = new ResizeObserver(() => this.resize());
    this.canvasObserver.observe(canvas);
    this.scene.add(new THREE.HemisphereLight(0xc4d2c7, 0x232b29, 1.8));
    this.keyLight = new THREE.DirectionalLight(0xffddb0, 2.15);
    this.keyLight.position.set(-5, 12, 9);
    this.scene.add(this.keyLight);
    this.fillLight = new THREE.DirectionalLight(0x7aa39d, 1.05);
    this.fillLight.position.set(6, 7, -8);
    this.scene.add(this.fillLight);
    this.actors = new Map();
    this.characterTemplates = new Map();
    this.clothTextures = new Map();
    this.loadCharacterTemplates();
    this.props = [];
    this.dropObjects = new Map();
    this.projectileObjects = new Map();
    this.particles = [];
    this.shakes = [];
    this.levelGroup = new THREE.Group();
    this.scene.add(this.levelGroup);
    this.actorGroup = new THREE.Group();
    this.scene.add(this.actorGroup);
    this.healthBarGroup = new THREE.Group();
    this.scene.add(this.healthBarGroup);
    this.particleGroup = new THREE.Group();
    this.scene.add(this.particleGroup);
    this.combatWarningGroup = new THREE.Group();
    this.scene.add(this.combatWarningGroup);
    this.combatWarnings = new Map();
    this.ambientTime = 0;
    this.cameraBase = new THREE.Vector3(0, 6.4, 17);
    this.worldName = "";
    this.setLevel(0);
  }

  pixelRatio() {
    if (this.quality === "low") return Math.min(1, window.devicePixelRatio || 1);
    if (this.quality === "medium") return Math.min(1.35, window.devicePixelRatio || 1);
    return Math.min(1.7, window.devicePixelRatio || 1);
  }

  async loadCharacterTemplates() {
    const loader = new GLTFLoader();
    try {
      const [maleOutfit, femaleOutfit, maleBase, femaleBase, maleCoat, femaleCoat] = await Promise.all([
        loader.loadAsync("/assets/models/quaternius-outfits/Male_Peasant.gltf"),
        loader.loadAsync("/assets/models/quaternius-outfits/Female_Peasant.gltf"),
        loader.loadAsync("/assets/models/quaternius/Superhero_Male_FullBody.gltf"),
        loader.loadAsync("/assets/models/quaternius/Superhero_Female_FullBody.gltf"),
        loader.loadAsync("/assets/models/quaternius-outfits/Male_Ranger.gltf"),
        loader.loadAsync("/assets/models/quaternius-outfits/Female_Ranger.gltf")
      ]);
      for (const base of [maleBase.scene, femaleBase.scene]) this.keepBaseHead(base);
      this.characterTemplates.set("male", { outfit: maleOutfit.scene, head: maleBase.scene });
      this.characterTemplates.set("female", { outfit: femaleOutfit.scene, head: femaleBase.scene });
      this.characterTemplates.set("male-ranger", { outfit: maleCoat.scene, head: maleBase.scene });
      this.characterTemplates.set("female-ranger", { outfit: femaleCoat.scene, head: femaleBase.scene });
    } catch (error) {
      console.error("本地人物模型加载失败，将暂用内置人物", error);
    }
  }

  keepBaseHead(scene) {
    let found = false;
    scene.traverse((node) => {
      if (!node.isMesh) return;
      const name = node.name.toLowerCase();
      if (node.isSkinnedMesh && name.startsWith("superhero_")) {
        const geometry = extractHeadGeometry(node);
        if (geometry) {
          node.geometry.dispose();
          node.geometry = geometry;
          node.castShadow = true;
          node.receiveShadow = true;
          node.frustumCulled = false;
          found = true;
        } else {
          node.visible = false;
        }
      } else if (!["eyes", "eyebrows"].includes(name)) {
        node.visible = false;
      }
    });
    scene.userData.hasHeadMesh = found;
  }

  neutralClothTexture(source) {
    if (this.clothTextures.has(source)) return this.clothTextures.get(source);
    const c = document.createElement("canvas");
    c.width = c.height = 1024;
    const ctx = c.getContext("2d");
    ctx.drawImage(source.image, 0, 0, 1024, 1024);
    const data = ctx.getImageData(0, 0, 1024, 1024);
    for (let i = 0; i < data.data.length; i += 4) {
      const luminance = data.data[i] * .3 + data.data[i + 1] * .59 + data.data[i + 2] * .11;
      data.data[i] = data.data[i + 1] = data.data[i + 2] = Math.min(255, luminance * 1.22 + 16);
    }
    ctx.putImageData(data, 0, 0);
    const texture = new THREE.CanvasTexture(c);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.flipY = source.flipY;
    texture.anisotropy = 4;
    this.clothTextures.set(source, texture);
    return texture;
  }

  cloneCharacterMaterials(scene, fighterId, outfit = false, profile = null) {
    scene.traverse((node) => {
      if (!node.isMesh) return;
      if (node.geometry) node.geometry = node.geometry.clone();
      const shouldTintFemale = fighterId !== "qiao" || /_(body|legs)$/i.test(node.name);
      const tint = { lin: "#e8b7a1", qiao: "#b5e8c1", tie: "#f4d49b" }[fighterId] || "#ffffff";
      const cloneMaterial = (source) => {
        const material = source.clone();
        material.userData.preserveTextures = true;
        if (outfit && source.name.toLowerCase().includes("peasant") && shouldTintFemale) material.color.set(tint);
        return material;
      };
      node.material = Array.isArray(node.material) ? node.material.map(cloneMaterial) : cloneMaterial(node.material);
      if (profile) tailorEnemyMesh(node, profile, !outfit);
      node.castShadow = true;
      node.receiveShadow = true;
      node.frustumCulled = false;
    });
  }

  makeCharacterHair(fighterId, trimColor) {
    const hairGroup = new THREE.Group();
    const hair = mat(fighterId === "qiao" ? "#242923" : "#292823", .92);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(.15, 18, 12, 0, Math.PI * 2, 0, 1.86), hair);
    cap.position.set(0, 1.73, .005);
    cap.scale.set(1.08, .86, 1.02);
    cap.castShadow = true;
    hairGroup.add(cap);
    if (fighterId === "qiao") {
      const bun = new THREE.Mesh(new THREE.SphereGeometry(.075, 14, 10), hair);
      bun.position.set(0, 1.68, -.13);
      bun.scale.set(.86, 1.18, .9);
      bun.castShadow = true;
      hairGroup.add(bun);
      const tail = new THREE.Mesh(new THREE.SphereGeometry(.085, 14, 10), hair);
      tail.position.set(0, 1.49, -.18);
      tail.scale.set(.68, 1.55, .72);
      tail.rotation.x = -.22;
      tail.castShadow = true;
      hairGroup.add(tail);
      const band = new THREE.Mesh(new THREE.TorusGeometry(.137, .022, 6, 18), mat(trimColor || "#d7ae70", .78));
      band.rotation.x = Math.PI / 2;
      band.position.set(0, 1.66, .008);
      hairGroup.add(band);
    } else if (fighterId === "tie") {
      const lock = new THREE.Mesh(new THREE.SphereGeometry(.08, 12, 10), hair);
      lock.position.set(.035, 1.66, -.09);
      lock.scale.set(1.25, .72, .84);
      lock.castShadow = true;
      hairGroup.add(lock);
    } else {
      const fringe = new THREE.Mesh(new THREE.SphereGeometry(.072, 12, 9), hair);
      fringe.position.set(0, 1.68, .108);
      fringe.scale.set(1.24, .5, .55);
      fringe.castShadow = true;
      hairGroup.add(fringe);
    }
    return hairGroup;
  }

  makeModelScarf(color) {
    const shape = new THREE.Shape();
    shape.moveTo(0, .10);
    shape.quadraticCurveTo(.17, .19, .28, .10);
    shape.lineTo(.55, .16);
    shape.quadraticCurveTo(.48, .03, .63, -.07);
    shape.quadraticCurveTo(.34, -.03, .17, -.12);
    shape.lineTo(0, -.04);
    shape.closePath();
    const geometry = new THREE.ShapeGeometry(shape, 10);
    geometry.rotateY(Math.PI / 2);
    const scarf = new THREE.Mesh(geometry, mat(color, .82, { side: THREE.DoubleSide, depthWrite: false }));
    scarf.position.set(0, 1.52, -.045);
    scarf.castShadow = true;
    return scarf;
  }

  attachFighterModel(actor, fighterId, profile = null) {
    const form = profile?.form || (fighterId === "qiao" ? "female" : "male");
    const template = this.characterTemplates.get(form);
    if (!template) return false;
    const modelKey = profile?.modelKey || fighterId;
    if (actor.modelKey === modelKey) return true;
    if (actor.modelPose) {
      actor.group.remove(actor.modelPose);
      this.disposeGroup(actor.modelPose);
    }
    const outfit = SkeletonUtils.clone(template.outfit);
    const head = SkeletonUtils.clone(template.head);
    this.cloneCharacterMaterials(outfit, fighterId, true, profile);
    this.cloneCharacterMaterials(head, fighterId, false, profile);
    const scale = profile?.height || (fighterId === "qiao" ? 1.08 : fighterId === "tie" ? 1.18 : 1.12);
    const pose = new THREE.Group();
    const rig = new THREE.Group();
    rig.scale.set(scale * (profile?.width || 1), scale, scale * (profile?.depth || 1));
    pose.add(rig);
    rig.add(outfit, head);
    if (!template.head.userData.hasHeadMesh) {
      actor.body.remove(actor.head);
      actor.head.position.set(0, 1.73, 0);
      rig.add(actor.head);
      actor.head.visible = true;
    }
    const hair = profile ? makeEnemyHair(profile) : this.makeCharacterHair(fighterId, actor.trim.color.getStyle());
    rig.add(hair);
    const scarf = !profile && fighterId === "qiao" ? this.makeModelScarf("#a8483e") : null;
    if (scarf) rig.add(scarf);
    actor.group.add(pose);
    actor.modelPose = pose;
    actor.modelRoot = rig;
    actor.modelScarf = scarf;
    actor.modelScale = scale;
    actor.modelFighterId = fighterId;
    actor.modelKey = modelKey;
    actor.enemyModel = profile;
    if (profile) actor.scale = 1;
    actor.skeletalRig = bindFighterRig(rig, outfit);
    actor.skeletalRig.bones.get("Head")?.attach(hair);
    if (scarf) actor.skeletalRig.bones.get("neck_01")?.attach(scarf);
    if (profile) addEnemyCostume(actor, profile);
    actor.body.visible = false;
    return true;
  }

  animateFighterModel(actor, state) {
    if (!actor.modelRoot) return;
    const pose = actor.enemyModel ? getEnemyPose(state, this.ambientTime) : getFighterPose(state, actor.modelFighterId, this.ambientTime);
    const facing = state.facing || 1;
    actor.modelPose.position.set(facing * pose.rootForward * actor.modelScale, pose.rootLift, 0);
    actor.modelPose.rotation.set(0, 0, 0);
    actor.modelRoot.rotation.y = facing * (Math.PI / 2 - .14) + pose.turn;
    applyFighterPose(actor.skeletalRig, pose);
    if (state.action === "dodge") {
      const angle = -(state.dodgeDirection || facing) * pose.roll;
      const pivot = .94 * actor.modelScale;
      const center = pivot - .19 * actor.modelScale * pose.rollTuck;
      actor.modelPose.rotation.z = angle;
      actor.modelPose.position.set(Math.sin(angle) * pivot, center - Math.cos(angle) * pivot, 0);
      actor.group.updateMatrixWorld(true);
      // Keep the head, knees, hands and boots above the pavement throughout rotation.
      let bottom = Infinity;
      for (const [name, radius] of [["Head", .18], ["pelvis", .17], ["spine_03", .19], ["hand_l", .06], ["hand_r", .06], ["foot_l", .10], ["foot_r", .10], ["calf_l", .09], ["calf_r", .09]]) {
        const bone = actor.skeletalRig.bones.get(name);
        if (bone) bottom = Math.min(bottom, bone.getWorldPosition(new THREE.Vector3()).y - actor.group.position.y - radius * actor.modelScale);
      }
      if (Number.isFinite(bottom)) actor.modelPose.position.y += .025 - bottom;
    }
    if (actor.modelScarf) actor.modelScarf.rotation.x = Math.sin(this.ambientTime * 8) * .08;
  }

  resize() {
    const width = Math.max(1, this.canvas.clientWidth);
    const height = Math.max(1, this.canvas.clientHeight);
    const aspect = width / height;
    const visibleHeight = Math.max(9.4, 8.8 / Math.max(.42, aspect));
    this.camera.left = -visibleHeight * aspect / 2;
    this.camera.right = visibleHeight * aspect / 2;
    this.camera.top = visibleHeight / 2;
    this.camera.bottom = -visibleHeight / 2;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(this.pixelRatio());
    this.renderer.setSize(width, height, false);
  }

  disposeGroup(group) {
    group.traverse((node) => {
      if (node.geometry && !node.isSprite && node.geometry !== this.sharedShadow) node.geometry.dispose();
      if (node.material) {
        const materials = Array.isArray(node.material) ? node.material : [node.material];
        for (const material of materials) {
          if (!material.userData?.preserveTextures && material.map) material.map.dispose();
          material.dispose();
        }
      }
    });
  }

  clearLevel() {
    for (const child of [...this.levelGroup.children]) {
      this.levelGroup.remove(child);
      this.disposeGroup(child);
    }
    this.props = [];
    for (const item of this.dropObjects.values()) {
      this.levelGroup.remove(item.group);
      this.disposeGroup(item.group);
    }
    this.dropObjects.clear();
    for (const item of this.projectileObjects.values()) {
      this.levelGroup.remove(item.group);
      this.disposeGroup(item.group);
    }
    this.projectileObjects.clear();
    this.hazardGlow = null;
    for (const [id, actor] of this.actors) {
      if (id !== "player") {
        this.removeActor(actor);
        this.actors.delete(id);
      }
    }
    this.particles.forEach((item) => { this.particleGroup.remove(item.mesh); this.disposeGroup(item.mesh); });
    this.particles = [];
  }

  setLevel(index, section = 0) {
    if (this.worldName === index + ":" + section) return;
    this.clearLevel();
    this.worldName = index + ":" + section;
    this.levelIndex = index;
    this.section = section;
    const look = LEVEL_LOOKS[index] || LEVEL_LOOKS[0];
    this.scene.background.set(look.sky);
    this.scene.fog.color.set(look.fog);
    this.scene.fog.near = 20;
    this.scene.fog.far = 54;
    this.keyLight.color.set(look.lamp);
    this.fillLight.color.set(look.light);
    this.buildBackdrop(look, index, section);
    this.buildFloor(look, index);
    this.buildArchitecture(look, index, section);
    this.buildProps(index, section);
  }

  buildBackdrop(look, index, section) {
    const back = new THREE.Group();
    const canvas = document.createElement("canvas");
    canvas.width = 2048; canvas.height = 600;
    const ctx = canvas.getContext("2d");
    const g = ctx.createLinearGradient(0, 0, 0, 600);
    g.addColorStop(0, look.sky); g.addColorStop(1, look.far);
    ctx.fillStyle = g; ctx.fillRect(0, 0, 2048, 600);
    ctx.globalAlpha = .22;
    ctx.fillStyle = "#e4c49a";
    for (let i = 0; i < 5; i++) {
      ctx.beginPath(); ctx.ellipse(380 + i * 370, 115 + (i % 2) * 42, 250, 32, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    let seed = 142 + index * 49 + section * 77;
    const random = () => { seed = (seed * 1103515245 + 12345) % 2147483647; return seed / 2147483647; };
    const backColors = ["#293838", "#2b3439", "#2e3837"];
    let x = -20;
    while (x < 2070) {
      const w = 68 + random() * 145;
      const h = 135 + random() * 270;
      ctx.fillStyle = backColors[Math.floor(random() * backColors.length)];
      ctx.fillRect(x, 600 - h, w, h);
      if (random() > .28) {
        for (let wy = 600 - h + 25; wy < 565; wy += 34) {
          for (let wx = x + 12; wx < x + w - 10; wx += 27) {
            const lit = random() > .42;
            ctx.fillStyle = lit ? (index === 1 ? "rgba(239,172,95,.56)" : "rgba(226,196,145,.35)") : "rgba(8,21,21,.4)";
            ctx.fillRect(wx, wy, 12, 19);
          }
        }
      }
      if (index < 2 && random() > .6) {
        ctx.fillStyle = "#3d4842";
        ctx.beginPath(); ctx.moveTo(x - 12, 600 - h); ctx.lineTo(x + w / 2, 600 - h - 33); ctx.lineTo(x + w + 12, 600 - h); ctx.fill();
      }
      x += w - 2;
    }
    if (index === 3) {
      ctx.strokeStyle = "rgba(198,221,218,.35)"; ctx.lineWidth = 5;
      for (let i = 0; i < 80; i++) {
        const rx = random() * 2048, ry = random() * 500;
        ctx.beginPath(); ctx.moveTo(rx, ry); ctx.lineTo(rx - 12, ry + 34 + random() * 36); ctx.stroke();
      }
    }
    const background = new THREE.Mesh(
      new THREE.PlaneGeometry(42, 12),
      new THREE.MeshBasicMaterial({ map: canvasTexture(canvas), color: 0xb6b2a5 })
    );
    background.position.set(0, 5.3, -8.5);
    back.add(background);
    const silhouette = new THREE.Mesh(new THREE.PlaneGeometry(44, 8), mat(look.far));
    silhouette.position.set(0, 2.9, -6.2);
    back.add(silhouette);
    this.levelGroup.add(back);
  }

  buildingBlock(parent, x, width, height, color, z = -3.7, y = 0) {
    const building = new THREE.Mesh(new THREE.BoxGeometry(width, height, 1.35), mat(color));
    building.position.set(x, y + height / 2, z);
    building.castShadow = true; building.receiveShadow = true;
    parent.add(building);
    return building;
  }

  addWindow(parent, x, y, z, lamp, scale = 1) {
    const frame = new THREE.Mesh(new THREE.BoxGeometry(.64 * scale, .9 * scale, .12), mat("#312e28"));
    frame.position.set(x, y, z);
    parent.add(frame);
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(.46 * scale, .68 * scale),
      new THREE.MeshBasicMaterial({ color: lamp ? "#d7ac72" : "#53605b", transparent: true, opacity: lamp ? .73 : .48 }));
    glass.position.set(x, y, z + .072);
    parent.add(glass);
    if (lamp) {
      const cross = new THREE.Mesh(new THREE.BoxGeometry(.025 * scale, .7 * scale, .14), mat("#453b30"));
      cross.position.set(x, y, z + .13); parent.add(cross);
    }
  }

  addSign(parent, text, x, y, z, background, ink, size = 1) {
    const material = new THREE.MeshBasicMaterial({ map: makeLabel(text, background, ink), side: THREE.DoubleSide });
    const board = new THREE.Mesh(new THREE.PlaneGeometry(1.55 * size, .54 * size), material);
    board.position.set(x, y, z);
    board.rotation.y = -.04;
    parent.add(board);
    const top = new THREE.Mesh(new THREE.BoxGeometry(1.65 * size, .07 * size, .08), mat("#312c25"));
    top.position.set(x, y + .3 * size, z - .03); parent.add(top);
    return board;
  }

  buildArchitecture(look, index, section) {
    const g = new THREE.Group();
    if (index === 0 || index === 1) {
      const centers = [-8.8, -3.1, 3.15, 8.8];
      centers.forEach((x, i) => {
        const h = 3.7 + (i % 3) * .47 + (section % 2) * .12;
        const w = 5.8;
        const b = this.buildingBlock(g, x, w, h, i % 2 ? "#4a5048" : "#494741", -3.9, 0);
        const facade = new THREE.Mesh(new THREE.PlaneGeometry(w - .3, h - .25),
          mat(i % 2 ? "#6b6253" : "#625a4f", 1, { color: 0x727068 }));
        facade.position.set(x, h / 2, -3.19); g.add(facade);
        for (let col = 0; col < 3; col++) {
          const wx = x - 1.7 + col * 1.7;
          this.addWindow(g, wx, h * .68, -3.1, (i + col + index + section) % 3 !== 0, .84);
          if (index === 0) this.addWindow(g, wx, h * .34, -3.1, (i + col) % 2 === 0, .72);
        }
        if (i % 2 === 0) {
          const roof = new THREE.Mesh(new THREE.ConeGeometry(w * .55, .8, 4), mat("#343b36"));
          roof.rotation.y = Math.PI / 4; roof.position.set(x, h + .25, -3.8); g.add(roof);
        }
        if (index === 0 && i === 1) this.addSign(g, "武館", x, h * .83, -3.0, "#884534", "#f0d8a4", 1.05);
        if (index === 1 && i === 2) this.addSign(g, "老街夜市", x, h * .81, -3.0, "#873e36", "#f2c575", 1.15);
        if (index === 0 && i === 0) this.addSign(g, "永安堂", x, h * .79, -3.0, "#594638", "#ead2a0", .9);
        if (b) b.visible = true;
      });
      if (index === 1) {
        for (let i = -5; i <= 5; i++) {
          const lantern = this.makeLantern(look.lamp, .34 + (i % 2 === 0 ? .08 : 0));
          lantern.position.set(i * 1.75, 4.7 + (i % 2) * .32, -1.8);
          g.add(lantern);
          const wire = new THREE.Mesh(new THREE.CylinderGeometry(.008, .008, 2.1, 5), mat("#252b28"));
          wire.position.set(i * 1.75, 5.1 + (i % 2) * .15, -1.8); wire.rotation.z = Math.PI / 2; g.add(wire);
        }
      }
    } else if (index === 2) {
      const wall = new THREE.Mesh(new THREE.PlaneGeometry(40, 8), mat("#555a54"));
      wall.position.set(0, 3.8, -4.3); g.add(wall);
      for (let x = -9; x <= 9; x += 3) {
        const window = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 2.0), new THREE.MeshBasicMaterial({ color: "#27302e" }));
        window.position.set(x, 4.3, -4.18); g.add(window);
        const rim = new THREE.Mesh(new THREE.BoxGeometry(1.7, .11, .17), mat("#7b7668"));
        rim.position.set(x, 5.38, -4.12); g.add(rim);
      }
      for (let x = -9; x <= 9; x += 3) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(.22, 5.2, .24), mat("#6c6557"));
        post.position.set(x, 2.6, -3.78); g.add(post);
      }
      const beam = new THREE.Mesh(new THREE.BoxGeometry(20, .27, .42), mat("#534f48"));
      beam.position.set(0, 5.25, -3.76); g.add(beam);
      const warning = this.addSign(g, "旧厂区 · 留心传送带", -5.4, 5.8, -3.7, "#413e37", "#e2ac69", .78);
      warning.position.z = -3.5;
    } else if (index === 3) {
      const city = new THREE.Mesh(new THREE.PlaneGeometry(40, 8), mat("#596467"));
      city.position.set(0, 4.0, -4.4); g.add(city);
      for (let i = -5; i <= 5; i++) {
        const towerH = 1.5 + (Math.abs(i * 17) % 7) * .28;
        const tower = new THREE.Mesh(new THREE.BoxGeometry(1.05, towerH, .5), mat(i % 2 ? "#526166" : "#596366"));
        tower.position.set(i * 2.05, 1.3 + towerH / 2, -4.05);
        g.add(tower);
        for (let w = 0; w < 3; w++) {
          const glow = new THREE.Mesh(new THREE.PlaneGeometry(.11, .18), new THREE.MeshBasicMaterial({ color: w === 1 ? "#d3a675" : "#a9b7b0", transparent: true, opacity: .5 }));
          glow.position.set(i * 2.05 + (w - 1) * .24, 1.35 + towerH * .58, -3.77); g.add(glow);
        }
      }
      const water = new THREE.Mesh(new THREE.CylinderGeometry(.85, .85, 1.05, 20), mat("#535d5b"));
      water.position.set(-6.7, 4.2, -3.8); g.add(water);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(.92, .92, .12, 20), mat("#323d3c"));
      cap.position.set(-6.7, 4.78, -3.8); g.add(cap);
      for (let i = -2; i <= 3; i++) {
        const antenna = new THREE.Mesh(new THREE.CylinderGeometry(.025, .04, 2.2 + (i % 2) * .3, 7), mat("#374446"));
        antenna.position.set(i * 2.7, 4.5, -3.9); g.add(antenna);
        const cross = new THREE.Mesh(new THREE.BoxGeometry(.48, .05, .05), mat("#434d4a"));
        cross.position.set(i * 2.7, 5.1, -3.8); g.add(cross);
      }
      for (let i = -8; i <= 8; i += 2) {
        const drop = new THREE.Mesh(new THREE.BoxGeometry(.018, .36, .018), new THREE.MeshBasicMaterial({ color: "#a9c3be", transparent: true, opacity: .38 }));
        drop.position.set(i + (i % 2) * .24, 3.8 + (i % 3) * .5, -2.3); drop.userData.rain = true; g.add(drop);
      }
    } else {
      const wall = new THREE.Mesh(new THREE.PlaneGeometry(34, 9), mat("#50473e"));
      wall.position.set(0, 4.1, -4.4); g.add(wall);
      for (let x = -8.5; x <= 8.5; x += 2.2) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(.25, 5.4, .3), mat("#775b43"));
        post.position.set(x, 2.65, -3.35); g.add(post);
      }
      const beam = new THREE.Mesh(new THREE.BoxGeometry(20, .42, .45), mat("#6d503b"));
      beam.position.set(0, 5.35, -3.3); g.add(beam);
      const header = this.addSign(g, "巷口武館", 0, 4.72, -3.22, "#854336", "#f0d6a1", 1.65);
      header.rotation.y = 0;
      for (let i = -4; i <= 4; i += 2) {
        const lantern = this.makeLantern(look.lamp, .44);
        lantern.position.set(i * 1.75, 3.6, -2.8); g.add(lantern);
      }
      for (let i = 0; i < 5; i++) {
        const beamEnd = new THREE.Mesh(new THREE.BoxGeometry(.17, 1.25, .18), mat("#90704d"));
        beamEnd.position.set(-7.5 + i * 3.75, 5.92, -3.5); beamEnd.rotation.z = (i % 2 ? 1 : -1) * .08; g.add(beamEnd);
      }
    }
    if (index === 2) {
      for (let i = -3; i <= 3; i++) {
        const upper = new THREE.Mesh(new THREE.BoxGeometry(.13, .13, 8), mat("#645d52"));
        upper.position.set(i * 3, 5.3, -2); upper.rotation.z = .08 * (i % 2); g.add(upper);
      }
    }
    this.levelGroup.add(g);
    const light = new THREE.PointLight(look.lamp, index === 4 ? 2.2 : 1.2, 15, 2);
    light.position.set(index === 4 ? 0 : -4, 4.8, 1.8);
    this.levelGroup.add(light);
  }

  makeLantern(color, size) {
    const group = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(size, 14, 12), new THREE.MeshStandardMaterial({ color: "#c75a3c", roughness: .58, emissive: color, emissiveIntensity: .25 }));
    body.scale.set(.84, 1.08, .75);
    group.add(body);
    const cap1 = new THREE.Mesh(new THREE.CylinderGeometry(size * .48, size * .8, .1, 9), mat("#473326"));
    cap1.position.y = size * .88; group.add(cap1);
    const cap2 = cap1.clone(); cap2.position.y = -size * .88; group.add(cap2);
    const tassel = new THREE.Mesh(new THREE.CylinderGeometry(.012, .01, size * .7, 5), mat("#c78b4e"));
    tassel.position.y = -size * 1.3; group.add(tassel);
    const lamp = new THREE.PointLight(color, .55, 4.2, 2);
    lamp.position.y = -.12; group.add(lamp);
    return group;
  }

  buildFloor(look, index) {
    const texture = tileTexture(index);
    // A portrait viewport sees much farther toward the player's front edge.
    // Keep the same tile density while extending the floor so the world does
    // not end in a flat canvas-color band on phones and tablets.
    texture.repeat.y = 8;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(42, 64),
      new THREE.MeshStandardMaterial({ color: look.light, map: texture, roughness: index === 2 ? .68 : .96, metalness: index === 2 ? .22 : .02 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -.11;
    floor.receiveShadow = true;
    this.levelGroup.add(floor);
    const backLine = new THREE.Mesh(new THREE.BoxGeometry(40, .08, .035), mat("#2b302b"));
    backLine.position.set(0, .03, -2.95); this.levelGroup.add(backLine);
    const frontLine = new THREE.Mesh(new THREE.BoxGeometry(40, .045, .04), mat("#817461"));
    frontLine.position.set(0, .025, 3.2); this.levelGroup.add(frontLine);
    for (let x = -18; x < 19; x += 3) {
      const lane = new THREE.Mesh(new THREE.BoxGeometry(.02, .016, 5.2), new THREE.MeshBasicMaterial({ color: 0xd8c3a0, transparent: true, opacity: .1 }));
      lane.position.set(x, .004, .1); this.levelGroup.add(lane);
    }
    if (index === 3) {
      for (let i = 0; i < 4; i++) {
        const puddle = new THREE.Mesh(new THREE.CircleGeometry(.54 + (i % 2) * .3, 24),
          new THREE.MeshStandardMaterial({ color: "#789092", roughness: .18, metalness: .25, transparent: true, opacity: .38 }));
        puddle.rotation.x = -Math.PI / 2; puddle.scale.y = .38; puddle.position.set(-6 + i * 4.1, .003, .4 - (i % 2) * 1.25); this.levelGroup.add(puddle);
      }
    }
  }

  buildProps(index, section) {
    if (index === 1) {
      for (let i = 0; i < 3; i++) {
        const stall = new THREE.Group();
        for (const x of [-.72, .72]) {
          const pole = new THREE.Mesh(new THREE.CylinderGeometry(.045, .07, 2.45, 8), mat("#65513c"));
          pole.position.set(x, 1.18, -1.1); stall.add(pole);
        }
        const awning = new THREE.Mesh(new THREE.BoxGeometry(2.1, .17, 1.2), mat(i % 2 ? "#a34d3c" : "#c49b58"));
        awning.position.set(0, 2.28, -1.05); awning.rotation.z = -.04; stall.add(awning);
        for (let stripe = -4; stripe <= 4; stripe++) {
          const panel = new THREE.Mesh(new THREE.BoxGeometry(.13, .018, 1.21), mat(stripe % 2 ? "#ead4a2" : "#9b493a"));
          panel.position.set(stripe * .22, 2.37, -1.05); stall.add(panel);
        }
        for (let box = 0; box < 4; box++) {
          const fruit = spherePart(stall, mat(["#d9844a", "#b34b37", "#baa04f", "#567b5f"][box]), [-.58 + box * .37, .55, -.9], [.18, .15, .17], 12);
          fruit.userData.food = true;
        }
        stall.position.x = -6.8 + i * 6.8;
        this.levelGroup.add(stall);
      }
    } else if (index === 2) {
      const belt = new THREE.Group();
      const base = new THREE.Mesh(new THREE.BoxGeometry(5.4, .68, 1.2), mat("#404a47", .76, { metalness: .3 }));
      base.position.set(0, .36, -2.45); belt.add(base);
      for (let i = 0; i < 13; i++) {
        const roller = new THREE.Mesh(new THREE.CylinderGeometry(.12, .12, 1.25, 10), mat("#65716b", .53, { metalness: .6 }));
        roller.rotation.x = Math.PI / 2;
        roller.position.set(-2.5 + i * .42, .8, -2.35); belt.add(roller);
      }
      const hazard = new THREE.Mesh(new THREE.BoxGeometry(5.6, .06, 1.45), new THREE.MeshBasicMaterial({ color: "#d88b3f", transparent: true, opacity: .18 }));
      hazard.position.set(0, .72, -2.39); belt.add(hazard);
      this.levelGroup.add(belt);
      this.hazardGlow = hazard;
    } else if (index === 3) {
      const parapet = new THREE.Mesh(new THREE.BoxGeometry(36, .72, .38), mat("#626d69"));
      parapet.position.set(0, .35, -3.0); this.levelGroup.add(parapet);
      for (let i = -16; i <= 16; i += 2) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(.1, .5, .12), mat("#808983"));
        rail.position.set(i, .98, -3.05); this.levelGroup.add(rail);
      }
    } else if (index === 0) {
      const gate = new THREE.Group();
      for (const x of [-.82, .82]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(.18, 3.25, .22), mat("#725740"));
        post.position.set(x, 1.62, -2.88); gate.add(post);
      }
      const lintel = new THREE.Mesh(new THREE.BoxGeometry(2.2, .19, .28), mat("#694d38"));
      lintel.position.set(0, 3.2, -2.88); gate.add(lintel);
      for (let i = 0; i < 7; i++) {
        const slat = new THREE.Mesh(new THREE.BoxGeometry(.08, 1.35, .08), mat("#614832"));
        slat.position.set(-.62 + i * .2, 2.43, -2.78); gate.add(slat);
      }
      this.levelGroup.add(gate);
    } else {
      const matLine = new THREE.Mesh(new THREE.BoxGeometry(24, .07, .18), mat("#67513e"));
      matLine.position.set(0, .03, -2.9); this.levelGroup.add(matLine);
      for (let x = -9; x <= 9; x += 3) {
        const tatami = new THREE.Mesh(new THREE.BoxGeometry(2.8, .055, .8),
          new THREE.MeshStandardMaterial({ color: "#84754f", roughness: .96 }));
        tatami.position.set(x, .07, -2.25); this.levelGroup.add(tatami);
      }
    }

    const layout = index === 1 ? [-4.4, 3.8] : index === 2 ? [-4.2, 4.2] : index === 0 ? [-4.8, 4.4] : index === 4 ? [-4.3, 4.3] : [-5.2, 4.7];
    layout.forEach((x, i) => {
      const prop = new THREE.Group();
      const isBarrel = index === 2;
      if (isBarrel) {
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(.38, .46, .78, 14, 2), mat("#705239"));
        barrel.position.y = .39; prop.add(barrel);
        for (const y of [.15, .62]) {
          const hoop = new THREE.Mesh(new THREE.TorusGeometry(.41, .028, 5, 16), mat("#555b57", .5, { metalness: .42 }));
          hoop.position.y = y; prop.add(hoop);
        }
      } else {
        const body = new THREE.Mesh(new THREE.BoxGeometry(.84, .72, .8), mat(index === 1 ? "#775339" : "#776144"));
        body.position.y = .36; prop.add(body);
        const lid = new THREE.Mesh(new THREE.BoxGeometry(.92, .09, .88), mat("#94704c"));
        lid.position.y = .76; prop.add(lid);
        for (const z of [-.25, .25]) {
          const band = new THREE.Mesh(new THREE.BoxGeometry(.055, .69, .84), mat("#4d4940"));
          band.position.set(i === 0 ? -.22 : .22, .36, z * .2); prop.add(band);
        }
      }
      const shadow = new THREE.Mesh(new THREE.CircleGeometry(.58, 16), new THREE.MeshBasicMaterial({ color: "#0b1311", transparent: true, opacity: .34 }));
      shadow.rotation.x = -Math.PI / 2; shadow.scale.y = .62; shadow.position.set(0, .008, .1); prop.add(shadow);
      prop.position.set(x, 0, index === 3 ? -2.7 : -1.1 + i * .6);
      prop.userData = { breakable: true, hp: 3, x, z: prop.position.z, drop: i % 2 ? "club" : "tea", broken: false, index: i, worldX: x, worldZ: prop.position.z };
      this.levelGroup.add(prop);
      this.props.push(prop);
    });
  }

  makeActor(config) {
    const group = new THREE.Group();
    const scale = config.boss ? 1.14 : config.elite ? 1.06 : config.heavy ? 1.04 : 1;
    group.scale.set(scale, scale, scale);
    const jacket = mat(config.color || "#456157", .84);
    const jacketDark = mat(config.dark || "#283a35", .9);
    const trim = mat(config.trim || "#ddb77a", .72);
    const skin = mat(config.skin || "#d3a080", .76);
    const hair = mat(config.hair || "#272923", .95);
    const cloth = mat(config.cloth || "#d2c7ad", .94);
    const shoe = mat(config.shoe || "#282d2c", .72);
    const face = mat(config.face || config.skin || "#d3a080");
    const body = new THREE.Group();
    group.add(body);

    const torsoGeo = new THREE.LatheGeometry([
      new THREE.Vector2(.24, -.42), new THREE.Vector2(.32, -.31), new THREE.Vector2(.31, -.05),
      new THREE.Vector2(.37, .22), new THREE.Vector2(.4, .41), new THREE.Vector2(.29, .54), new THREE.Vector2(.16, .58)
    ], 16);
    const torso = new THREE.Mesh(torsoGeo, jacket);
    torso.position.y = 1.18; torso.castShadow = true; torso.receiveShadow = true;
    body.add(torso);
    const undershirt = new THREE.Mesh(new THREE.CylinderGeometry(.255, .275, .62, 14), jacketDark);
    undershirt.position.set(-.015, 1.21, .025); body.add(undershirt);
    const waist = new THREE.Mesh(new THREE.CylinderGeometry(.3, .29, .2, 16), trim);
    waist.position.y = .82; body.add(waist);
    const sash = new THREE.Mesh(new THREE.BoxGeometry(.42, .18, .08), jacket);
    sash.position.set(.08, .81, .06); sash.rotation.z = -.16; body.add(sash);
    const buckle = new THREE.Mesh(new THREE.TorusGeometry(.085, .022, 5, 10), mat("#dfc08c", .45, { metalness: .35 }));
    buckle.position.set(.26, .82, .13); body.add(buckle);
    const beltTail = new THREE.Mesh(new THREE.PlaneGeometry(.16, .4), mat(config.trim || "#ddb77a", .92, { side: THREE.DoubleSide }));
    beltTail.position.set(-.18, .61, .17); beltTail.rotation.z = -.22; body.add(beltTail);
    const leftLap = new THREE.Mesh(new THREE.PlaneGeometry(.17, .5), cloth);
    leftLap.position.set(.02, 1.23, .205); leftLap.rotation.z = .12; body.add(leftLap);
    const chestLine = new THREE.Mesh(new THREE.BoxGeometry(.035, .48, .025), trim);
    chestLine.position.set(.12, 1.27, .214); chestLine.rotation.z = -.18; body.add(chestLine);

    const head = new THREE.Group();
    head.position.set(.04, 1.79, .04); body.add(head);
    spherePart(head, face, [0, 0, 0], [.245, .29, .22], 18);
    spherePart(head, skin, [.18, -.035, .04], [.13, .075, .12], 12);
    spherePart(head, hair, [-.02, .2, .02], [.27, .13, .23], 16);
    spherePart(head, hair, [-.18, .14, .04], [.16, .17, .2], 14);
    const fringe = new THREE.Mesh(new THREE.ConeGeometry(.11, .23, 6), hair);
    fringe.position.set(.12, .16, .15); fringe.rotation.z = -.66; head.add(fringe);
    const eye = spherePart(head, mat("#211f1c", .35), [.115, .035, .194], [.032, .024, .018], 10);
    eye.name = "eye";
    spherePart(head, cloth, [.03, -.1, .184], [.075, .025, .02], 10);
    const ear = spherePart(head, skin, [-.1, -.015, .19], [.055, .07, .04], 10);
    ear.name = "ear";
    if (config.band) {
      const band = new THREE.Mesh(new THREE.TorusGeometry(.227, .045, 6, 18), trim);
      band.position.set(-.015, .125, .02); band.rotation.x = .22; head.add(band);
    }
    if (config.scar) {
      const scar = new THREE.Mesh(new THREE.BoxGeometry(.018, .14, .025), mat("#a74d3e"));
      scar.position.set(.11, -.07, .215); scar.rotation.z = .35; head.add(scar);
    }

    const shoulderL = spherePart(body, jacket, [-.1, 1.49, -.02], [.22, .19, .21], 14);
    shoulderL.name = "shoulder-back";
    const shoulderR = spherePart(body, jacket, [.2, 1.49, .11], [.23, .2, .21], 14);
    shoulderR.name = "shoulder-front";
    const armBack = this.makeArm(body, -.08, 1.44, -.12, skin, jacket, cloth, trim, false);
    const armFront = this.makeArm(body, .2, 1.44, .18, skin, jacket, cloth, trim, true);
    const bracer = new THREE.Mesh(new THREE.TorusGeometry(.155, .045, 6, 14), config.guard ? trim : jacketDark);
    bracer.position.set(.37, 1.02, .2); bracer.rotation.x = Math.PI / 2; body.add(bracer);
    const legBack = this.makeLeg(body, -.16, .68, -.1, shoe, jacketDark, trim, false);
    const legFront = this.makeLeg(body, .13, .68, .13, shoe, jacketDark, trim, true);
    const chestMark = new THREE.Mesh(new THREE.CircleGeometry(.1, 12), trim);
    chestMark.position.set(.255, 1.33, .221); body.add(chestMark);
    if (config.scarf) makeScarf(body, config.trim || "#c95c42", .05);

    const shadow = new THREE.Mesh(new THREE.CircleGeometry(.53, 24), new THREE.MeshBasicMaterial({ color: "#091311", transparent: true, opacity: .4, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2; shadow.scale.y = .5; shadow.position.y = .013;
    group.add(shadow);

    const hpBar = new THREE.Group();
    const barSprite = (color, order) => {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ color, depthTest: false, depthWrite: false, fog: false }));
      sprite.renderOrder = order;
      return sprite;
    };
    const hpBorder = barSprite("#d7c49b", 900);
    const hpBack = barSprite("#15221f", 901);
    const hpTrail = barSprite("#ae5547", 902);
    const hpFill = barSprite("#e8b264", 903);
    hpTrail.center.x = hpFill.center.x = 0;
    hpBar.add(hpBorder, hpBack, hpTrail, hpFill);
    hpBar.visible = false;
    this.healthBarGroup.add(hpBar);

    return { group, body, head, torso, armBack, armFront, legBack, legFront, shadow, hpBar, hpFill, hpTrail, hpBack, hpBorder, hpDelayed: 1, jacket, trim, scale, colorKey: config.color, trimKey: config.trim };
  }

  makeArm(body, x, y, z, skin, jacket, wrap, trim, front) {
    const shoulder = new THREE.Group();
    shoulder.position.set(x, y, z); body.add(shoulder);
    spherePart(shoulder, jacket, [0, 0, 0], [.22, .2, .2], 12);
    const upper = taperedLimb(.37, .16, .13, jacket);
    upper.position.set(.02, -.2, 0); shoulder.add(upper);
    spherePart(shoulder, skin, [.03, -.39, 0], [.14, .14, .14], 12);
    const elbow = new THREE.Group();
    elbow.position.set(.03, -.39, 0); shoulder.add(elbow);
    const forearm = taperedLimb(.35, .13, .105, skin);
    forearm.position.set(.04, -.18, 0); elbow.add(forearm);
    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(.115, .12, .14, 12), wrap);
    cuff.position.set(.045, -.32, 0); elbow.add(cuff);
    const fist = spherePart(elbow, front ? skin : wrap, [.095, -.43, 0], [.125, .11, .13], 12);
    for (let i = -1; i <= 1; i++) {
      const knuckle = spherePart(elbow, front ? skin : wrap, [.18, -.405, i * .045], [.044, .035, .036], 9);
      knuckle.name = "knuckle";
    }
    return { shoulder, elbow, upper, forearm, cuff, fist };
  }

  makeLeg(body, x, y, z, shoe, pants, trim, front) {
    const hip = new THREE.Group();
    hip.position.set(x, y, z); body.add(hip);
    const upper = taperedLimb(.42, .19, .145, pants);
    upper.position.set(0, -.22, 0); hip.add(upper);
    spherePart(hip, trim, [0, -.42, 0], [.15, .14, .145], 11);
    const knee = new THREE.Group();
    knee.position.set(0, -.42, 0); hip.add(knee);
    const lower = taperedLimb(.36, .13, .105, pants);
    lower.position.set(.015, -.18, 0); knee.add(lower);
    const boot = spherePart(knee, shoe, [.1, -.37, .035], [.25, .12, .155], 12);
    const sole = new THREE.Mesh(new THREE.BoxGeometry(.38, .035, .2), mat("#161d1c"));
    sole.position.set(.09, -.46, .04); knee.add(sole);
    if (front) {
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(.22, .045, .16), trim);
      stripe.position.set(.12, -.35, .155); knee.add(stripe);
    }
    return { hip, knee, upper, lower, boot };
  }

  fighterVisual(fighter) {
    return { color: fighter.color, trim: fighter.trim, skin: fighter.skin, hair: "#252821", cloth: "#d9d0ba", band: true, scarf: fighter.id === "qiao", scar: fighter.id === "tie", fighterId: fighter.id };
  }

  enemyVisual(enemy) {
    const style = enemy.style || "";
    const type = enemy.type || enemy.id;
    return {
      color: enemy.color, trim: enemy.trim, skin: enemy.skin || "#c99677",
      hair: enemy.boss ? "#242522" : "#302d27", cloth: enemy.guard ? "#c8c0a7" : "#d1c5ad",
      heavy: type === "heavy", elite: type === "elite", boss: Boolean(enemy.boss), band: type === "guard" || type === "elite",
      guard: type === "guard", scarf: ["dart", "ram", "feint", "tactician"].includes(style),
      scar: enemy.boss, fighterId: "enemy", enemyModel: enemyModelProfile(enemy)
    };
  }

  syncActors(player, enemies) {
    const active = new Set(["player"]);
    if (player) this.syncOne("player", { ...player, visual: this.fighterVisual(player.visual) });
    for (const enemy of enemies || []) {
      active.add(enemy.id);
      this.syncOne(enemy.id, { ...enemy, visual: this.enemyVisual(enemy) });
    }
    for (const [id, actor] of this.actors) {
      if (!active.has(id)) {
        this.removeActor(actor);
        this.actors.delete(id);
      }
    }
  }

  getWorldBounds() {
    const half = (this.camera.right - this.camera.left) / 2;
    return { minX: -Math.max(2.4, half - 1.25), maxX: Math.max(2.4, half - 1.25), minZ: -2.15, maxZ: 2.15 };
  }

  getEntryBounds() {
    const half = (this.camera.right - this.camera.left) / 2;
    return { minX: -half - 1.45, maxX: half + 1.45 };
  }

  resetActor(id) {
    const actor = this.actors.get(id);
    if (!actor) return;
    this.removeActor(actor);
    this.actors.delete(id);
  }

  removeActor(actor) {
    this.actorGroup.remove(actor.group);
    this.healthBarGroup.remove(actor.hpBar);
    this.disposeGroup(actor.group);
    this.disposeGroup(actor.hpBar);
  }

  addDrop(drop) {
    if (this.dropObjects.has(drop.id)) return;
    const group = new THREE.Group();
    if (drop.type === "club") {
      const wood = mat("#89613d", .8);
      const stick = new THREE.Mesh(new THREE.CylinderGeometry(.052, .075, .9, 12, 2), wood);
      stick.rotation.z = Math.PI / 2; group.add(stick);
      for (const x of [-.32, .3]) {
        const wrap = new THREE.Mesh(new THREE.TorusGeometry(.072, .018, 5, 10), mat("#c5a574"));
        wrap.position.x = x; wrap.rotation.y = Math.PI / 2; group.add(wrap);
      }
    } else {
      const cup = new THREE.Mesh(new THREE.LatheGeometry([
        new THREE.Vector2(.025, -.16), new THREE.Vector2(.16, -.14), new THREE.Vector2(.19, -.02), new THREE.Vector2(.13, .11), new THREE.Vector2(.08, .13)
      ], 12), mat("#c58d5a", .42));
      cup.position.y = .22; group.add(cup);
      const liquid = new THREE.Mesh(new THREE.CircleGeometry(.105, 16), mat("#bd7041"));
      liquid.rotation.x = -Math.PI / 2; liquid.position.set(0, .35, 0); group.add(liquid);
      const steam = new THREE.Mesh(new THREE.TorusGeometry(.12, .012, 5, 12), new THREE.MeshBasicMaterial({ color: "#eee4c5", transparent: true, opacity: .45 }));
      steam.position.y = .44; group.add(steam);
    }
    const glint = new THREE.Mesh(new THREE.RingGeometry(.24, .29, 22), new THREE.MeshBasicMaterial({ color: drop.type === "tea" ? "#e3b56b" : "#bd7950", transparent: true, opacity: .63, side: THREE.DoubleSide }));
    glint.rotation.x = -Math.PI / 2; glint.position.y = .035; group.add(glint);
    group.position.set(drop.x, .16, drop.z);
    this.levelGroup.add(group);
    this.dropObjects.set(drop.id, { group, item: drop, time: 0 });
  }

  syncDrops(drops, dt) {
    const active = new Set(drops.map((item) => item.id));
    for (const [id, value] of this.dropObjects) {
      if (!active.has(id)) {
        this.levelGroup.remove(value.group);
        this.disposeGroup(value.group);
        this.dropObjects.delete(id);
      } else {
        value.time += dt;
        value.group.position.y = .16 + Math.sin(value.time * 3.1) * .07;
        value.group.rotation.y += dt * .55;
        const ring = value.group.children[value.item.type === "tea" ? 3 : 2];
        if (ring?.material) ring.material.opacity = .38 + .22 * Math.sin(value.time * 4);
      }
    }
    for (const drop of drops) if (!this.dropObjects.has(drop.id)) this.addDrop(drop);
  }

  syncProjectiles(projectiles, dt) {
    const active = new Set(projectiles.map((item) => item.id));
    for (const [id, value] of this.projectileObjects) {
      if (!active.has(id)) {
        this.levelGroup.remove(value.group);
        this.disposeGroup(value.group);
        this.projectileObjects.delete(id);
      }
    }
    for (const item of projectiles) {
      let value = this.projectileObjects.get(item.id);
      if (!value) {
        const group = new THREE.Group();
        if (item.kind === "club") {
          const stick = makeClub(); stick.rotation.z = Math.PI/2; group.add(stick);
        } else {
          const bundle = new THREE.Mesh(new THREE.SphereGeometry(.16, 15, 12), mat("#c7a46e"));
          bundle.scale.set(1.12, .82, .85); group.add(bundle);
          const band = new THREE.Mesh(new THREE.TorusGeometry(.13, .018, 5, 13), mat(item.kind === "stone" ? "#777d77" : "#a34b3e"));
          band.position.z = .075; group.add(band);
        }
        this.levelGroup.add(group);
        value = { group, item };
        this.projectileObjects.set(item.id, value);
      }
      value.item = item;
      value.group.position.set(item.x, item.y, item.z);
      value.group.rotation.z = item.kind === "club" ? item.spin : Math.sin(item.spin) * .25;
      value.group.rotation.y += dt * (item.kind === "club" ? 8 : 2);
    }
  }

  syncOne(id, state) {
    let actor = this.actors.get(id);
    if (!actor) {
      actor = this.makeActor(state.visual || {});
      this.actorGroup.add(actor.group);
      this.actors.set(id, actor);
    }
    if (id === "player" && state.visual?.fighterId) this.attachFighterModel(actor, state.visual.fighterId);
    if (id !== "player" && state.visual?.enemyModel) this.attachFighterModel(actor, "enemy", state.visual.enemyModel);
    if (state.visual?.color && actor.colorKey !== state.visual.color) {
      actor.jacket.color.set(state.visual.color);
      actor.colorKey = state.visual.color;
    }
    if (state.visual?.trim && actor.trimKey !== state.visual.trim) {
      actor.trim.color.set(state.visual.trim);
      actor.trimKey = state.visual.trim;
    }
    const g = actor.group;
    const s = actor;
    g.position.set(state.x || 0, (state.y || 0), state.z || 0);
    if (actor.modelRoot) g.scale.set(s.scale, s.scale, s.scale);
    else g.scale.x = Math.abs(s.scale) * (state.facing || 1);
    g.rotation.y = state.visual?.facingRotation || 0;
    const t = state.actionT ?? state.actionElapsed ?? 0;
    const total = state.actionTotal || .4;
    const progress = Math.min(1, t / Math.max(.01, total));
    const type = state.action || "idle";
    let bodyLean = 0;
    let armReach = 0;
    let kick = 0;
    if (type === "light") {
      const wave = Math.sin(progress * Math.PI);
      bodyLean = .1 * wave;
      armReach = 1.22 * wave;
    } else if (type === "heavy") {
      const prep = progress < .34 ? -progress * 1.2 : 0;
      const wave = progress < .34 ? 0 : Math.sin(((progress - .34) / .66) * Math.PI);
      bodyLean = -.14 + .28 * Math.sin(progress * Math.PI);
      armReach = prep + 1.75 * wave;
      kick = -.6 * wave;
    } else if (type === "air") {
      bodyLean = .2;
      armReach = 1.4 * Math.sin(progress * Math.PI);
      kick = -.9;
    } else if (type === "special" || type === "finisher") {
      armReach = 1.3 * Math.sin(progress * Math.PI);
      bodyLean = .24 * Math.sin(progress * Math.PI);
      kick = type === "finisher" ? -.75 : -.35;
    } else if (type === "dodge") {
      bodyLean = (state.dodgeDirection || 1) * .56;
      s.shadow.scale.x = .62;
    } else if (type === "hit") {
      bodyLean = -.32;
      armReach = -.4;
    } else if (type === "warning" || state.alert > 0) {
      bodyLean = -.07;
      armReach = -.65;
    }
    if (type !== "dodge") s.shadow.scale.x = 1;
    s.body.rotation.z = bodyLean * (state.facing || 1);
    s.head.rotation.z = -bodyLean * .42;
    s.armFront.shoulder.rotation.z = .16 + armReach;
    s.armFront.elbow.rotation.z = -.14 - Math.max(0, armReach) * .35;
    s.armBack.shoulder.rotation.z = -.4 - Math.max(0, armReach) * .22;
    s.armBack.elbow.rotation.z = .32;
    s.legFront.hip.rotation.z = kick;
    s.legBack.hip.rotation.z = -kick * .45;
    s.legFront.knee.rotation.z = Math.max(0, kick) * .3;
    s.legBack.knee.rotation.z = Math.max(0, -kick) * .45;
    if (type === "jump") {
      s.legFront.knee.rotation.z = .8; s.legBack.knee.rotation.z = -.66;
      s.armFront.shoulder.rotation.z = .66; s.armBack.shoulder.rotation.z = .12;
    }
    if (state.airborne) {
      s.legFront.hip.rotation.z = .36; s.legBack.hip.rotation.z = -.26;
    }
    this.animateFighterModel(actor, state, bodyLean, armReach, kick, progress, type);
    if (id === "player") {
      if (!actor.heldClub && state.weapon) { actor.heldClub = makeClub(); g.add(actor.heldClub); }
      if (actor.heldClub) {
        actor.heldClub.visible = Boolean(state.weapon);
        if (state.weapon) {
          g.updateMatrixWorld(true);
          const hand = actor.skeletalRig?.bones.get("hand_r");
          const point = hand ? g.worldToLocal(hand.getWorldPosition(new THREE.Vector3())) : new THREE.Vector3(.3,1.3,.2);
          actor.heldClub.position.copy(point);
          actor.heldClub.rotation.z = -(state.facing || 1) * (type === "throw" ? .8 : .35);
          actor.heldClub.position.y += .19;
        }
      }
    }
    if (state.hurtT > 0 || state.armorFlashT > 0) {
      const flash = state.armorFlashT > 0 ? .28 : .55;
      g.traverse((node) => {
        if (node.isMesh && node.material?.emissive) {
          node.material.emissive.set(state.armorFlashT > 0 ? "#8b632e" : "#8c3027");
          node.material.emissiveIntensity = flash;
        }
      });
    } else {
      g.traverse((node) => {
        if (node.isMesh && node.material?.emissive && node.material.emissiveIntensity > 0) {
          node.material.emissiveIntensity = 0;
          node.material.emissive.set("#000000");
        }
      });
    }
    if (state.health != null && state.maxHealth != null) {
      actor.shadow.material.opacity = state.boss ? .47 : .38;
      actor.hpBar.visible = id !== "player" && !state.boss && state.health > 0;
      const ratio = Math.max(0, Math.min(1, state.health / Math.max(1, state.maxHealth)));
      const unitsPerPixel = (this.camera.top - this.camera.bottom) / Math.max(1, this.canvas.clientHeight);
      const width = Math.max(1.02, unitsPerPixel * 50), height = Math.max(.14, unitsPerPixel * 8);
      const inset = unitsPerPixel * 2;
      actor.hpBar.position.set(state.x || 0, (state.y || 0) + (actor.enemyModel ? actor.modelScale * 1.9 + .16 : 2.43 * s.scale), state.z || 0);
      actor.hpBorder.scale.set(width + inset, height + inset, 1);
      actor.hpBack.scale.set(width, height, 1);
      actor.hpDelayed = Math.max(ratio, actor.hpDelayed - (this.frameDelta || .016) * .75);
      actor.hpFill.position.x = actor.hpTrail.position.x = -(width - inset * 2) / 2;
      actor.hpTrail.scale.set((width - inset * 2) * actor.hpDelayed, height - inset * 2, 1);
      actor.hpFill.scale.set((width - inset * 2) * ratio, height - inset * 2, 1);
      actor.hpFill.material.color.set(ratio < .3 ? "#f17459" : "#e8b264");
    }
    g.visible = state.health == null || state.health > 0;
  }

  spawnHit(x, y, z, strength = 1, color = "#f1c37a") {
    const flashFactor = this.settings.lowFlash === false ? 1.3 : 1;
    const count = Math.max(5, Math.round(7 * (this.settings.effects ?? 1) * strength * flashFactor));
    for (let i = 0; i < count; i++) {
      const geo = i % 3 === 0 ? new THREE.TetrahedronGeometry(.055 + .035 * strength, 0) : new THREE.OctahedronGeometry(.04 + .03 * strength, 0);
      const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: i % 3 ? color : "#e56f4d", transparent: true, opacity: .95 }));
      mesh.position.set(x + (Math.random() - .5) * .45, y + (Math.random() - .5) * .36, z + .1 + Math.random() * .5);
      mesh.userData.vel = new THREE.Vector3((Math.random() - .5) * 4.3, .7 + Math.random() * 3.2, (Math.random() - .5) * 2.1);
      this.particleGroup.add(mesh);
      this.particles.push({ mesh, life: .18 + Math.random() * .2, maxLife: .38, kind: "spark" });
    }
    if (strength >= 1.6) this.shake(strength * .075);
  }

  spawnDust(x, y, z, count = 5) {
    for (let i = 0; i < Math.ceil(count * (this.settings.effects ?? 1)); i++) {
      const mesh = new THREE.Mesh(new THREE.CircleGeometry(.12 + Math.random() * .12, 10), new THREE.MeshBasicMaterial({ color: "#c0aa7e", transparent: true, opacity: .32, side: THREE.DoubleSide, depthWrite: false }));
      mesh.rotation.x = -.5; mesh.position.set(x + (Math.random() - .5) * .7, y + .06, z + .1);
      mesh.userData.vel = new THREE.Vector3((Math.random() - .5) * 1.5, .4 + Math.random() * .6, (Math.random() - .5) * .8);
      this.particleGroup.add(mesh);
      this.particles.push({ mesh, life: .45 + Math.random() * .3, maxLife: .75, kind: "dust" });
    }
  }

  spawnWarning(x, z, radius = 1.3) {
    const mesh = new THREE.Mesh(new THREE.RingGeometry(radius * .65, radius, 32),
      new THREE.MeshBasicMaterial({ color: "#ed7855", transparent: true, opacity: .65, side: THREE.DoubleSide, depthWrite: false }));
    mesh.rotation.x = -Math.PI / 2; mesh.position.set(x, .035, z);
    this.particleGroup.add(mesh);
    this.particles.push({ mesh, life: .62, maxLife: .62, kind: "warning" });
  }

  spawnBreak(x, z) {
    this.spawnHit(x, .56, z, 1.6, "#d6ae74");
    this.spawnDust(x, .04, z, 10);
  }

  shake(amount = .1) {
    if (this.settings.shake === false) return;
    this.shakes.push({ amount: Math.min(.55, amount), time: 0, life: .19 });
  }

  setSettings(settings) {
    const oldQuality = this.quality;
    this.settings = { ...this.settings, ...settings };
    this.quality = settings.quality || this.quality;
    if (this.quality !== oldQuality) this.resize();
  }

  syncCombatWarnings(enemies) {
    const active = new Set();
    for (const enemy of enemies) {
      if (enemy.health <= 0 || enemy.entry) continue;
      const opening = enemy.boss && ["recover", "staggered"].includes(enemy.state) && !enemy.move?.followUp;
      if (!opening && (!["windup", "feint", "strike"].includes(enemy.state) || !enemy.move)) continue;
      const move = enemy.move, kind = opening ? "opening" : move.kind;
      active.add(enemy.id);
      let warning = this.combatWarnings.get(enemy.id);
      if (warning && warning.kind !== kind) {
        this.combatWarningGroup.remove(warning.mesh); warning.mesh.geometry.dispose(); warning.mesh.material.dispose(); warning = null;
      }
      if (!warning) {
        const circular = ["slam", "opening"].includes(kind);
        const geometry = circular ? new THREE.RingGeometry(kind === "opening" ? .82 : .9, 1, 40) : new THREE.BufferGeometry();
        if (!circular) { geometry.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(12),3)); geometry.setIndex([0,1,2,0,2,3]); }
        const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({color: opening ? "#a9c493" : "#df9760", transparent:true, opacity:.26, side:THREE.DoubleSide,depthWrite:false}));
        mesh.frustumCulled = false; mesh.renderOrder = 1;
        this.combatWarningGroup.add(mesh); warning={mesh,kind};this.combatWarnings.set(enemy.id,warning);
      }
      const mesh = warning.mesh;
      mesh.material.color.set(opening ? "#a9c493" : enemy.move.armor ? "#d5a260" : "#df8461");
      mesh.material.opacity = opening ? .35 : enemy.state === "strike" ? .32 : enemy.aimLocked ? .28 : .18;
      if (kind === "opening" || kind === "slam") {
        mesh.rotation.x=-Math.PI/2;mesh.position.set(enemy.x,.028,enemy.z);
        mesh.scale.set(kind === "opening" ? .75 : move.range,kind === "opening" ? .52 : 1.45,1);
      } else {
        let from={x:enemy.x,z:enemy.z}, to={x:enemy.x+enemy.facing*move.range,z:enemy.z}, width=.78;
        if (kind === "charge") {
          from=enemy.chargeFrom && enemy.aimLocked ? enemy.chargeFrom : from;
          to=enemy.chargeTo && enemy.aimLocked ? enemy.chargeTo : {x:enemy.aimX,z:enemy.aimZ};
          width=.68;
        } else if (kind === "sweep") { from={x:enemy.x-move.range,z:enemy.z};to={x:enemy.x+move.range,z:enemy.z};width=.72; }
        else if (kind === "projectile") { to={x:enemy.aimX,z:enemy.aimZ};width=.33; }
        const length=Math.hypot(to.x-from.x,to.z-from.z)||1,nx=-(to.z-from.z)/length*width,nz=(to.x-from.x)/length*width;
        const points=[from.x+nx,.025,from.z+nz,to.x+nx,.025,to.z+nz,to.x-nx,.025,to.z-nz,from.x-nx,.025,from.z-nz];
        mesh.geometry.getAttribute("position").array.set(points);mesh.geometry.getAttribute("position").needsUpdate=true;
      }
    }
    for(const [id,warning] of this.combatWarnings) if(!active.has(id)) {
      this.combatWarningGroup.remove(warning.mesh);warning.mesh.geometry.dispose();warning.mesh.material.dispose();this.combatWarnings.delete(id);
    }
  }

  update(delta, player, enemies, shakeAmount = 0) {
    this.frameDelta = delta;
    const dt = Math.min(.05, Math.max(0, delta));
    this.ambientTime += dt;
    this.syncActors(player, enemies);
    this.syncCombatWarnings(enemies);
    if (this.currentDrops) this.syncDrops(this.currentDrops, dt);
    if (this.currentProjectiles) this.syncProjectiles(this.currentProjectiles, dt);
    if (this.hazardGlow) {
      this.hazardGlow.material.opacity = .12 + .1 * Math.sin(this.ambientTime * 2.2);
    }
    for (const p of this.particles) {
      p.life -= dt;
      const mesh = p.mesh;
      if (p.kind === "warning") {
        mesh.material.opacity = .65 * Math.max(0, p.life / p.maxLife);
        mesh.scale.setScalar(.92 + (1 - p.life / p.maxLife) * .18);
      } else {
        mesh.position.addScaledVector(mesh.userData.vel, dt);
        mesh.userData.vel.y -= p.kind === "spark" ? 7 * dt : .7 * dt;
        mesh.material.opacity = Math.max(0, p.life / p.maxLife);
        if (p.kind === "spark") mesh.rotation.x += dt * 7;
        if (p.kind === "dust") mesh.scale.multiplyScalar(1 + dt * 1.2);
      }
      if (p.life <= 0) {
        this.particleGroup.remove(mesh);
        this.disposeGroup(mesh);
      }
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    if (shakeAmount > 0) this.shake(shakeAmount);
    let shakeX = 0, shakeY = 0;
    this.shakes.forEach((s) => {
      s.time += dt;
      const fade = Math.max(0, 1 - s.time / s.life);
      shakeX += (Math.random() - .5) * s.amount * fade;
      shakeY += (Math.random() - .5) * s.amount * fade;
    });
    this.shakes = this.shakes.filter((s) => s.time < s.life);
    if (this.levelIndex === 3) {
      for (const child of this.levelGroup.children) {
        child.traverse?.((node) => {
          if (node.userData?.rain) node.position.y = 3.8 + (Math.sin(this.ambientTime * 9 + node.position.x) * .5 + .5) * 1.6;
        });
      }
    }
    const focusX = Math.max(-4.5, Math.min(4.5, player?.x || 0));
    this.camera.position.set(focusX * .32 + shakeX, this.cameraBase.y + shakeY, this.cameraBase.z);
    this.camera.lookAt(focusX * .32, 1.25, 0);
    this.renderer.render(this.scene, this.camera);
  }

  setPickupsAndProjectiles(drops, projectiles) {
    this.currentDrops = drops || [];
    this.currentProjectiles = projectiles || [];
  }

  getPropNear(x, z, max = 1.35) {
    return this.props.find((prop) => !prop.userData.broken && Math.hypot(prop.userData.worldX - x, prop.userData.worldZ - z) < max) || null;
  }

  hitProp(prop) {
    if (!prop || prop.userData.broken) return null;
    prop.userData.hp -= 1;
    prop.scale.multiplyScalar(.93);
    if (prop.userData.hp > 0) return { broken: false };
    prop.userData.broken = true;
    const drop = prop.userData.drop;
    const x = prop.userData.worldX, z = prop.userData.worldZ;
    this.levelGroup.remove(prop);
    this.disposeGroup(prop);
    this.spawnBreak(x, z);
    return { broken: true, drop, x, z };
  }

  dispose() {
    this.canvasObserver?.disconnect();
    this.syncCombatWarnings([]);
    this.clearLevel();
    for (const actor of this.actors.values()) this.removeActor(actor);
    this.actors.clear();
    for (const texture of this.clothTextures.values()) texture.dispose();
    this.clothTextures.clear();
    this.renderer.dispose();
  }
}
