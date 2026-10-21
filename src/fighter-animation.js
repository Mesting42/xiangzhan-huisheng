import * as THREE from "three";

const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
const ease = (v) => { const t = clamp(v); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;
const blendPoint = (a, b, t) => a.map((v, i) => mix(v, b[i], t));

// Targets are in the asset's model space: +Z is forward, +X is the left side.
// Every attack reaches its extended pose at the actual collision startup time.
export function getFighterPose(state, fighterId, clock = 0) {
  const p = {
    hands: { l: [.16, 1.43, .27], r: [-.17, 1.39, .24] },
    elbows: { l: [.46, 1.12, .01], r: [-.46, 1.08, .01] },
    feet: { l: [.14, .10, .18], r: [-.14, .10, -.19] },
    knees: { l: [.16, .62, .55], r: [-.16, .62, .43] },
    footPitch: { l: 0, r: 0 }, lean: .05, twist: -.10,
    crouch: -.065, rootForward: 0, rootLift: 0, turn: 0, roll: 0, rollTuck: 0, openHands: false
  };
  const action = state.action || "idle";
  const moving = state.moveT > 0 && !state.attack && !state.airborne;
  const walk = moving ? Math.sin(state.moveT * (fighterId === "qiao" ? 15 : 11)) : 0;
  if (moving) {
    p.feet.l[2] += walk * .23;
    p.feet.r[2] -= walk * .23;
    p.feet.l[1] += Math.max(0, walk) * .13;
    p.feet.r[1] += Math.max(0, -walk) * .13;
    p.lean = .14;
    p.twist += walk * .06;
  }
  p.hands.l[1] += Math.sin(clock * 3) * .012;
  p.hands.r[1] -= Math.sin(clock * 3) * .012;
  if (state.airborne || action === "jump") {
    p.feet.l = [.15, .34, .22];
    p.feet.r = [-.14, .29, -.17];
    p.crouch = -.03;
    p.hands.l = [.2, 1.46, .23];
    p.hands.r = [-.2, 1.43, .23];
  }
  if (action === "hit") {
    const recoil = Math.sin(clamp((state.hurtT || .12) / .24) * Math.PI / 2);
    p.lean = -.32 * recoil;
    p.twist = .22 * recoil;
    p.crouch = -.14;
    p.hands.l = [.32, 1.25, .05];
    p.hands.r = [-.30, 1.19, .1];
    return p;
  }
  if (action === "dodge") {
    const t = clamp((state.actionElapsed || 0) / (state.actionTotal || .42));
    const tuck = ease(t / .18) * (1 - ease((t - .80) / .20));
    p.roll = Math.PI * 2 * ease((t - .12) / .76);
    p.rollTuck = tuck;
    p.crouch = mix(p.crouch, -.27, tuck);
    p.lean = mix(p.lean, .88, tuck);
    p.twist = mix(p.twist, 0, tuck);
    p.feet.l = blendPoint(p.feet.l, [.14, .68, .28], tuck);
    p.feet.r = blendPoint(p.feet.r, [-.14, .60, .16], tuck);
    p.knees.l = blendPoint(p.knees.l, [.16, .91, .64], tuck);
    p.knees.r = blendPoint(p.knees.r, [-.16, .87, .57], tuck);
    p.hands.l = blendPoint(p.hands.l, [.14, 1.16, .33], tuck);
    p.hands.r = blendPoint(p.hands.r, [-.14, 1.12, .29], tuck);
    p.elbows.l = blendPoint(p.elbows.l, [.30, .95, .30], tuck);
    p.elbows.r = blendPoint(p.elbows.r, [-.30, .92, .26], tuck);
    p.footPitch.l = p.footPitch.r = -.65 * tuck;
    return p;
  }
  if (action === "throw") {
    const t = state.actionElapsed || 0;
    const load = ease(t / .12), release = ease((t - .12) / .10), recover = ease((t - .28) / .28);
    p.hands.r = blendPoint([-.18, 1.38, .28], [-.28, 1.68, -.22], load);
    p.hands.r = blendPoint(p.hands.r, [-.10, 1.42, .72], release);
    p.hands.r = blendPoint(p.hands.r, [-.20, 1.40, .26], recover);
    p.elbows.r = [-.30, 1.30, .18];
    p.twist = -.28 * load + .55 * release - .27 * recover;
    p.lean = -.1 * load + .25 * release - .15 * recover;
    p.rootForward = .12 * release * (1 - recover);
    return p;
  }
  if (!["light", "heavy", "air", "special", "finisher"].includes(action)) return p;

  const move = state.attack?.move || {};
  const startup = Math.max(.04, move.startup || (action === "heavy" ? .3 : .11));
  const active = Math.max(.06, move.active || .16);
  const recovery = Math.max(.08, move.recovery || .3);
  const t = Math.max(0, state.actionElapsed || 0);
  const load = t < startup ? Math.sin(clamp(t / startup) * Math.PI) : 0;
  const drive = t < startup ? ease((t / startup - .45) / .55) :
    t <= startup + active * .55 ? 1 : 1 - ease((t - startup - active * .55) / (active * .45 + recovery));
  const side = ((state.comboStep || 0) % 2 === 0) ? "l" : "r";
  const sign = side === "l" ? 1 : -1;
  const punch = (hand = side, height = 1.45, reach = .62) => {
    const s = hand === "l" ? 1 : -1;
    p.hands[hand] = blendPoint(p.hands[hand], [s * .12, height, reach], drive);
    p.hands[hand][2] -= load * .13;
    p.elbows[hand] = blendPoint(p.elbows[hand], [s * .3, 1.23, .28], Math.max(load, drive));
    p.twist += -s * .38 * drive + s * .22 * load;
    p.lean += .18 * drive - .08 * load;
    p.rootForward += .18 * drive;
  };
  const kick = (hand = "l", height = .96, reach = .75) => {
    const s = hand === "l" ? 1 : -1;
    p.feet[hand] = blendPoint(p.feet[hand], [s * .13, height, reach], drive);
    p.feet[hand][1] += .3 * load;
    p.knees[hand] = blendPoint(p.knees[hand], [s * .18, 1.16, .47], Math.max(load, drive));
    p.footPitch[hand] = -1.35 * drive;
    p.lean -= .26 * drive;
    p.twist += s * .26 * drive;
    p.crouch += .04 * drive;
    p.rootForward += .1 * drive;
  };

  if (action === "light") {
    if (fighterId === "qiao" && state.comboStep === 2) kick("l", 1.06, .73);
    else if (fighterId === "lin" && state.comboStep === 2) {
      punch(side, 1.62, .42);
      p.elbows[side] = blendPoint(p.elbows[side], [sign * .12, 1.55, .5], drive);
      p.crouch -= .12 * load;
      p.rootForward += .08 * drive;
    } else {
      punch(side, fighterId === "tie" ? 1.4 : 1.45, fighterId === "tie" ? .65 : .62);
      if (fighterId === "tie") { p.crouch -= .12 * load; p.lean += .12 * drive; }
      if (fighterId === "qiao" && state.comboStep === 3) p.openHands = true;
    }
  } else if (action === "heavy") {
    p.crouch -= .19 * load;
    if (fighterId === "qiao") kick("l", .85, .84);
    else if (fighterId === "tie") {
      for (const hand of ["l", "r"]) {
        const s = hand === "l" ? 1 : -1;
        p.hands[hand] = blendPoint(p.hands[hand], blendPoint([s * .28, 1.05, .24], [s * .14, 1.72, .44], drive), Math.max(load, drive));
        p.elbows[hand] = blendPoint(p.elbows[hand], [s * .38, 1.25, .25], Math.max(load, drive));
      }
      p.lean = -.16 * load + .28 * drive;
      p.rootForward = .28 * drive;
    } else { punch("r", 1.36, .69); p.lean += .21 * drive; p.rootForward += .14 * drive; }
  } else if (action === "air") {
    if (fighterId === "tie") {
      punch("r", 1.24, .54);
      p.elbows.r = blendPoint(p.elbows.r, [-.15, 1.42, .5], drive);
      p.lean += .28 * drive;
    } else kick("l", 1.0, .78);
  } else if (action === "special") {
    if (fighterId === "tie") {
      p.hands.l = blendPoint(p.hands.l, [.15, 1.37, .18], drive);
      p.hands.r = blendPoint(p.hands.r, [-.16, 1.3, .16], drive);
      p.lean = .1 + .52 * drive; p.twist = -.35 * drive;
      p.crouch -= .16 * load; p.rootForward = .38 * drive;
    } else {
      punch("l", 1.43, .67);
      if (fighterId === "lin") { punch("r", 1.39, .64); p.openHands = true; }
      else { p.lean += .18 * drive; p.rootForward += .2 * drive; }
    }
  } else if (action === "finisher") {
    p.crouch -= .22 * load;
    if (fighterId === "qiao") {
      p.turn = Math.PI * 2 * ease(t / startup);
      kick("r", 1.28, .78);
      p.rootForward += .12 * drive;
    } else if (fighterId === "tie") {
      for (const hand of ["l", "r"]) {
        const s = hand === "l" ? 1 : -1;
        p.hands[hand] = blendPoint(p.hands[hand], blendPoint([s * .14, 1.96, .1], [s * .1, 1.12, .64], drive), Math.max(load, drive));
        p.elbows[hand] = blendPoint(p.elbows[hand], [s * .36, 1.47, .35], Math.max(load, drive));
      }
      p.lean = .5 * drive - .13 * load; p.rootForward = .32 * drive;
    } else {
      punch("r", 1.77, .48);
      p.rootForward += .19 * drive;
      p.lean = -.1 * drive;
    }
  }
  if (move.branch === "launcher") {
    p.hands.r = blendPoint([-.16, 1.0, .2], [-.1, 1.75, .5], drive);
    p.elbows.r = [-.24, 1.35, .25]; p.lean = -.18 * drive; p.crouch -= .1 * load;
  }
  if (move.grab) {
    const release = ease((t - startup - .1) / .16);
    p.openHands = true;
    p.hands.l = blendPoint([.17, 1.28, .5], [.14, 1.62, .66], release);
    p.hands.r = blendPoint([-.17, 1.24, .49], [-.14, 1.59, .64], release);
    p.elbows.l = [.3,1.16,.22]; p.elbows.r = [-.3,1.14,.22];
    p.crouch = -.15; p.lean = -.1 + .6 * release; p.twist = -.25 * release;
  }
  return p;
}

export function bindFighterRig(root, outfit) {
  const all = [], bones = new Map(), footRest = new Map();
  root.updateWorldMatrix(true, true);
  root.traverse((bone) => {
    if (bone.isBone) all.push({ bone, quaternion: bone.quaternion.clone(), position: bone.position.clone() });
  });
  outfit.traverse((bone) => { if (bone.isBone) bones.set(bone.name, bone); });
  const inverseRoot = root.matrixWorld.clone().invert();
  for (const side of ["l", "r"]) {
    const foot = bones.get("foot_" + side);
    if (foot) footRest.set(side, new THREE.Quaternion().setFromRotationMatrix(inverseRoot.clone().multiply(foot.matrixWorld)));
  }
  return { root, all, bones, footRest };
}

const pos = (bone) => bone.getWorldPosition(new THREE.Vector3());
function aimBone(bone, child, destination) {
  const inverseParent = bone.parent.matrixWorld.clone().invert();
  const origin = bone.position;
  const from = pos(child).applyMatrix4(inverseParent).sub(origin).normalize();
  const to = destination.clone().applyMatrix4(inverseParent).sub(origin).normalize();
  const delta = new THREE.Quaternion().setFromUnitVectors(from, to);
  bone.quaternion.premultiply(delta);
  bone.updateWorldMatrix(false, true);
}

export function solveLimb(root, upper, lower, end, target, pole) {
  if (!upper || !lower || !end) return;
  const inverseRoot = root.matrixWorld.clone().invert();
  const origin = pos(upper).applyMatrix4(inverseRoot), elbow = pos(lower).applyMatrix4(inverseRoot), wrist = pos(end).applyMatrix4(inverseRoot);
  const a = origin.distanceTo(elbow), b = elbow.distanceTo(wrist);
  const destination = new THREE.Vector3(...target);
  const forward = destination.clone().sub(origin);
  const distance = clamp(forward.length(), Math.abs(a - b) + .001, a + b - .002);
  forward.normalize();
  destination.copy(origin).addScaledVector(forward, distance);
  const bend = new THREE.Vector3(...pole).sub(origin);
  bend.addScaledVector(forward, -bend.dot(forward)).normalize();
  const along = (a * a - b * b + distance * distance) / (2 * distance);
  const height = Math.sqrt(Math.max(0, a * a - along * along));
  const elbowTarget = origin.clone().addScaledVector(forward, along).addScaledVector(bend, height);
  aimBone(upper, lower, elbowTarget.applyMatrix4(root.matrixWorld));
  aimBone(lower, end, destination.applyMatrix4(root.matrixWorld));
}

export function applyFighterPose(binding, pose) {
  const { root, all, bones, footRest } = binding;
  for (const { bone, quaternion, position } of all) {
    bone.quaternion.copy(quaternion);
    bone.position.copy(position);
    if (bone.name === "pelvis") bone.position.y += pose.crouch;
    if (/^spine_0[123]$/.test(bone.name)) { bone.rotateX(pose.lean / 3); bone.rotateY(pose.twist / 3); }
    if (bone.name === "neck_01") bone.rotateX(-pose.lean * .45);
    if (!pose.openHands && /^(index|middle|ring|pinky)_0[123]_[lr]$/.test(bone.name)) bone.rotateX(1.15);
    if (!pose.openHands && /^thumb_0[23]_[lr]$/.test(bone.name)) bone.rotateX(.65);
  }
  root.updateWorldMatrix(true, true);
  for (const side of ["l", "r"]) {
    solveLimb(root, bones.get("upperarm_" + side), bones.get("lowerarm_" + side), bones.get("hand_" + side), pose.hands[side], pose.elbows[side]);
    solveLimb(root, bones.get("thigh_" + side), bones.get("calf_" + side), bones.get("foot_" + side), pose.feet[side], pose.knees[side]);
    const foot = bones.get("foot_" + side);
    if (foot && footRest.has(side)) {
      const desired = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), pose.footPitch[side])
        .multiply(footRest.get(side));
      const parentInRoot = root.matrixWorld.clone().invert().multiply(foot.parent.matrixWorld);
      const parentRotation = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().extractRotation(parentInRoot));
      foot.quaternion.copy(parentRotation.invert().multiply(desired));
      foot.updateWorldMatrix(false, true);
    }
  }
}
