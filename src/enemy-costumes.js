import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

const cloth = (color, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness: metalness ? .48 : .88, metalness });

function batchClothing(group) {
  group.updateMatrixWorld(true);
  const inverse = group.matrixWorld.clone().invert(), batches = new Map(), originals = [];
  group.traverse(node => {
    if (!node.isMesh) return;
    const material = node.material;
    const key = [material.color.getHex(), material.roughness, material.metalness, material.side].join(":");
    if (!batches.has(key)) batches.set(key, { material, geometries: [] });
    const geometry = node.geometry.index ? node.geometry.toNonIndexed() : node.geometry.clone();
    geometry.deleteAttribute("uv");
    geometry.applyMatrix4(inverse.clone().multiply(node.matrixWorld));
    batches.get(key).geometries.push(geometry); originals.push(node);
  });
  group.clear();
  for (const { material, geometries } of batches.values()) {
    const geometry = mergeGeometries(geometries);
    const mesh = new THREE.Mesh(geometry, material.clone()); mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh); geometries.forEach(part => part.dispose());
  }
  originals.forEach(node => { node.geometry.dispose(); node.material.dispose(); });
  return group;
}

// Alter the cloned meshes only. The original CC0 assets and player outfits stay intact.
export function tailorEnemyMesh(mesh, profile, head = false) {
  const position = mesh.geometry?.getAttribute("position");
  if (!position) return;
  const name = mesh.name.toLowerCase();
  if (/hood|pauldron|bracer|belt/.test(name)) mesh.visible = false;
  const body = /body/.test(name) && !/belt/.test(name);
  const colors = [];
  const skinMaterial = /regular|skin/i.test(mesh.material?.name || "");
  const shirt = new THREE.Color(profile.shirt), pants = new THREE.Color(profile.pants);
  const skin = new THREE.Color(profile.skin), shoe = new THREE.Color("#242a2d");
  for (let i = 0; i < position.count; i++) {
    let x = position.getX(i), y = position.getY(i), z = position.getZ(i);
    if (head) {
      // Distinct jaw and nose profiles, applied consistently to the imported face.
      const jaw = Math.max(0, 1 - Math.abs(y - 1.53) / .16);
      x *= profile.face === "broad" ? 1 + .20 * jaw : profile.face === "lean" ? 1 - .13 * jaw : 1 + .09 * jaw;
      if (z > .03 && y < 1.68) z += (profile.face === "broad" ? .014 : profile.face === "lean" ? .027 : .009) * jaw;
    } else if (body) {
      if (profile.costume !== "longcoat" && y < 1.13) y = 1.13 + (y - 1.13) * .52;
      const belly = Math.max(0, 1 - Math.abs(y - 1.20) / .26);
      if (["workvest", "foreman", "enforcer"].includes(profile.costume)) { x *= 1 + .14 * belly; z += Math.sign(z) * .026 * belly; }
      if (profile.costume === "longcoat" && y < 1.15) y -= (1.15 - y) * .7;
    }
    position.setXYZ(i, x, y, z);
    let color = head || skinMaterial ? skin : /legs/.test(name) ? pants : /feet/.test(name) ? (y > .22 ? pants : shoe) : shirt;
    if (profile.costume === "safety" && /arms/.test(name) && !skinMaterial) color = pants;
    if (profile.costume === "workvest" && /arms/.test(name) && !skinMaterial) color = new THREE.Color("#b9b09b");
    if (/eyes|eyebrows/i.test(name)) color = new THREE.Color("#24292a");
    colors.push(color.r, color.g, color.b);
  }
  position.needsUpdate = true;
  mesh.geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  mesh.geometry.computeVertexNormals(); mesh.geometry.computeBoundingBox(); mesh.geometry.computeBoundingSphere();
  // Plain woven cloth removes fantasy leather tooling and medieval atlas details.
  const material = cloth("#ffffff"); material.vertexColors = true;
  for (const original of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) original.dispose();
  mesh.material = material;
}

function panel(points, color, depth = .014) {
  const shape = new THREE.Shape();
  points.forEach(([x, y], i) => i ? shape.lineTo(x, y) : shape.moveTo(x, y)); shape.closePath();
  const mesh = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelSize: .008, bevelThickness: .006, bevelSegments: 2, steps: 1 }), cloth(color));
  return mesh;
}

