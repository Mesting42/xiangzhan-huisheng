import assert from "node:assert/strict";
import { Game, createPlayer } from "../src/game.js";
import { FIGHTERS, LEVELS, DIFFICULTIES } from "../src/data.js";
import { getMove, resolveHit } from "../src/combat.js";
import { branchMove, canCancelAttack, rollProtected, earnedEnergy, mayAttack, formationTarget, lockAim, stepCharge, chargeContact } from "../src/battle-rules.js";
import { chooseBossMove } from "../src/boss-brain.js";
import { freshSave } from "../src/save.js";

export function fixture(fighter = "lin", level = 0, difficulty = "standard") {
  const game = Object.create(Game.prototype);
  Object.assign(game, { selectedFighter: fighter, selectedDifficulty: difficulty, variantOn: false, levelIndex: level,
    currentLevel: LEVELS[level], mode: "play", player: createPlayer(fighter, DIFFICULTIES.find(d=>d.id===difficulty)),
    enemies: [], enemyEntryQueue: [], projectiles: [], drops: [], nextEntityId: 1, gameTime: 10, hitStop: 0,
    comboTimer: 0, campaignTime: 0, campaignScore: 0, waveSpawned: true, waveIndex: 0, bossStarted: false,
    transitionT: 0, trainingRespawnT: 0, trainingDrill: "combo", save: freshSave(), tutorial: { enabled: false },
    renderer: { props: [], getWorldBounds:()=>({minX:-7,maxX:7,minZ:-2.15,maxZ:2.15}), getEntryBounds:()=>({minX:-9,maxX:9}),
      spawnHit(){},spawnDust(){},shake(){},setLevel(){},setSettings(){},resetActor(){},getPropNear:()=>null },
    ui: {toast(){},render(){}}, audio: {sound(){},startMusic(){},stopMusic(){},unlock(){}},
    input: {clear(){},sample:()=>({pressed:{},moveX:0,moveZ:0})},persist(){} });
  game.player.x=0;game.player.z=0;return game;
}
export function tick(game, seconds, frame = {}) {
  for(let t=0;t<seconds-1e-8;t+=1/120) {
    const dt=Math.min(1/120,seconds-t);game.gameTime+=dt;
    game.updatePlayer(dt,{pressed:{},moveX:0,moveZ:0,...frame});game.updatePlayerAttack(dt);game.updateEnemies(dt);game.updateProjectiles(dt);
  }
}

for(const fighter of FIGHTERS) {
  const base=getMove(fighter.id,"heavy"), quick=branchMove(base,fighter.id,1), launch=branchMove(base,fighter.id,2);
  assert.equal(quick.branch,"break");assert.equal(launch.branch,"launcher");
  assert.ok(quick.recovery<launch.recovery && launch.launch>quick.launch);
  const game=fixture(fighter.id), target=game.makeEnemy("heavy",.85,0);target.health=target.maxHealth=9999;target.cooldown=999;game.enemies=[target];
  game.startPlayerAttack("light");tick(game,.22);
  assert.ok(game.player.attack.connected,"light hit opens a confirmed branch");
  game.startPlayerAttack("heavy");assert.equal(game.player.attack.move.branch,"break");
  tick(game,.7);target.x=.85;target.z=0;target.invulnerable=target.hurtT=target.stunT=0;target.cooldown=999;
  game.startPlayerAttack("light");tick(game,.3);game.player.attack=null;game.player.action="idle";
  target.x=.85;target.invulnerable=0;game.startPlayerAttack("light");tick(game,.3);
  game.startPlayerAttack("heavy");assert.equal(game.player.attack.move.branch,"launcher",fighter.id+" has a two-light launcher");
}

const whiff=fixture();whiff.startPlayerAttack("heavy");whiff.player.actionElapsed=.35;
assert.equal(canCancelAttack(whiff.player,"dodge"),false,"whiffed heavy must recover");
assert.equal(canCancelAttack(whiff.player,"special"),false);
whiff.player.actionElapsed=whiff.player.actionTotal-.06;assert.equal(canCancelAttack(whiff.player,"dodge"),true);
const contact=fixture();contact.startPlayerAttack("light");Object.assign(contact.player.attack,{contact:true,connected:true});contact.player.actionElapsed=.22;
assert.equal(canCancelAttack(contact.player,"heavy"),true);assert.equal(canCancelAttack(contact.player,"special"),true);
const energy={kind:"light",energyGained:0};for(let i=0;i<6;i++)energy.energyGained+=earnedEnergy({},30,energy);
assert.equal(energy.energyGained,14,"multi-target normal attack energy is capped");
assert.equal(earnedEnergy({},40,{kind:"special"}),0);assert.equal(earnedEnergy({noEnergy:true},30,{kind:"heavy"}),0);

