const hit = (name, cue, values = {}) => ({ name, cue, kind: "line", startup: .48, active: .16, recovery: .72,
  range: 1.65, knock: 1.8, stun: .36, height: "mid", ...values });
const rush = (name, values = {}) => hit(name, "锁定路线后冲撞 · 翻滚或换线，落空后追击", {
  kind: "charge", startup: .86, active: .48, recovery: 1.1, range: 4.1, armor: true, ...values });
const ground = (name, values = {}) => hit(name, "砸地 · 跳跃避开，落地后反击", {
  kind: "slam", startup: 1, active: .22, recovery: 1.22, range: 2.2, armor: true, ...values });
const sweep = (name, values = {}) => hit(name, "横扫 · 沿纵深换线，随后靠近反击", {
  kind: "sweep", startup: .78, active: .23, recovery: .95, range: 2.3, armor: true, ...values });
const shot = (name, values = {}) => hit(name, "投掷瞄准 · 换线接近", { kind: "projectile", startup: .72, active: .16, recovery: .8, range: 8.2, ...values });

export const BOSS_POISE = { ram: 76, dart: 58, slam: 94, feint: 56, tactician: 80 };

export function chooseBossMove(boss, player) {
  if (boss.pendingFollowUp) return { ...boss.pendingFollowUp };
  const n = boss.phasePattern || 0, distance = Math.abs(player.x - boss.x), phase2 = boss.phase > 1;
  let move;
  if (boss.style === "ram") {
    move = distance > 2.1 ? rush("巷口冲撞") : n % 2 ? sweep("拦街摆臂", { range: 1.95, startup: .72 }) : hit("逼退短拳", "近身短拳 · 拉开半步后反击", { startup: .4, range: 1.45, recovery: .6 });
  } else if (boss.style === "dart") {
    move = distance > 3.4 || n % 3 === 2 ? shot("红袖掷签", { startup: .65 }) : n % 3 === 1 ? rush("追风突步", { startup: .64, active: .38, range: 3.2, recovery: .9 }) : hit("低身扫腿", "扫腿 · 跳跃或退出近身", { startup: .5, range: 1.8, low: true, height: "low" });
  } else if (boss.style === "slam") {
    move = distance > 3.1 ? rush("重步压进", { startup: 1, active: .65, range: 3.8, recovery: 1.25 }) : n % 2 ? sweep("炉前横抡", { startup: .9, range: 2.45 }) : ground("炉锤震地", { startup: 1.05, range: 2.35 });
  } else if (boss.style === "feint") {
    move = distance > 2.7 ? rush("掠步截路", { startup: .75, range: 3.5, active: .4 }) : n % 2 ? hit("虚步追拳", "虚招摊掌 · 留意落步后的追拳", { feint: true, startup: .48, followStartup: .36, recovery: .95, range: 1.95 }) : hit("实步踢击", "实招收拳 · 直接踢出，及时换线", { startup: .62, range: 1.95, recovery: .9 });
  } else {
    if (phase2 && n % 3 === 1) {
      move = sweep("第二式 · 横扫接掌", { recovery: .28, followUp: hit("第二式 · 追击掌", "连段未完 · 再避追掌后反击", { startup: .46, recovery: 1.15, range: 2.05, armor: true }) });
    } else if (n % 4 === 3 || distance > 4.3) move = shot(phase2 ? "第二式 · 掷击封路" : "飞身掷击");
    else if (distance > 2.1 || n % 3 === 2) move = rush(phase2 ? "第二式 · 追身突进" : "贴身进拳", { startup: phase2 ? .70 : .82, active: .46, recovery: 1 });
    else move = phase2 ? ground("第二式 · 震步掌", { startup: .82, range: 2.05 }) : hit("试手连拳", "短拳试手 · 躲开后短连招反击", { startup: .42, recovery: .65 });
  }
  return { ...move, damage: boss.damage + (move.armor ? 3 : 0) };
}