function ellipsoid(parent, size, position, color) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), cloth(color));
  mesh.scale.set(...size); mesh.position.set(...position); parent.add(mesh); return mesh;
}

function tube(parent, points, radius, color, metal = 0) {
  const path = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)));
  const mesh = new THREE.Mesh(new THREE.TubeGeometry(path, 16, radius, 7, false), cloth(color, metal));
  parent.add(mesh); return mesh;
}

function ovalShell(rx, rz, rings, color, open = false) {
  const points = [], indices = [], segments = 32;
  rings.forEach(([y, scale], j) => {
    for (let i = 0; i <= segments; i++) {
      const angle = (open ? .2 : 0) + i / segments * (Math.PI * 2 - (open ? .4 : 0));
      points.push(Math.sin(angle) * rx * scale, y, Math.cos(angle) * rz * scale);
      if (j && i) { const a = j * (segments + 1) + i, b = a - segments - 1; indices.push(a, b, a - 1, b, b - 1, a - 1); }
    }
  });
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute("position", new THREE.Float32BufferAttribute(points, 3)); geometry.setIndex(indices); geometry.computeVertexNormals();
  const material = cloth(color); material.side = THREE.DoubleSide;
  return new THREE.Mesh(geometry, material);
}

export function makeEnemyHair(profile) {
  const group = new THREE.Group(); group.name = "enemy-hair-" + profile.hair;
  const dark = profile.hair === "topknot" ? "#434342" : "#252b2b";
  if (profile.hair === "bald") {
    // The imported head already contains the complete scalp; no floating hair cap.
    return group;
  } else if (profile.hair === "mohawk") {
    const crest = panel([[-.13, 1.73], [-.12, 1.83], [-.05, 1.88], [.01, 1.86], [.06, 1.87], [.13, 1.81], [.12, 1.73]], dark, .065);
    crest.rotation.y = Math.PI / 2; crest.position.x = -.033; group.add(crest);
  } else if (profile.hair === "asymmetric") {
    const cap = new THREE.Mesh(new THREE.SphereGeometry(.154, 24, 16, 0, Math.PI * 2, 0, 1.8), cloth(dark));
    cap.position.set(0, 1.73, -.012); cap.scale.set(1.08, .86, 1.08); group.add(cap);
    const fringe = panel([[-.16, 1.77], [.15, 1.79], [.08, 1.61], [-.03, 1.69], [-.16, 1.62]], dark, .035);
    fringe.position.z = .105; group.add(fringe);
    ellipsoid(group, [.045, .14, .12], [-.13, 1.62, -.015], dark);
  } else {
    const cap = new THREE.Mesh(new THREE.SphereGeometry(.151, 24, 16, 0, Math.PI * 2, 0, profile.hair === "slick" ? 1.55 : 1.15), cloth(dark));
    cap.position.set(0, 1.74, -.015); cap.scale.set(1.05, .82, 1.04); group.add(cap);
    if (profile.hair === "topknot") {
      ellipsoid(group, [.066, .085, .062], [0, 1.89, -.035], dark);
      tube(group, [[-.07, 1.81, -.07], [0, 1.85, -.10], [.07, 1.81, -.07]], .009, profile.accent);
    } else {
      ellipsoid(group, [.125, .047, .105], [.025, 1.83, -.015], dark);
      for (const x of [-.08, -.035, .015, .065]) tube(group, [[x, 1.78, .10], [x + .025, 1.84, .025], [x + .04, 1.78, -.12]], .006, profile.hair === "undercut" ? "#8e9693" : "#434747");
    }
  }
  return batchClothing(group);
}

