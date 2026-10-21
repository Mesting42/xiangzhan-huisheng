import assert from "node:assert/strict";
import { fixture } from "./battle-depth.test.js";
import { FIGHTERS, LEVELS } from "../src/data.js";

let completed=0, observedPatterns=new Set(), longest=0;
// This checks reachability with real movement/attacks/AI. Protection isolates
// flow verification from difficulty tuning; it is not a claim about balance.
for (const difficulty of ["story","standard","master"]) for (const fighter of FIGHTERS) for (const level of LEVELS) {
  const game=fixture(fighter.id,level.id,difficulty);game.waveSpawned=false;game.gameTime=0;game.player.invulnerable=9999;
  let frame={pressed:{},moveX:0,moveZ:0}; game.input.sample=()=>frame;
  let ticks=0;
  while(["play","bossIntro"].includes(game.mode) && ticks++<36000) {
    frame={pressed:{},moveX:0,moveZ:0};
    const target=game.enemies.filter(e=>e.health>0&&!e.entry&&!e.juggleLocked).sort((a,b)=>Math.abs(a.x-game.player.x)-Math.abs(b.x-game.player.x))[0];
    if(target && game.mode==="play") {
      const dx=target.x-game.player.x,dz=target.z-game.player.z;
      frame.moveX=Math.abs(dx)>1.04?Math.sign(dx):0;frame.moveZ=Math.abs(dz)>.28?Math.sign(dz):0;
      if(Math.abs(dx)<1.5&&Math.abs(dz)<.65) {
        const attack=game.player.attack;
        if(!attack) frame.pressed.light=true;
        else if(attack.kind==="light"&&attack.contact) {
          if(game.player.comboStep>=1)frame.pressed.heavy=true;
          else frame.pressed.light=true;
        }
      }
      if(target.boss&&target.move)observedPatterns.add(target.style+":"+target.move.name);
    }
    game.update(1/60);
    for(const actor of [game.player,...game.enemies]) {
      assert.ok([actor.x,actor.y,actor.z,actor.health].every(Number.isFinite),"all battle states remain finite");
      assert.ok(actor.y>=0,"no actor falls below ground");
      if(!actor.entry)assert.ok(actor.x>=-7.01&&actor.x<=7.01,"active actors remain in arena bounds");
    }
  }
  assert.equal(game.mode,level.id===4?"victory":"result",`${fighter.id}/${difficulty}/${level.name} can finish through combat: ${game.mode} wave ${game.waveIndex}, foes ${game.enemies.map(e=>e.type+':'+e.health+':'+e.state+':'+e.x.toFixed(1)).join(',')}`);
  assert.ok(game.lastResult.hits>0 && game.lastResult.score>0);
  assert.ok(game.save.completed.includes(level.id),"result and unlock progress are recorded");
  if(level.id===4)assert.ok(game.save.records.campaign,"final chapter records a full ending");
  longest=Math.max(longest,game.gameTime);completed++;
}
console.log(`${completed} real combat chapter flows passed (3 fighters x 3 difficulties x 5 chapters); ${observedPatterns.size} Boss patterns observed; longest protected simulation ${Math.round(longest)}s`);
