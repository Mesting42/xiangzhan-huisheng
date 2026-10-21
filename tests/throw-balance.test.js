import assert from "node:assert/strict";
import { fixture, tick } from "./battle-depth.test.js";
import { projectileContact } from "../src/projectiles.js";
import { FIGHTERS, LEVELS, ENEMIES, DIFFICULTIES } from "../src/data.js";
import { MOVEBOOK } from "../src/combat.js";
import { getFighterPose } from "../src/fighter-animation.js";

const victim = { x: 1, z: 0, y: 0, health: 100, invulnerable: 0 };
assert.ok(projectileContact({x:-2,y:1.2,z:0},{x:3,y:1.1,z:0},victim) !== null, "a fast throw cannot skip its target");
assert.equal(projectileContact({x:-2,y:1.2,z:0},{x:3,y:1.1,z:0},{...victim,z:1.5}),null,"depth lanes remain separate");
assert.equal(projectileContact({x:-2,y:3,z:0},{x:3,y:3,z:0},victim),null,"a throw above a target cannot hit");
assert.equal(projectileContact({x:-2,y:1.2,z:0},{x:3,y:1.1,z:0},{...victim,invulnerable:1}),null);

const empty=fixture();let message="";empty.ui.toast=text=>message=text;
assert.equal(empty.throwWeapon(),false);assert.match(message,/没有短棍/);
for (const fighter of FIGHTERS) for (const facing of [-1,1]) {
  const game=fixture(fighter.id), p=game.player;
  p.facing=facing;
  const foe=game.makeEnemy("guard",facing*2.3,0);foe.guard=true;foe.cooldown=999;game.enemies=[foe];
  game.spawnDrop("club",p.x,p.z);game.interact();
  assert.ok(p.weapon,"actual pickup equips the club");
  assert.equal(game.throwWeapon(),true);assert.equal(game.projectiles.length,0,"windup precedes release");
  tick(game,.12);assert.ok(p.weapon,"weapon stays in the hand during windup");
  tick(game,.09);assert.equal(p.weapon,null);assert.equal(game.projectiles.length,1);
  // Turning after release cannot reverse the throw's knockback.
  p.facing=-facing;tick(game,.4);
  assert.ok(foe.health<foe.maxHealth,fighter.id+" throwing damages a guard");
  assert.equal(game.projectiles.length,0,"one target consumes the thrown club");
  assert.equal(p.hits,1,"no duplicate hit on a later frame");
  assert.ok(foe.vx*facing>0,"knockback follows projectile travel");
  const pose=getFighterPose({action:"throw",actionElapsed:.18},fighter.id);
  assert.ok(pose.hands.r[2]>.25,"the arm visibly follows through");
}
const stop=fixture();stop.player.weapon={time:14,hits:5};stop.hitStop=.03;
stop.input.sample=()=>({pressed:{throw:true},moveX:0,moveZ:0});stop.update(.05);
stop.input.sample=()=>({pressed:{},moveX:0,moveZ:0});stop.update(.02);
assert.equal(stop.player.action,"throw","G pressed during hit stop is retained");
const interrupted=fixture();interrupted.player.weapon={time:14,hits:5};interrupted.throwWeapon();
interrupted.takePlayerDamage({id:"foe",facing:-1,z:0},10,1);tick(interrupted,.4);
assert.equal(interrupted.projectiles.length,0,"interrupted windup never emits a phantom club");
assert.ok(interrupted.player.weapon,"an interrupted throw retains the unthrown club");
const bossGame=fixture(),boss=bossGame.makeBoss();boss.x=2;boss.z=0;boss.cooldown=999;bossGame.enemies=[boss];
bossGame.player.weapon={time:14,hits:5};bossGame.throwWeapon();tick(bossGame,.6);
assert.ok(boss.health<boss.maxHealth && boss.health>0,"Boss takes throw damage and survives");
const last=fixture(),lastBoss=last.makeBoss();lastBoss.x=1;lastBoss.z=0;lastBoss.health=1;last.enemies=[lastBoss];
last.projectiles=[
  {id:"club",side:"player",kind:"club",owner:"player",x:.7,y:1.3,z:0,vx:11,vy:0,vz:0,damage:38,life:1,spin:0},
  {id:"enemy",side:"enemy",owner:lastBoss.id,x:0,y:1.05,z:0,vx:0,vy:0,vz:0,damage:90,life:1,spin:0}
];
const safeHealth=last.player.health;last.updateProjectiles(.05);
assert.equal(last.player.health,safeHealth,"throwing the finishing hit cancels Boss projectiles in the same frame");

for (const fighter of FIGHTERS) {
  const combo=MOVEBOOK[fighter.id].light.reduce((sum,move)=>sum+Math.round(move.damage*fighter.power),0);
  for (const enemy of Object.values(ENEMIES)) assert.ok(enemy.hp>combo,fighter.id+" basic combo does not erase "+enemy.id);
}
for (const level of LEVELS) {
  const maxBurst=78*1.46*.95;
  assert.ok(level.boss.hp>maxBurst*6,"Boss requires multiple exchanges even against a full finisher");
}
const [story,standard,master]=DIFFICULTIES;
assert.ok(story.playerDamage<=1.3 && story.enemyAttack>=.5,"assisted mode still retains combat");
assert.ok(story.enemyRecovery>standard.enemyRecovery && standard.enemyRecovery>master.enemyRecovery);
assert.ok(master.enemyHealth/standard.enemyHealth<1.2,"hard mode relies on aggression, not huge health inflation");
const pressure=fixture(),heavy=pressure.makeEnemy("heavy",.9,0);
const health=pressure.player.health;pressure.takePlayerDamage(heavy,heavy.damage,1);
assert.ok(pressure.player.health<=health*.8,"an unavoided heavy attack has a meaningful cost");
console.log("throws and balance: 3 fighters, both facings, pickup/release/hit/guard/Boss, hit-stop buffering, interruption, swept height/depth collision and challenge budgets passed");