export function addEnemyCostume(actor, profile) {
  const rig = actor.modelRoot;
  const attach = (part, bone, label) => {
    if (label) part.name = label;
    batchClothing(part);
    rig.add(part); rig.updateMatrixWorld(true); actor.skeletalRig.bones.get(bone)?.attach(part);
    part.traverse(node => { if (node.isMesh) { node.castShadow = true; node.receiveShadow = true; } });
  };
  const chest = new THREE.Group(); chest.name = "costume-" + profile.costume;
  const bulky = ["workvest", "foreman", "security", "enforcer"].includes(profile.costume);
  const rx = bulky ? .238 : .212, rz = bulky ? .169 : .148;
  const vest = ovalShell(rx, rz, [[1.12,.83],[1.19,.97],[1.37,1.02],[1.45,.96],[1.50,.78]], profile.shirt, true);
  chest.add(vest);
  // Separate undershirt, zipper, stitched collar and pockets make a garment rather than a recolour.
  const inner = panel([[-.085,1.14],[.085,1.14],[.09,1.44],[.065,1.51],[-.065,1.51],[-.09,1.44]], ["security","suit"].includes(profile.costume) ? "#c8c8b9" : "#c4bca7");
  inner.position.z = rz + .003; chest.add(inner);
  const lapels = ["biker","enforcer","suit","cropped","longcoat"].includes(profile.costume);
  for (const sign of [-1,1]) {
    const collar = panel(lapels ? [[sign*.04,1.43],[sign*.09,1.54],[sign*.17,1.45],[sign*.10,1.33]] : [[sign*.03,1.43],[sign*.055,1.51],[sign*.14,1.49],[sign*.10,1.42]], profile.costume === "safety" ? profile.accent : profile.shirt);
    collar.position.z = rz + .022; chest.add(collar);
    const pocket = panel([[sign*.095,1.24],[sign*.185,1.24],[sign*.181,1.33],[sign*.10,1.33]], profile.costume === "security" ? "#1d2a39" : profile.shirt, .022);
    pocket.position.z = rz - .015; chest.add(pocket);
    tube(chest, [[sign*.10,1.319,rz+.013],[sign*.18,1.319,rz+.005]], .0055, profile.accent);
  }
  if (["safety","foreman"].includes(profile.costume)) {
    for (const sign of [-1,1]) {
      const stripe = panel([[sign*.095,1.16],[sign*.13,1.16],[sign*.155,1.47],[sign*.12,1.48]], profile.accent, .005); stripe.position.z = rz + .033; chest.add(stripe);
      const backStripe = stripe.clone(); backStripe.geometry = stripe.geometry.clone(); backStripe.material = stripe.material.clone(); backStripe.rotation.y = Math.PI; backStripe.position.z = -rz-.032; chest.add(backStripe);
    }
    const belt = ovalShell(rx+.006,rz+.035,[[1.19,.97],[1.23,.98]],profile.accent); chest.add(belt);
  }
  if (profile.costume === "foreman") {
    const apron = panel([[-.16,.84],[.16,.84],[.19,1.18],[.15,1.40],[-.15,1.40],[-.19,1.18]], "#4b3c2f", .022);
    apron.position.z = rz+.045; chest.add(apron);
    tube(chest,[[-.13,1.37,rz+.075],[.13,1.37,rz+.075]],.012,profile.accent);
  }
  if (profile.costume === "suit") {
    const tie=panel([[-.025,1.44],[.025,1.44],[.037,1.25],[0,1.21],[-.037,1.25]],profile.accent);tie.position.z=rz+.031;chest.add(tie);
    for(const sign of [-1,1]) ellipsoid(chest,[.055,.015,.13],[sign*.23,1.45,-.012],profile.shirt);
  }
  if (profile.costume === "security") {
    const badge=panel([[-.025,0],[.025,0],[.025,.05],[0,.067],[-.025,.05]],"#b7ad79");badge.position.set(.12,1.36,rz+.027);chest.add(badge);
    for(const sign of [-1,1]) { const shoulder=ovalShell(.10,.12,[[1.43,1],[1.47,1]],"#1e2d40");shoulder.position.x=sign*.23;chest.add(shoulder); }
  }
  if (profile.costume === "courier") {
    tube(chest,[[-.20,1.48,.10],[0,1.32,rz+.05],[.18,1.16,.10]],.026,"#393b38");
    const bag=panel([[-.105,-.10],[.09,-.12],[.12,.10],[-.08,.12]],"#755c41",.075);bag.position.set(.18,1.13,.02);bag.rotation.y=.8;chest.add(bag);
  }
  if (profile.costume === "enforcer") tube(chest,[[-.11,1.48,rz+.03],[0,1.35,rz+.055],[.11,1.48,rz+.03]],.014,profile.accent,.55);
  if (["bomber","biker","cropped"].includes(profile.costume)) {
    chest.add(ovalShell(rx,rz+.01,[[1.12,.87],[1.18,.91]],"#313735"));
    tube(chest,[[.035,1.18,rz+.03],[.04,1.34,rz+.03],[.055,1.43,rz+.02]],.008,profile.accent,.3);
  }
  attach(chest,"spine_02");

  const head = new THREE.Group(); head.name="enemy-headgear-"+profile.headwear;
  if (profile.headwear === "hardhat") {
    const dome=new THREE.Mesh(new THREE.SphereGeometry(.174,32,18,0,Math.PI*2,0,Math.PI/2),cloth(profile.accent));dome.position.y=1.75;dome.scale.set(1.12,.91,1.12);head.add(dome);
    const brim=ovalShell(.216,.225,[[1.735,1],[1.76,1]],profile.accent);head.add(brim);
    tube(head,[[0,1.76,.18],[0,1.92,.03],[0,1.78,-.18]],.017,profile.accent);
    tube(head,[[-.16,1.75,.04],[-.13,1.54,.02],[0,1.51,.10],[.13,1.54,.02],[.16,1.75,.04]],.009,"#414843");
  } else if (profile.headwear === "securitycap") {
    head.add(ovalShell(.177,.163,[[1.73,1],[1.79,1.04],[1.84,.9],[1.845,0]],"#25374b"));
    const brim=panel([[-.17,-.03],[-.19,.12],[-.12,.24],[.12,.24],[.19,.12],[.17,-.03]],"#202b36",.014);brim.rotation.x=Math.PI/2;brim.position.set(0,1.73,.10);head.add(brim);
    const badge=panel([[-.025,0],[.025,0],[.035,.04],[0,.065],[-.035,.04]],profile.accent);badge.position.set(0,1.75,.168);head.add(badge);
  } else if (profile.headwear === "beanie") {
    const cap=new THREE.Mesh(new THREE.SphereGeometry(.16,24,16,0,Math.PI*2,0,Math.PI*.52),cloth("#393e43"));cap.position.set(0,1.74,-.013);cap.scale.y=1.17;head.add(cap);
    head.add(ovalShell(.161,.16,[[1.69,1],[1.75,1]],"#51575a"));
    for(let i=0;i<12;i++){const a=i/12*Math.PI*2;tube(head,[[Math.sin(a)*.161,1.70,Math.cos(a)*.16],[Math.sin(a)*.162,1.75,Math.cos(a)*.161]],.003,"#6e7474");}
  }
  if (["courier","foreman"].includes(profile.costume)) {
    const mask=panel([[-.12,1.63],[-.09,1.59],[.09,1.59],[.12,1.63],[.10,1.68],[-.10,1.68]],profile.costume==="foreman"?"#4b5050":"#384b50",.035);mask.position.z=.115;head.add(mask);
    if(profile.costume==="foreman")for(const sign of [-1,1])ellipsoid(head,[.043,.045,.026],[sign*.075,1.635,.165],"#77796b");
  }
  if (["biker","cropped","suit"].includes(profile.costume)) {
    for(const sign of [-1,1]) {const lens=panel([[-.047,-.023],[.040,-.023],[.048,.019],[-.05,.022]],"#202d32",.008);lens.position.set(sign*.053,1.704,.104);head.add(lens);}
    tube(head,[[-.10,1.72,.105],[0,1.72,.13],[.10,1.72,.105]],.006,profile.accent,.4);
  }
  if (["broad","square"].includes(profile.face)) {
    // An angular moustache and jaw stubble differ from the clean-faced heroes.
    const stubble=panel([[-.09,1.63],[-.065,1.57],[.06,1.57],[.095,1.63],[.055,1.605],[-.05,1.605]],"#4b433d",.005);stubble.position.z=.09;head.add(stubble);
  }
  attach(head,"Head");
  for (const side of ["l","r"]) {
    const glove = new THREE.Group(); const bone=actor.skeletalRig.bones.get("hand_"+side);
    if(bone && ["security","biker","foreman","enforcer"].includes(profile.costume)) {
      ellipsoid(glove,[.055,.065,.05],[0,.0,.014],"#303a3b");bone.add(glove);glove.name="work-glove";
    }
    if (["safety","security","foreman"].includes(profile.costume)) {
      const pad=new THREE.Group();ellipsoid(pad,[.085,.11,.04],[0,-.02,.08],"#343f43");actor.skeletalRig.bones.get("calf_"+side)?.add(pad);pad.name="knee-pad";
    }
  }
  actor.costume = profile.costume;
}
