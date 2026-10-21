import { getFighterPose } from "./fighter-animation.js";

const clamp = (value) => Math.max(0, Math.min(1, value));
const ease = (value) => { const t = clamp(value); return t * t * (3 - 2 * t); };
const blend = (a, b, t) => a.map((value, index) => value + (b[index] - value) * t);

// Enemy AI has distinct windup, strike and recovery clocks. Use those clocks
// directly so the visible impact occurs at the same time as checkEnemyStrike.
export function getEnemyPose(state, clock = 0) {
  const p = getFighterPose({ action: state.action === "hit" ? "hit" : "idle", hurtT: state.hurtT,
    airborne: state.airborne, moveT: ["walk", "entering"].includes(state.state) ? (state.moveT || clock) : 0 }, "lin", clock);
  if (state.state === "grabbed") {
    p.lean = -.5; p.crouch = -.16; p.hands.l = [.3,1.5,.2]; p.hands.r = [-.3,1.48,.18];
    p.feet.l = [.15,.35,.2]; p.feet.r = [-.15,.4,-.1]; return p;
  }
  if (state.state === "down") { p.crouch = -.48; p.lean = .75; p.hands.l = [.2,.75,.4]; p.hands.r = [-.2,.77,.4]; return p; }
  if (state.state === "staggered") { p.crouch = -.23; p.lean = .38; p.hands.l = [.3,1.05,.15]; p.hands.r = [-.3,1.0,.1]; return p; }
  if (state.state === "entering") {
    p.lean = state.boss ? .12 : .23;
    p.hands.l[1] -= .12; p.hands.r[1] -= .12;
    return p;
  }
  if (state.action === "hit" || state.state === "hurt") return p;
  const style = state.boss ? state.style : (state.type || "swift");
  const heavy = ["heavy", "ram", "slam"].includes(style);
  if (heavy) { p.hands.l[1] -= .11; p.hands.r[1] -= .11; p.feet.l[0] = .2; p.feet.r[0] = -.2; p.crouch -= .04; }
  if (state.guard) {
    p.hands.l = [.10, 1.60, .25]; p.hands.r = [-.10, 1.55, .28];
    p.elbows.l = [.29, 1.23, .27]; p.elbows.r = [-.29, 1.22, .26]; p.lean = -.07;
  }
  if (state.action === "special" && state.phase > 1 && !state.move) {
    p.hands.l = [.27, 1.18, .12]; p.hands.r = [-.27, 1.18, .12]; p.lean = -.1;
    return p;
  }
  if (!state.move || !["windup", "feint", "strike", "recover"].includes(state.state)) return p;
  const move = state.move;
  const load = state.state === "windup" || state.state === "feint";
  const recovery = state.state === "recover";
  const w = load ? ease(1 - (state.windup || 0) / Math.max(.01, move.startup)) : 1;
  const release = recovery ? 1 - ease(1 - (state.recoverT || 0) / Math.max(.01, move.recovery)) : 1;
  const strength = load ? w : release;
  const ready = { l: [...p.hands.l], r: [...p.hands.r] };
  let prep = { l: [...p.hands.l], r: [-.30, 1.32, -.13] };
  let hit = { l: [...p.hands.l], r: [-.10, 1.42, .67] };
  let leanPrep = -.16, leanHit = .25, twistPrep = .3, twistHit = -.38;
  let crouchPrep = -.1, forward = .15;
  let kick = false;
  if (move.kind === "sweep") {
    prep.r = [-.35,1.38,-.15]; prep.l = [.3,1.35,.15]; hit.r = [.35,1.35,.60]; hit.l = [.32,1.30,.35];
    twistPrep = .6; twistHit = -.7; leanPrep = -.1; leanHit = .15;
  } else if (move.kind === "projectile") {
    prep.r = [-.25, 1.73, -.25]; prep.l = [.17, 1.43, .4];
    hit.r = [-.11, 1.51, .68]; hit.l = [.28, 1.15, .16];
    leanPrep = -.18; leanHit = .3; twistPrep = .45; twistHit = -.48; p.openHands = !load;
  } else if (move.kind === "slam" || style === "heavy") {
    prep = { l: [.19, 1.98, .04], r: [-.19, 1.94, .05] };
    hit = { l: [.12, .99, .58], r: [-.12, 1.02, .58] };
    leanPrep = -.19; leanHit = .57; twistPrep = 0; twistHit = .08; crouchPrep = -.17; forward = .2;
  } else if (move.kind === "charge") {
    prep = { l: [.13, 1.33, .12], r: [-.14, 1.26, .11] };
    hit = { l: [.15, 1.4, .48], r: [-.16, 1.34, .45] };
    leanPrep = -.25; leanHit = .64; twistPrep = .14; twistHit = -.22; crouchPrep = -.23; forward = .21;
    if (style === "dart") kick = true;
  } else if (["elite", "feint"].includes(style)) {
    kick = true; leanPrep = .03; leanHit = -.22; twistPrep = -.22; twistHit = .32; forward = .08;
  } else if (style === "guard") {
    prep.r = [-.16, 1.57, .14]; prep.l = [.10, 1.55, .28];
    hit.l = [.10, 1.55, .28]; hit.r = [-.11, 1.45, .65];
  }
  for (const side of ["l", "r"]) {
    p.hands[side] = blend(ready[side], load ? prep[side] : hit[side], strength);
    const s = side === "l" ? 1 : -1;
    const elbow = load && (move.kind === "slam" || style === "heavy") ? [s * .38, 1.65, -.1] : [s * .32, 1.19, .3];
    p.elbows[side] = blend(p.elbows[side], elbow, strength);
  }
  if (kick) {
    p.hands.l = ready.l; p.hands.r = ready.r;
    p.feet.l = blend(p.feet.l, load ? [.14, .46, .16] : [.13, 1.1, .78], strength);
    p.knees.l = blend(p.knees.l, [.16, 1.2, .4], strength);
    p.footPitch.l = load ? -.35 * strength : -1.3 * strength;
  }
  p.lean += (load ? leanPrep : leanHit) * strength;
  p.twist += (load ? twistPrep : twistHit) * strength;
  p.crouch += load ? crouchPrep * strength : (move.kind === "slam" ? -.17 : -.03) * strength;
  p.rootForward = load ? -.06 * strength : forward * strength;
  if (state.state === "feint") { p.openHands = true; p.hands.r[1] += .14; p.twist += .14; }
  return p;
}