const flank=resolveHit({x:0,y:0,z:0,facing:1},{x:1,y:0,z:0,guard:true,facing:1},getMove("lin","light"));
assert.equal(flank.hit,true,"a guard can be flanked");
assert.equal(resolveHit({x:0,y:0,z:0,facing:1},{x:1,y:0,z:0,guard:true,facing:-1},getMove("lin","light")).reason,"guard");

const roll=fixture();roll.player.action="dodge";roll.player.actionTotal=.42;roll.player.actionElapsed=.14;
assert.equal(rollProtected(roll.player),true);assert.equal(roll.evadeAttack({id:"a"}),true);
assert.equal(roll.player.perfectRolls,1);assert.ok(roll.player.counterReady>0);roll.evadeAttack({id:"b"});assert.equal(roll.player.perfectRolls,1);
roll.player.action="idle";roll.player.dodgeT=0;roll.startPlayerAttack("light");assert.equal(roll.player.attack.move.counter,true);

const group=fixture();group.enemies=[group.makeEnemy("guard",2,0),group.makeEnemy("swift",-2,0),group.makeEnemy("ranged",4,.6)];
const [guard,swift,shooter]=group.enemies;guard.cooldown=swift.cooldown=shooter.cooldown=0;
assert.equal(group.startEnemyWindup(guard),true);group.gameTime+=.5;
assert.equal(group.startEnemyWindup(swift),false,"normal difficulty allows one melee attack at a time");
assert.notEqual(formationTarget(guard,group.enemies,group.player).x,formationTarget(shooter,group.enemies,group.player).x);
assert.equal(Math.sign(formationTarget(guard,group.enemies,group.player).x),Math.sign(shooter.x),"guard protects shooter's approach");
assert.equal(mayAttack(swift,group.enemies,[],{},group.gameTime,"line","master"),true);

for(const level of LEVELS) {
  const game=fixture("lin",level.id), boss=game.makeBoss();game.enemies=[boss];boss.x=2;
  const kinds=new Set();for(const distance of [1.2,3.2,5])for(let n=0;n<6;n++) {boss.phasePattern=n;boss.x=distance;kinds.add(chooseBossMove(boss,game.player).name);}
  assert.ok(kinds.size>=3,level.name+" Boss has at least three attack patterns");
  boss.x=4;boss.aimX=0;boss.aimZ=0;boss.move={kind:"charge",range:4.1,active:.48};lockAim(boss,game.renderer.getWorldBounds());
  const locked={...boss.chargeTo};game.player.x=6;game.player.z=1.8;
  let last=boss.x;while((boss.chargeElapsed||0)<boss.move.active) {
    const before=stepCharge(boss,1/120);assert.ok(Math.abs(boss.x-last)<.13,"charges move continuously");last=boss.x;
    assert.equal(chargeContact(before,boss,{x:0,z:1.8,y:0}),false,"a sidestep clears the fixed path");
  }
  assert.deepEqual(boss.chargeTo,locked,"target does not track the player after aim lock");
  boss.x=2;boss.state="windup";boss.move={armor:true};boss.health=boss.maxHealth=9999;boss.invulnerable=0;
  const move={damage:10,knock:1,stun:2,staggerDamage:10};game.applyPlayerHit(boss,move,move);
  assert.equal(boss.state,"windup","armored windup takes damage without being cancelled");assert.equal(boss.stunT,0);assert.ok(boss.health<9999);
  while(!(boss.staggerT>0))game.applyPlayerHit(boss,move,move);
  const stagger=boss.staggerT;game.applyPlayerHit(boss,move,move);assert.equal(boss.staggerT,stagger,"hits cannot extend a Boss stagger indefinitely");
}

const grab=fixture("tie"), held=grab.makeEnemy("swift",.8,0);held.health=held.maxHealth=999;held.cooldown=999;grab.enemies=[held];
grab.startPlayerAttack("heavy");tick(grab,.33);assert.equal(grab.player.grabTarget,held.id,"Iron Mountain actually holds a target");
tick(grab,.3);assert.equal(grab.player.grabTarget,null);assert.ok(held.health<999 && held.airborne,"held opponent is thrown and damaged");
assert.equal(canCancelAttack({...grab.player,grabTarget:held.id},"jump"),false,"a throw cannot leave a captive behind when cancelled");

for(const fighter of FIGHTERS) {
  const energyGame=fixture(fighter.id);energyGame.player.energy=100;
  const target=energyGame.makeEnemy("heavy",.9,0);target.health=target.maxHealth=9999;target.cooldown=999;energyGame.enemies=[target];
  energyGame.useSpecial(false);tick(energyGame,.6);assert.equal(energyGame.player.energy,65,"special hits never refund their own energy");
  energyGame.player.attack=null;energyGame.player.action="idle";energyGame.player.energy=100;target.x=.9;target.z=0;target.y=0;target.invulnerable=0;target.juggleLocked=false;
  const before=target.health;energyGame.useSpecial(true);tick(energyGame,1.1);assert.equal(energyGame.player.energy,0);assert.ok(target.health<before,"all character finishers hit");
}
const dash=fixture("qiao");dash.player.energy=50;dash.useSpecial(false);tick(dash,.5);assert.ok(dash.player.x>1.1&&dash.player.x<1.2,"Qiao's skill actually travels forward");

const failure=fixture();failure.player.health=5;failure.takePlayerDamage({facing:1,z:0},10,2);
assert.equal(failure.mode,"defeat");assert.ok(failure.player.vx>0,"a hit knocks the player away from the attacker");
failure.startStage(0);assert.equal(failure.mode,"play");assert.equal(failure.player.health,failure.player.maxHealth,"retry restores a playable state");

const buffered=fixture();buffered.hitStop=.06;buffered.input.sample=()=>({pressed:{heavy:true},moveX:0,moveZ:0});buffered.update(.03);
buffered.input.sample=()=>({pressed:{},moveX:0,moveZ:0});buffered.update(.04);buffered.update(.01);
assert.equal(buffered.player.action,"heavy","an input during hit-stop survives until the next simulation frame");
const simultaneous=fixture();simultaneous.updatePlayer(.01,{pressed:{jump:true,light:true},moveX:0,moveZ:0});
assert.equal(simultaneous.player.action,"air","simultaneous jump and attack is usable with multi-button controls");

const juggle=fixture(), air=juggle.makeEnemy("heavy",1,0);air.health=air.maxHealth=999;juggle.enemies=[air];
const upper={damage:8,knock:.5,stun:.3,launch:.8};for(let i=0;i<5;i++)juggle.applyPlayerHit(air,upper,upper);
assert.equal(air.juggleHits,3);assert.equal(air.juggleLocked,true);const health=air.health;juggle.applyPlayerHit(air,upper,upper);assert.equal(air.health,health);

const follow=fixture("lin",4), final=follow.makeBoss();final.phase=2;final.phasePattern=1;final.x=1.5;follow.enemies=[final];
assert.equal(follow.startEnemyWindup(final),true);assert.ok(final.move.followUp);
final.state="recover";final.recoverT=.01;follow.updateEnemies(.02);assert.ok(final.pendingFollowUp);
follow.gameTime+=1;final.cooldown=0;follow.updateEnemies(.01);assert.equal(final.move.name,"第二式 · 追击掌","phase two completes its telegraphed follow-up");
follow.projectiles=[{side:"enemy",owner:final.id}];final.health=0;follow.killEnemy(final);assert.equal(follow.projectiles.length,0);

const practice=fixture();practice.mode="training";practice.player.training=true;practice.trainingDrill="boss";practice.spawnTrainingDummy();
const partner=practice.enemies[0];for(let i=0;i<120;i++)practice.updateTraining(1/60);
assert.equal(practice.enemies[0],partner,"practice partners are not respawned every half-second");
console.log("battle depth: 3 fighters, 5 Boss kits, branches, hit confirms, whiff recovery, energy caps, perfect rolls, flank, formation, continuous charges, poise, throws, juggle limits and training passed");
