import { FIGHTERS, LEVELS, ENEMIES, DIFFICULTIES } from "./data.js";
import { getMove, nextComboStep, attackTotal, inActiveWindow, resolveHit, resolveEnemyHit, gradeEncounter } from "./combat.js";
import { Input, DEFAULT_KEYBINDS } from "./input.js";
import { AudioEngine } from "./audio.js";
import { freshSave, loadSave, writeSave, clearSave, applyStageClear, applyCampaignClear } from "./save.js";
import { WorldRenderer } from "./renderer.js";
import { planEnemyEntries, placeEnemyEntry, stepEnemyEntry } from "./enemy-entry.js";
import { canCancelAttack, branchMove, rollProtected, earnedEnergy, staggerPower, mayAttack, formationTarget, lockAim, stepCharge, chargeContact } from "./battle-rules.js";
import { chooseBossMove, BOSS_POISE } from "./boss-brain.js";
import { projectileContact } from "./projectiles.js";

const ENEMY_MOVES = {
  swift: { startup: .46, active: .11, recovery: .55, range: 1.18, height: "mid", knock: 1, stun: .3 },
  heavy: { startup: .84, active: .18, recovery: .93, range: 1.55, height: "mid", knock: 2.8, stun: .54 },
  guard: { startup: .67, active: .14, recovery: .72, range: 1.28, height: "mid", knock: 1.3, stun: .34 },
  ranged: { startup: .68, active: .16, recovery: .86, range: 8.5, height: "mid", knock: .8, stun: .3 },
  charger: { startup: .72, active: .22, recovery: .83, range: 3.4, height: "mid", knock: 2.2, stun: .45 },
  elite: { startup: .68, active: .18, recovery: .78, range: 1.55, height: "mid", knock: 2.1, stun: .48 },
  boss: { startup: .72, active: .2, recovery: .95, range: 1.75, height: "mid", knock: 2.4, stun: .5 }
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const fighterById = (id) => FIGHTERS.find((item) => item.id === id) || FIGHTERS[0];
const difficultyById = (id) => DIFFICULTIES.find((item) => item.id === id) || DIFFICULTIES[1];

export function createPlayer(fighterId, difficulty, training = false) {
  const fighter = fighterById(fighterId);
  const health = Math.round(fighter.health * difficulty.playerHealth);
  return {
    id: "player", fighterId: fighter.id, visual: fighter, name: fighter.name, x: -2.8, y: 0, z: 0,
    facing: 1, vx: 0, vz: 0, jumpVelocity: 0, airborne: false,
    health, maxHealth: health, energy: training ? 100 : 0,
    speed: fighter.speed, power: fighter.power * difficulty.playerDamage, dodgeScale: fighter.dodge,
    invulnerable: 0, hurtT: 0, stunT: 0, dodgeT: 0, dodgeCooldown: 0, attackCooldown: 0,
    action: "idle", actionElapsed: 0, actionTotal: .35, attack: null, hitSet: new Set(), queuedLight: false,
    comboStep: -1, comboCount: 0, bestCombo: 0, lastHitAt: -10, comboTimer: 0, hits: 0, damageTaken: 0,
    pickups: 0, score: 0, weapon: null, training, moveT: 0, chainCount: 0, chainUntil: 0,
    inputBuffer: null, bufferT: 0, counterReady: 0, perfectRollUsed: false, perfectRolls: 0,
    branches: { break: 0, launcher: 0 }, grabTarget: null
  };
}

export class Game {
  constructor(canvas) {
    let loaded;
    try { loaded = loadSave(window.localStorage); }
    catch { loaded = { save: freshSave(), damaged: false }; }
    this.save = loaded.save;
    this.damagedSave = loaded.damaged;
    this.input = new Input(document.getElementById("game"), this.save.settings.keybinds || {});
    this.input.sensitivity = this.save.settings.touchSensitivity || 1;
    this.renderer = new WorldRenderer(canvas, this.save.settings);
    this.audio = new AudioEngine(this.save.settings);
    this.mode = "menu";
    this.modeBeforePause = "play";
    this.previousUiMode = "menu";
    this.launchIntent = "story";
    this.levelIndex = 0;
    this.currentLevel = LEVELS[0];
    this.startStageIndex = 0;
    this.selectedFighter = this.save.selectedFighter || "lin";
    this.selectedDifficulty = this.save.difficulty || "standard";
    this.variantOn = false;
    this.pendingTutorial = false;
    this.tutorial = { enabled: false, moved: false, attacked: false, dodged: false, energy: false, pickup: false };
    this.waveIndex = 0;
    this.waveSpawned = false;
    this.transitionT = 0;
    this.bossIntroT = 0;
    this.bossStarted = false;
    this.nextEntityId = 1;
    this.player = createPlayer(this.selectedFighter, difficultyById(this.selectedDifficulty));
    this.enemies = [];
    this.enemyEntryQueue = [];
    this.projectiles = [];
    this.drops = [];
    this.nearbyDrop = null;
    this.nearbyProp = null;
    this.comboTimer = 0;
    this.gameTime = 0;
    this.campaignTime = 0;
    this.campaignScore = 0;
    this.hitStop = 0;
    this.shakeQueue = 0;
    this.lastResult = { level: 0, time: 0, hits: 0, damageTaken: 0, bestCombo: 0, pickups: 0, score: 0, reward: 0, grade: "C", fighter: this.selectedFighter, unlocks: [] };
    this.stageStarted = false;
    this.trainingRespawnT = 0;
    this.trainingDrill = "combo";
    this.storageWarningShown = false;
    this.ui = null;
    window.addEventListener("blur", () => {
      if (["play", "training", "bossIntro"].includes(this.mode)) this.pauseGame();
    });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden && ["play", "training", "bossIntro"].includes(this.mode)) this.pauseGame();
    });
  }

  persist() {
    this.save.settings.keybinds = this.input.binds;
    this.save.settings.touchSensitivity = this.input.sensitivity;
    let ok = false;
    try { ok = writeSave(this.save); } catch { ok = false; }
    if (!ok && this.ui && !this.storageWarningShown) {
      this.storageWarningShown = true;
      this.ui.toast("浏览器存储不可用；本次游玩仍可继续，但进度无法保存。", 4000);
    }
    return ok;
  }

  goto(mode) {
    this.mode = mode;
    this.input.clear();
    this.deferredPresses = {};
    if (this.player) { this.player.inputBuffer = null; this.player.bufferT = 0; this.player.queuedLight = false; }
    this.ui?.render(mode);
  }

  openCharacter(intent, startAt = 0) {
    this.launchIntent = intent;
    this.startStageIndex = startAt;
    this.selectedFighter = this.save.unlockedFighters.includes(this.save.selectedFighter) ? this.save.selectedFighter : "lin";
    this.selectedDifficulty = this.save.difficulty || "standard";
    this.variantOn = this.save.unlockedVariants.includes("echo");
    this.player = createPlayer(this.selectedFighter, difficultyById(this.selectedDifficulty), intent === "training");
    this.player.x = -2.8;
    this.renderer.resetActor("player");
    this.renderer.setLevel(Math.min(startAt, 4), 0);
    this.goto("character");
  }

  handleUI(action, data = {}) {
    if (action === "new-story") { this.openCharacter("story", 0); return; }
    if (action === "continue-story") {
      const next = this.nextCampaignStage();
      this.openCharacter("story", next);
      return;
    }
    if (action === "replay-campaign") { this.openCharacter("story", 0); return; }
    if (action === "training-select") { this.openCharacter("training", 0); return; }
    if (action === "select-fighter") {
      const fighter = data.fighter;
      const open = this.launchIntent === "training" || this.save.unlockedFighters.includes(fighter);
      if (!open) { this.ui.toast("通关老街巷后，这位街坊会加入队伍。"); return; }
      this.selectedFighter = fighter;
      this.player = createPlayer(fighter, difficultyById(this.selectedDifficulty), this.launchIntent === "training");
      this.player.x = -2.8;
      this.renderer.resetActor("player");
      this.ui.render("character");
      return;
    }
    if (action === "select-difficulty") {
      this.selectedDifficulty = data.difficulty;
      this.ui.render("character");
      return;
    }
    if (action === "toggle-variant") { this.variantOn = !this.variantOn; this.ui.render("character"); return; }
    if (action === "launch-story") {
      this.save.selectedFighter = this.selectedFighter;
      this.save.difficulty = this.selectedDifficulty;
      this.persist();
      this.startStory(this.startStageIndex);
      return;
    }
    if (action === "launch-training") {
      this.levelIndex = 0;
      this.currentLevel = LEVELS[0];
      this.prepareStage(true);
      this.mode = "training-ready";
      this.input.clear();
      this.ui.render("training-ready");
      return;
    }
    if (action === "begin-stage") { this.pendingTutorial = false; this.beginStage(false); return; }
    if (action === "begin-tutorial") { this.pendingTutorial = true; this.beginStage(true); return; }
    if (action === "boss-now") { this.startBossFight(); return; }
    if (action === "pause") { this.pauseGame(); return; }
    if (action === "resume") {
      if (this.mode === "training-ready") { this.startTraining(); return; }
      this.resumeGame();
      return;
    }
    if (action === "restart-stage" || action === "retry") { this.startStage(this.levelIndex); return; }
    if (action === "reset-training" || action === "training-restart") { this.startTraining(); return; }
    if (action === "training-drill") { this.trainingDrill = ["combo", "counter", "boss"].includes(data.drill) ? data.drill : "combo"; this.ui.render("training-ready"); return; }
    if (action === "continue-stage") { this.startStage(this.levelIndex + 1); return; }
    if (action === "replay-stage") { this.startStage(this.levelIndex); return; }
    if (action === "visit-stage") {
      const index = Number(data.level);
      if (index > this.save.unlockedLevel && !this.save.completed.includes(index)) {
        this.ui.toast("这段街巷还没开放，先守住上一段。");
        return;
      }
      this.openCharacter("story", index);
      return;
    }
    if (action === "levels") { this.goto("levels"); return; }
    if (action === "records") { this.goto("records"); return; }
    if (action === "settings") {
      if (this.mode !== "settings") this.previousUiMode = this.mode;
      this.goto("settings");
      return;
    }
    if (action === "settings-back") {
      const previous = this.previousUiMode;
      this.goto(previous === "play" || previous === "bossIntro" || previous === "training" ? "pause" : previous);
      return;
    }
    if (action === "reset-save") { this.ui.showSaveReset(); return; }
    if (action === "cancel-reset") { this.ui.render("settings"); return; }
    if (action === "clear-save-confirm") { this.deleteSave(); return; }
    if (action === "back-menu" || action === "menu") { this.audio.stopMusic(); this.goto("menu"); return; }
  }

  changeSetting(key, value, save = true) {
    this.save.settings[key] = value;
    if (key === "music" || key === "sfx") this.audio.setVolumes(this.save.settings.music, this.save.settings.sfx);
    if (key === "touchSensitivity") this.input.sensitivity = value;
    this.renderer.setSettings(this.save.settings);
    if (save) this.persist();
  }

  deleteSave() {
    try { clearSave(); } catch {}
    this.save = freshSave();
    this.selectedFighter = "lin";
    this.selectedDifficulty = "standard";
    this.variantOn = false;
    this.input.binds = structuredClone(DEFAULT_KEYBINDS);
    this.input.sensitivity = 1;
    this.renderer.setSettings(this.save.settings);
    this.audio.setVolumes(this.save.settings.music, this.save.settings.sfx);
    this.renderer.resetActor("player");
    this.player = createPlayer("lin", difficultyById("standard"));
    this.enemies = [];
    this.projectiles = [];
    this.drops = [];
    this.goto("menu");
    this.ui.toast("本机存档已重置，可以重新开篇。");
  }

  nextCampaignStage() {
    for (let i = 0; i < LEVELS.length; i++) if (!this.save.completed.includes(i)) return i;
    return 0;
  }

  startStory(index = 0) {
    this.levelIndex = clamp(index, 0, 4);
    this.currentLevel = LEVELS[this.levelIndex];
    this.selectedFighter = this.save.unlockedFighters.includes(this.selectedFighter) ? this.selectedFighter : "lin";
    this.gameTime = 0;
    this.campaignTime = index === 0 ? 0 : this.campaignTime;
    this.campaignScore = index === 0 ? 0 : this.campaignScore;
    this.audio.unlock();
    this.audio.startMusic(this.levelIndex, false);
    this.prepareStage();
    this.pendingTutorial = this.currentLevel.lesson && index === 0;
    this.goto("intro");
  }

  prepareStage(training = false) {
    this.deferredPresses = {};
    const difficulty = difficultyById(this.selectedDifficulty);
    this.currentLevel = LEVELS[this.levelIndex];
    this.player = createPlayer(this.selectedFighter, difficulty, training);
    this.player.variantOn = this.variantOn && this.save.unlockedVariants.includes("echo");
    this.player.x = training ? -1.8 : -2.8;
    this.player.z = 0;
    this.enemies = [];
    this.enemyEntryQueue = [];
    this.projectiles = [];
    this.drops = [];
    this.waveIndex = 0;
    this.battleClock = { nextAttackAt: 0, nextRangedAt: 0 };
    this.waveSpawned = false;
    this.transitionT = 0;
    this.bossStarted = false;
    this.bossIntroT = 1.5;
    this.comboTimer = 0;
    this.hitStop = 0;
    this.stageStarted = true;
    this.gameTime = 0;
    this.nearbyDrop = null;
    this.nearbyProp = null;
    this.tutorial = { enabled: Boolean(this.pendingTutorial), moved: false, attacked: false, dodged: false, energy: false, pickup: false };
    this.renderer.setLevel(this.levelIndex, 0);
    this.renderer.setSettings(this.save.settings);
    this.audio.startMusic(this.levelIndex, false);
  }

  beginStage(tutorial = false) {
    this.prepareStage(false);
    this.tutorial.enabled = tutorial;
    this.pendingTutorial = false;
    this.goto("play");
    this.audio.unlock();
    this.ui.toast(tutorial ? "先熟悉方向：WASD移动，J连拳，K重击。" : this.currentLevel.subtitle, 2500);
  }

  startStage(index) {
    this.levelIndex = clamp(index, 0, 4);
    this.currentLevel = LEVELS[this.levelIndex];
    this.pendingTutorial = this.currentLevel.lesson && this.levelIndex === 0;
    this.prepareStage(false);
    this.tutorial.enabled = false;
    this.goto("play");
    this.audio.unlock();
    this.ui.toast(this.currentLevel.name + " · " + this.currentLevel.subtitle, 2100);
  }

  startTraining() {
    this.levelIndex = 0;
    this.currentLevel = LEVELS[0];
    this.prepareStage(true);
    this.mode = "training";
    this.input.clear();
    this.ui.render("training");
    this.audio.unlock();
    this.spawnTrainingDummy();
    this.ui.toast(fighterById(this.selectedFighter).name + " · 练功开始，三位角色均可试招。", 2400);
  }

  spawnTrainingDummy() {
    if (this.trainingDrill === "counter" || this.trainingDrill === "boss") {
      const partner = this.trainingDrill === "boss" ? this.makeBoss() : this.makeEnemy("swift", 0, 0);
      partner.x = this.player.x + 1.6; partner.z = this.player.z;
      partner.name = this.trainingDrill === "boss" ? "陪练 · 钢牙梁" : "陪练 · 快拳";
      partner.health = partner.maxHealth = 9999; partner.practiceFoe = true; partner.cooldown = 1;
      this.enemies = [partner]; return;
    }
    const dummy = this.makeEnemy("guard", 3.0, .25, true);
    dummy.name = "练功木人";
    dummy.trainingDummy = true;
    dummy.health = 5000;
    dummy.maxHealth = 5000;
    dummy.damage = 0;
    dummy.speed = 0;
    dummy.state = "idle";
    this.enemies = [dummy];
  }

  pauseGame() {
    if (!["play", "training", "bossIntro"].includes(this.mode)) return;
    this.modeBeforePause = this.mode;
    this.audio.stopMusic();
    this.goto("pause");
  }

  resumeGame() {
    if (this.mode === "pause") {
      this.goto(["training", "bossIntro"].includes(this.modeBeforePause) ? this.modeBeforePause : "play");
      this.audio.startMusic(this.levelIndex, this.enemies.some((enemy) => enemy.boss && enemy.health > 0));
    } else if (this.mode === "training-ready") {
      this.startTraining();
    }
  }

  update(delta) {
    let frame;
    try { frame = this.input.sample(); }
    catch { frame = { moveX: 0, moveZ: 0, held: {}, pressed: {}, device: "keyboard" }; }
    if (frame.pressed.pause) {
      if (["play", "training", "bossIntro"].includes(this.mode)) this.pauseGame();
      else if (this.mode === "pause") this.resumeGame();
      else if (this.mode === "settings") this.handleUI("settings-back");
      else this.goto("menu");
      return;
    }
    if (this.mode === "bossIntro") {
      const dt = Math.min(.05, delta);
      this.updateEnemyEntries(dt);
      for (const enemy of this.enemies) if (enemy.entry) this.advanceEnemyEntry(enemy, dt);
      this.bossIntroT -= dt;
      if (this.bossIntroT <= 0 && !this.enemyEntryQueue.length && !this.enemies.some((enemy) => enemy.entry)) this.startBossFight();
      return;
    }
    if (this.mode === "play" || this.mode === "training") {
      if (this.hitStop > 0) {
        this.deferredPresses ||= {};
        for (const action of ["light","heavy","jump","dodge","special","finisher","throw","interact"]) if (frame.pressed[action]) this.deferredPresses[action] = true;
        this.hitStop = Math.max(0, this.hitStop - delta);
        return;
      }
      frame.pressed = { ...this.deferredPresses, ...Object.fromEntries(Object.entries(frame.pressed).filter(([,value])=>value)) };
      this.deferredPresses = {};
      const dt = Math.min(.05, delta);
      this.gameTime += dt;
      if (!this.player.training) this.campaignTime += dt;
      this.updatePlayer(dt, frame);
      this.updatePlayerAttack(dt);
      this.updateEnemies(dt);
      this.updateProjectiles(dt);
      this.updatePickups(dt, frame);
      this.updateRoomFlow(dt);
      this.updateTutorial(frame);
      this.comboTimer = Math.max(0, this.comboTimer - dt);
      if (this.comboTimer === 0 && this.player.comboCount > 0) this.player.comboCount = 0;
      if (this.mode === "training") this.updateTraining(dt);
    }
  }

  updatePlayer(dt, frame) {
    const p = this.player;
    p.counterReady = Math.max(0, (p.counterReady || 0) - dt);
    p.bufferT = Math.max(0, (p.bufferT || 0) - dt);
    const commands = ["dodge", "finisher", "special", "throw", "heavy", "light", "jump"];
    const jumpAttack = frame.pressed.jump && (frame.pressed.light || frame.pressed.heavy);
    const jumpAttackKind = frame.pressed.heavy ? "heavy" : "light";
    const command = jumpAttack ? "jump" : commands.find(key => frame.pressed[key]);
    if (command) { p.inputBuffer = command; p.bufferT = .16; }
    const pressed = { ...frame.pressed };
    for (const key of commands) pressed[key] = p.bufferT > 0 && p.inputBuffer === key;
    frame = { ...frame, pressed };
    p.invulnerable = Math.max(0, p.invulnerable - dt);
    p.hurtT = Math.max(0, p.hurtT - dt);
    p.dodgeCooldown = Math.max(0, p.dodgeCooldown - dt);
    p.attackCooldown = Math.max(0, p.attackCooldown - dt);
    p.dodgeT = Math.max(0, p.dodgeT - dt);
    p.stunT = Math.max(0, p.stunT - dt);
    if (p.weapon) {
      p.weapon.time -= dt;
      if (p.weapon.time <= 0 || p.weapon.hits <= 0) {
        p.weapon = null;
        this.ui.toast("短棍用完了，徒手接着打。");
      }
    }
    if (p.action !== "dodge" && Math.abs(frame.moveX) > .1) p.facing = frame.moveX > 0 ? 1 : -1;
    if (Math.abs(frame.moveX) + Math.abs(frame.moveZ) > .1) p.moveT += dt; else p.moveT = 0;

    if (p.stunT > 0) {
      p.action = "hit";
      p.actionElapsed += dt;
      p.vx *= .84;
      p.vz *= .84;
      p.x = clamp(p.x + p.vx * dt, this.renderer.getWorldBounds().minX, this.renderer.getWorldBounds().maxX);
      p.z = clamp(p.z + p.vz * dt, -2.12, 2.12);
      this.updateJumpPhysics(p, dt);
      return;
    }

    if (frame.pressed.dodge && p.dodgeCooldown <= 0 && p.y <= .02 && p.dodgeT <= 0 && canCancelAttack(p, "dodge")) {
      this.releaseGrab(true);
      p.inputBuffer = null;
      const direction = Math.abs(frame.moveX) > .12 ? Math.sign(frame.moveX) : p.facing;
      p.facing = Math.abs(frame.moveX) > .12 ? Math.sign(frame.moveX) : p.facing;
      p.dodgeDirection = direction;
      p.dodgeT = .42 * p.dodgeScale;
      p.dodgeCooldown = .78 / Math.sqrt(p.dodgeScale);
      p.perfectRollUsed = false;
      p.chainCount = 0;
      p.action = "dodge";
      p.actionElapsed = 0;
      p.actionTotal = .42 * p.dodgeScale;
      p.attack = null;
      p.queuedLight = false;
      this.audio.sound("dodge");
      this.renderer.spawnDust(p.x, p.y, p.z, 6);
      if (this.tutorial.enabled && !this.tutorial.dodged) this.tutorial.dodged = true;
    }

    if (p.action === "dodge") {
      const before = p.actionElapsed / p.actionTotal;
      p.actionElapsed = Math.min(p.actionTotal, p.actionElapsed + dt);
      const after = p.actionElapsed / p.actionTotal;
      // Integrate one smooth roll, rather than moving the player on key-down.
      const travel = (t) => t - Math.sin(t * Math.PI * 2) / (Math.PI * 2);
      const bounds = this.renderer.getWorldBounds();
      p.x = clamp(p.x + p.dodgeDirection * 1.65 * p.dodgeScale * (travel(after) - travel(before)), bounds.minX, bounds.maxX);
      p.dodgeT = Math.max(0, p.actionTotal - p.actionElapsed);
      if (before < .8 && after >= .8) this.renderer.spawnDust(p.x, 0, p.z, 4);
    }

    if (frame.pressed.jump && p.y <= .02 && p.dodgeT <= 0 && canCancelAttack(p, "jump")) {
      p.inputBuffer = null;
      p.y = .025;
      p.jumpVelocity = 7.2;
      p.airborne = true;
      p.action = "jump";
      p.actionElapsed = 0;
      p.actionTotal = .58;
      p.attack = null;
      p.queuedLight = false;
      this.audio.sound("jump");
      if (jumpAttack) frame.pressed[jumpAttackKind] = true;
    }

    if (p.dodgeT <= 0) {
      const attackSlow = p.attack ? (p.action === "heavy" ? .19 : .44) : 1;
      const moveSpeed = p.speed * attackSlow * (p.airborne ? .73 : 1);
      const bounds = this.renderer.getWorldBounds();
      const factor = Math.hypot(frame.moveX, frame.moveZ) > 1 ? .707 : 1;
      const oldX = p.x;
      p.x = clamp(p.x + frame.moveX * moveSpeed * dt * factor, bounds.minX, bounds.maxX);
      p.z = clamp(p.z + frame.moveZ * moveSpeed * dt * .72 * factor, bounds.minZ, bounds.maxZ);
      for (const enemy of this.enemies) {
        if (enemy.health <= 0 || enemy.state === "ko" || Math.abs(p.z - enemy.z) > .62) continue;
        const before = oldX - enemy.x;
        const after = p.x - enemy.x;
        const side = Math.sign(before) || -p.facing;
        if (Math.abs(after) < .64 || before * after < 0) p.x = enemy.x + side * .64;
      }
      p.x = clamp(p.x, bounds.minX, bounds.maxX);
      if (Math.abs(p.x - oldX) > .01 && this.tutorial.enabled) this.tutorial.moved = true;
    }
    this.updateJumpPhysics(p, dt);

    if (p.action === "dodge" && p.actionElapsed >= p.actionTotal) p.action = "idle";
    if (p.attack) {
      p.actionElapsed += dt;
      if (p.actionElapsed >= p.actionTotal) {
        this.releaseGrab(false);
        p.attack = null;
        p.action = p.airborne ? "jump" : "idle";
        p.attackCooldown = 0;
      }
    } else if (p.action === "jump" && !p.airborne) {
      p.action = "idle";
      p.actionElapsed = 0;
    } else if (p.action === "hit" && p.hurtT <= 0 && p.stunT <= 0) {
      p.action = p.airborne ? "jump" : "idle";
    } else if (p.action !== "dodge" && p.action !== "hit") {
      p.actionElapsed += dt;
    }

    if (frame.pressed.light) {
      const chainable = p.attack?.kind === "light" && p.attack.contact && p.actionElapsed >= p.attack.move.startup + p.attack.move.active + p.attack.move.recovery * .4;
      if ((!p.attack || chainable) && p.dodgeT <= 0 && p.action !== "hit") {
        this.startPlayerAttack(p.airborne ? "air" : "light");
      }
    }
    if (frame.pressed.heavy) {
      if (canCancelAttack(p, "heavy") && p.dodgeT <= 0 && p.action !== "hit") {
        this.startPlayerAttack(p.airborne ? "air" : "heavy");
      }
    }
    if (frame.pressed.special) this.useSpecial(false);
    if (frame.pressed.finisher) this.useSpecial(true);
    if (frame.pressed.interact) this.interact();
    if (frame.pressed.throw) this.throwWeapon();
  }

  updateJumpPhysics(actor, dt) {
    if (actor.y > 0 || actor.jumpVelocity > 0) {
      actor.jumpVelocity -= 18.5 * dt;
      actor.y += actor.jumpVelocity * dt;
      if (actor.y <= 0) {
        actor.y = 0;
        actor.jumpVelocity = 0;
        actor.airborne = false;
        if (actor.id === "player") this.renderer.spawnDust(actor.x, actor.y, actor.z, 5);
      } else {
        actor.airborne = true;
      }
    }
  }

  startPlayerAttack(kind) {
    const p = this.player;
    if (p.dodgeT > 0 || p.stunT > 0) return;
    const moveKind = kind === "air" ? "air" : kind;
    const assistRange = kind === "heavy" ? 1.35 : 1.05;
    const assist = this.enemies.filter((enemy) => enemy.health > 0 && enemy.state !== "ko" && Math.abs(enemy.z - p.z) < .75 && Math.abs(enemy.x - p.x) < assistRange)
      .sort((a, b) => Math.abs(a.x - p.x) - Math.abs(b.x - p.x))[0];
    if (assist) p.facing = assist.x >= p.x ? 1 : -1;
    let comboIndex = 0;
    if (kind === "light") {
      comboIndex = nextComboStep(p.fighterId, p.comboStep, p.lastLightAt, this.gameTime);
      p.comboStep = comboIndex;
      p.lastLightAt = this.gameTime;
    }
    const branchCount = kind === "heavy" ? (p.attack?.kind === "light" && p.attack.contact ? p.comboStep + 1 : this.gameTime <= p.chainUntil ? p.chainCount : 0) : 0;
    let move = kind === "heavy" ? branchMove(getMove(p.fighterId, "heavy"), p.fighterId, branchCount) : { ...getMove(p.fighterId, moveKind, comboIndex) };
    if (kind === "light" && p.counterReady > 0 && !p.airborne) {
      move = { ...move, name: "回身反击", startup: .075, recovery: .26, damage: 24, range: 1.9, knock: 2.2, stun: .65, guardBreak: true, counter: true, staggerDamage: 40 };
      p.counterReady = 0;
    }
    if (p.fighterId === "tie" && kind === "heavy" && !branchCount) {
      move = { ...move, name: "翻山擒摔", grab: true, startup: .30, active: .34, recovery: .43, range: 1.3, launch: .85, staggerDamage: 34 };
    }
    p.inputBuffer = null;
    if (kind === "light") { p.chainCount = comboIndex + 1; p.chainUntil = 0; }
    else if (kind !== "air") { p.chainCount = 0; p.chainUntil = 0; p.comboStep = -1; p.lastLightAt = -10; }
    if (move.branch) this.ui.toast(move.branch === "launcher" ? "挑空追击 · 跳跃接轻拳" : "截势破防 · 可迅速收招", 1100);
    if (this.variantOn && this.save.unlockedVariants.includes("echo") && (kind === "special" || kind === "finisher")) {
      move.range *= 1.2;
      move.damage = Math.round(move.damage * 1.12);
      move.knock *= 1.18;
    }
    if (kind === "heavy") move.damage = Math.round(move.damage * p.power);
    else move.damage = Math.round(move.damage * p.power);
    if (p.weapon && (kind === "light" || kind === "heavy")) {
      move.range += .32;
      move.damage = Math.round(move.damage * 1.22);
      move.name = "短棍 " + move.name;
      p.weapon.hits -= 1;
    }
    const total = attackTotal(move);
    p.action = kind;
    p.actionElapsed = 0;
    p.actionTotal = total;
    p.attack = { kind, move, elapsed: 0, hit: new Set(), props: new Set(), energyGained: 0, contact: false, connected: false };
    p.hitSet = new Set();
    p.queuedLight = false;
    p.attackCooldown = total;
    this.audio.sound(kind === "heavy" ? "heavy" : kind === "air" ? "heavy" : "light");
    if (this.tutorial.enabled && !this.tutorial.attacked) this.tutorial.attacked = true;
  }

  useSpecial(finisher) {
    const p = this.player;
    if (p.stunT > 0 || p.dodgeT > 0 || !canCancelAttack(p, finisher ? "finisher" : "special")) return;
    const cost = finisher ? 100 : (this.variantOn ? 40 : 35);
    if (!p.training && p.energy < cost) {
      p.inputBuffer = null;
      this.ui.toast(finisher ? "能量还不够终结技；继续命中攒满。" : "绝招需要 " + cost + " 点气劲；普通攻击命中后会增长。", 1600);
      return;
    }
    p.energy = p.training ? 100 : p.energy - cost;
    p.inputBuffer = null; p.chainCount = 0; p.chainUntil = 0;
    const base = finisher ? this.finisherMove(p.fighterId) : this.specialMove(p.fighterId);
    let move = { ...base, damage: Math.round(base.damage * p.power), range: base.range * (this.variantOn ? 1.2 : 1), noEnergy: true, staggerDamage: finisher ? 80 : 30 };
    p.action = finisher ? "finisher" : "special";
    p.actionElapsed = 0;
    p.actionTotal = attackTotal(move);
    p.attack = { kind: finisher ? "finisher" : "special", move, elapsed: 0, hit: new Set(), props: new Set(), energyGained: 0, contact: false, connected: false };
    p.queuedLight = false;
    p.attackCooldown = p.actionTotal;
    this.audio.sound(finisher ? "finisher" : "special");
    this.renderer.shake(finisher ? .32 : .17);
    this.ui.toast(move.name + (finisher ? " · 终结技" : "！"), 1100);
    if (this.tutorial.enabled && !this.tutorial.energy) this.tutorial.energy = true;
  }

  specialMove(id) {
    if (id === "qiao") return { name: "穿巷步", startup: .1, active: .2, recovery: .34, range: 1.8, drive: 1.15, damage: 26, knock: 3.3, stun: .7, height: "mid", guardBreak: true };
    if (id === "tie") return { name: "山靠", startup: .36, active: .25, recovery: .52, range: 2.5, damage: 48, knock: 5.6, stun: .9, height: "low", guardBreak: true, launch: .8 };
    return { name: "回风掌", startup: .21, active: .22, recovery: .4, range: 2.8, damage: 32, knock: 3.8, stun: .7, height: "mid", guardBreak: true };
  }

  finisherMove(id) {
    const common = { startup:.28,active:.32,recovery:.55,knock:5.5,stun:1,height:"mid",guardBreak:true };
    if(id === "qiao") return {...common,name:"回燕双旋",startup:.2,active:.42,range:3.5,damage:36,knock:1.2,launch:.35,multiHits:2};
    if(id === "tie") return {...common,name:"山门震落",startup:.4,range:3.6,damage:78,knock:6,launch:1.3,height:"low"};
    return {...common,name:"守馆终章",range:4.5,damage:64,launch:1.1};
  }

  updatePlayerAttack(dt) {
    const p = this.player;
    const attack = p.attack;
    if (!attack) return;
    attack.elapsed = p.actionElapsed;
    const move = attack.move;
    if (attack.kind === "throw") {
      if (!attack.released && p.actionElapsed >= move.startup) {
        attack.released = true;
        if (p.weapon) {
          this.projectiles.push({ id: "shot-" + this.nextEntityId++, owner: p.id, side: "player", kind: "club",
            x: p.x + p.facing * .5, y: p.y + 1.35, z: p.z,
            vx: p.facing * 11, vy: .5, vz: 0, damage: Math.round(38 * p.power), life: .95, spin: 0 });
          p.weapon = null;
          this.audio.sound("heavy");
          this.ui.toast("短棍掷出 · 同一纵深命中可破防", 950);
        }
      }
      return;
    }
    if (move.drive) {
      const progress = Math.min(1, p.actionElapsed / Math.max(.1, move.startup + move.active));
      const previous = attack.driveProgress || 0;
      const bounds = this.renderer.getWorldBounds();
      const blocker = this.enemies.filter(e=>e.health>0 && Math.abs(e.z-p.z)<.6 && (e.x-p.x)*p.facing>0).sort((a,b)=>Math.abs(a.x-p.x)-Math.abs(b.x-p.x))[0];
      let travel = Math.max(0,progress-previous)*move.drive;
      if (blocker) travel = Math.min(travel,Math.max(0,Math.abs(blocker.x-p.x)-.68));
      p.x = clamp(p.x + p.facing*travel,bounds.minX,bounds.maxX); attack.driveProgress = progress;
    }
    if (move.multiHits && p.actionElapsed >= move.startup + move.active * .55 && !attack.secondPulse) {
      attack.secondPulse = true; attack.hit.clear();
    }
    if (p.grabTarget) {
      const held = this.enemies.find(e => e.id === p.grabTarget);
      if (held) {
        held.x = p.x + p.facing * .64; held.z = p.z;
        held.y = .24 + Math.sin(Math.min(1, (p.actionElapsed - move.startup) / .18) * Math.PI) * .32;
        if (p.actionElapsed >= move.startup + .18) this.releaseGrab(false);
      } else p.grabTarget = null;
    }
    if (!inActiveWindow(move, attack.elapsed)) return;
    const allTargets = this.enemies.filter((enemy) => enemy.health > 0 && enemy.state !== "ko");
    let hitCount = 0;
    for (const enemy of allTargets) {
      if (attack.hit.has(enemy.id)) continue;
      if (enemy.juggleLocked || enemy.grabbedBy) continue;
      const verdict = resolveHit(p, enemy, move, { damageScale: 1, laneTolerance: move.height === "low" ? 1.05 : .91 });
      if (!verdict.hit) {
        if (verdict.reason === "guard" && !attack.hit.has("guard:" + enemy.id)) {
          attack.contact = true;
          p.chainUntil = this.gameTime + .75;
          attack.hit.add("guard:" + enemy.id);
          this.audio.sound("guard");
          this.renderer.spawnHit(enemy.x, enemy.y + 1.1, enemy.z, .45, "#d6bd86");
        }
        continue;
      }
      if (move.grab && !enemy.boss && !enemy.airborne && !attack.grabUsed) {
        attack.grabUsed = true; attack.hit.add(enemy.id); attack.contact = true; attack.connected = true;
        p.grabTarget = enemy.id; enemy.grabbedBy = p.id; enemy.state = "grabbed"; enemy.action = "hit";
        enemy.move = null; enemy.stunT = 0; enemy.hurtT = 0;
        this.ui.toast("擒住了 · 过肩投摔", 900);
        break;
      }
      attack.hit.add(enemy.id);
      attack.contact = true; attack.connected = true;
      if (attack.kind === "light") p.chainUntil = this.gameTime + .8;
      this.applyPlayerHit(enemy, move, verdict);
      hitCount++;
    }
    for (const prop of this.renderer.props) {
      if (!prop.userData || prop.userData.broken || attack.props.has(prop.uuid)) continue;
      const dx = prop.userData.worldX - p.x;
      const forward = p.facing >= 0 ? dx : -dx;
      const lane = Math.abs(prop.userData.worldZ - p.z);
      if (forward >= -.2 && forward <= move.range && lane <= 1.05) {
        attack.props.add(prop.uuid);
        const outcome = this.renderer.hitProp(prop);
        if (outcome?.broken) {
          this.audio.sound("break");
          this.spawnDrop(outcome.drop, outcome.x, outcome.z);
          this.ui.toast(outcome.drop === "tea" ? "木箱碎开，里面有姜茶。" : "路障裂开，捡起短棍能用一会儿。", 1800);
        } else if (outcome) {
          this.renderer.spawnDust(prop.userData.worldX, .08, prop.userData.worldZ, 3);
        }
      }
    }
    if (hitCount > 1) this.renderer.shake(.09);
    if (hitCount && p.training) p.energy = 100;
  }

  applyPlayerHit(enemy, move, verdict) {
    const p = this.player;
    if (enemy.guard && !verdict.flanked && !verdict.guardBreak) return;
    enemy.entry = null;
    if (enemy.juggleLocked) return;
    const exposed = enemy.boss && ["recover", "staggered"].includes(enemy.state) && !enemy.move?.followUp;
    const actual = Math.max(1, Math.round(verdict.damage * (enemy.boss ? (exposed ? .95 : .76) : Math.max(.55, 1 - (enemy.juggleHits || 0) * .16))));
    enemy.health = Math.max(0, enemy.health - actual);
    enemy.invulnerable = enemy.boss ? .09 : .12;
    const armored = enemy.boss && enemy.move?.armor && ["windup", "strike"].includes(enemy.state);
    enemy.hurtT = armored ? 0 : enemy.boss ? .10 : .19;
    enemy.armorFlashT = armored ? .14 : 0;
    if (!armored) { enemy.action = "hit"; enemy.actionElapsed = 0; enemy.actionTotal = .22; }
    enemy.stunT = enemy.boss ? 0 : Math.max(enemy.stunT, verdict.stun || 0);
    if (enemy.boss) {
      enemy.poiseMax ||= BOSS_POISE[enemy.style] || 70;
      if (!(enemy.staggerT > 0)) {
        enemy.poise = (enemy.poise || 0) + staggerPower(move) * (exposed ? 1.25 : 1);
        enemy.lastPoiseHit = this.gameTime;
        if (enemy.poise >= enemy.poiseMax) {
          enemy.poise = 0; enemy.staggerT = 1.4; enemy.state = "staggered"; enemy.move = null; enemy.pendingFollowUp = null;
          p.bossBreaks = (p.bossBreaks || 0) + 1;
          this.ui.toast(enemy.name + " 失衡！接重击或绝招。", 1400);
        } else if (!armored && !exposed) { enemy.state = "hurt"; enemy.stunT = .10; }
      }
    }
    enemy.vx = p.facing * verdict.knock * (enemy.boss ? .38 : 1);
    if (enemy.airborne && !enemy.boss) enemy.juggleHits = (enemy.juggleHits || 0) + 1;
    if (verdict.launch && !enemy.boss) {
      enemy.jumpVelocity = verdict.launch * 5.2;
      enemy.airborne = true;
      enemy.y = Math.max(enemy.y, .1);
      enemy.juggleHits = Math.max(1, enemy.juggleHits || 0);
    }
    if (enemy.juggleHits >= 3) { enemy.juggleLocked = true; enemy.jumpVelocity = -2; enemy.stunT = Math.min(enemy.stunT, .3); }
    if (enemy.trainingDummy || enemy.practiceFoe) {
      enemy.health = enemy.maxHealth;
      if (enemy.trainingDummy) enemy.stunT = .22;
    }
    p.hits++;
    p.score += (enemy.boss ? 210 : 90) + actual * 4;
    const gain = earnedEnergy(move, actual, p.attack);
    if (p.attack) p.attack.energyGained = (p.attack.energyGained || 0) + gain;
    p.energy = p.training ? 100 : clamp(p.energy + gain, 0, 100);
    if (move.branch && p.branches) p.branches[move.branch]++;
    if (move.counter && !p.attack?.countedCounter) { p.counterHits = (p.counterHits || 0) + 1; if (p.attack) p.attack.countedCounter = true; }
    if (p.airborne) p.airHits = (p.airHits || 0) + 1;
    if (this.gameTime - p.lastHitAt < 1.9) p.comboCount++;
    else p.comboCount = 1;
    p.lastHitAt = this.gameTime;
    p.bestCombo = Math.max(p.bestCombo, p.comboCount);
    this.comboTimer = 2.2;
    this.audio.sound(enemy.health <= 0 && enemy.boss ? "heavy" : "hit");
    this.renderer.spawnHit(enemy.x + p.facing * .46, enemy.y + 1.05, enemy.z, move.damage > 35 ? 1.85 : 1);
    if (move.damage >= 30 || enemy.boss) this.hitStop = Math.max(this.hitStop, move.damage > 45 ? .085 : .045);
    if (enemy.health <= 0 && !enemy.trainingDummy) this.killEnemy(enemy, false);
    if (enemy.boss && enemy.phase === 1 && enemy.phases > 1 && enemy.health <= enemy.maxHealth * .52 && enemy.health > 0) this.changeBossPhase(enemy);
  }

  releaseGrab(cancelled = true) {
    const p = this.player;
    if (!p?.grabTarget) return;
    const enemy = this.enemies.find(e => e.id === p.grabTarget);
    p.grabTarget = null;
    if (!enemy) return;
    enemy.grabbedBy = null; enemy.state = "hurt"; enemy.stunT = .3; enemy.airborne = true;
    enemy.jumpVelocity = cancelled ? 1 : 4.7;
    if (!cancelled && p.attack) {
      const move = { ...p.attack.move, grab: false, launch: .9 };
      this.applyPlayerHit(enemy, move, { ...move, damage: move.damage });
      enemy.thrownByPlayer = true; enemy.thrownHit = new Set(); enemy.vx = p.facing * 6.5;
      this.audio.sound("heavy");
    }
  }

  killEnemy(enemy, playerCaused = true) {
    if (enemy.state === "ko") return;
    enemy.health = Math.max(0, enemy.health);
    enemy.state = "ko";
    enemy.koT = enemy.boss ? .95 : .58;
    enemy.action = "hit";
    enemy.actionElapsed = 0;
    enemy.actionTotal = enemy.koT;
    enemy.invulnerable = 999;
    enemy.vx = playerCaused ? this.player.facing * 1.5 : enemy.vx;
    this.audio.sound(enemy.boss ? "win" : "hit");
    this.renderer.spawnDust(enemy.x, 0, enemy.z, enemy.boss ? 11 : 6);
    if (enemy.boss) {
      this.enemyEntryQueue = [];
      this.projectiles = this.projectiles.filter(shot => shot.side !== "enemy");
      for (const support of this.enemies) if (support !== enemy && support.health > 0) {
        support.health = 0; support.state = "ko"; support.action = "hit"; support.koT = .45; support.vx = 0;
      }
      this.audio.startMusic(this.levelIndex, false);
      this.ui.toast(enemy.name + " 倒下了！", 1800);
    }
  }

  updateEnemies(dt) {
    if (this.mode === "play" && !this.waveSpawned && this.waveIndex < 3) this.spawnWave(this.waveIndex);
    this.battleClock ||= { nextAttackAt: 0, nextRangedAt: 0 };
    this.updateEnemyEntries(dt);
    const bounds = this.renderer.getWorldBounds();
    for (const enemy of [...this.enemies]) {
      if (enemy.state === "ko") {
        enemy.koT -= dt; enemy.x = clamp(enemy.x + enemy.vx * dt, bounds.minX, bounds.maxX); enemy.vx *= .9;
        if (enemy.koT <= 0) this.enemies = this.enemies.filter(item => item !== enemy);
        continue;
      }
      if (enemy.grabbedBy) continue;
      for (const key of ["invulnerable", "hurtT", "stunT", "cooldown", "armorFlashT"]) enemy[key] = Math.max(0, (enemy[key] || 0) - dt);
      enemy.attackElapsed = (enemy.attackElapsed || 0) + dt;
      const wasAirborne = enemy.airborne;
      this.updateJumpPhysics(enemy, dt);
      if (wasAirborne && !enemy.airborne) {
        enemy.juggleHits = 0; enemy.juggleLocked = false; enemy.thrownByPlayer = false;
        enemy.downT = .48; enemy.invulnerable = Math.max(enemy.invulnerable, .35);
      }
      if (enemy.trainingDummy) {
        if (!enemy.hurtT && !enemy.stunT) { enemy.state = "idle"; enemy.action = "idle"; enemy.downT = 0; }
        continue;
      }
      if (enemy.entry) { this.advanceEnemyEntry(enemy, dt); continue; }
      if (enemy.downT > 0) { enemy.downT -= dt; enemy.state = "down"; enemy.action = "hit"; continue; }
      if (enemy.staggerT > 0) {
        enemy.staggerT = Math.max(0, enemy.staggerT - dt); enemy.state = "staggered"; enemy.action = "hit";
        if (!enemy.staggerT) { enemy.state = "idle"; enemy.hurtT = 0; enemy.cooldown = .45; }
        continue;
      }
      if (enemy.boss && this.gameTime - (enemy.lastPoiseHit || 0) > 3) enemy.poise = Math.max(0, (enemy.poise || 0) - dt * 8);
      if ((enemy.hurtT > 0 || enemy.stunT > 0) && !(enemy.boss && enemy.state === "recover")) {
        enemy.state = "hurt"; enemy.action = "hit";
        enemy.x = clamp(enemy.x + enemy.vx * dt, bounds.minX, bounds.maxX); enemy.vx *= .88;
        continue;
      }
      enemy.guard = false;
      const toPlayer = this.player.x - enemy.x, absX = Math.abs(toPlayer), dz = this.player.z - enemy.z;
      if (enemy.state === "windup" || enemy.state === "feint") {
        enemy.action = "warning";
        if (!enemy.aimLocked) {
          enemy.aimX = this.player.x; enemy.aimZ = this.player.z;
          enemy.facing = toPlayer >= 0 ? 1 : -1;
          if (enemy.windup <= enemy.move.startup * .48) lockAim(enemy, bounds);
        }
        enemy.windup -= dt;
        enemy.alert = Math.max(0, enemy.windup / Math.max(.01, enemy.move.startup));
        if (enemy.windup <= 0) {
          if (enemy.state === "feint" && !enemy.feintDone) {
            enemy.feintDone = true; enemy.state = "windup";
            enemy.move = { ...enemy.move, startup: enemy.move.followStartup || .36 };
            enemy.windup = enemy.move.startup; enemy.aimLocked = false;
            this.ui.toast("虚步落地 · 留意追拳，再抓收招。", 1000);
          } else this.beginEnemyStrike(enemy);
        }
        continue;
      }
      if (enemy.state === "strike") {
        enemy.action = "heavy";
        if (enemy.move.kind === "charge") {
          const before = stepCharge(enemy, dt);
          if (!enemy.attackResolved && chargeContact(before, enemy, this.player)) {
            enemy.attackResolved = true; this.checkEnemyStrike(enemy, true);
          }
        } else if (enemy.move.kind !== "projectile" && !enemy.attackResolved) {
          enemy.attackResolved = true; this.checkEnemyStrike(enemy);
        }
        enemy.strikeT -= dt;
        if (enemy.strikeT <= 0) this.beginEnemyRecovery(enemy);
        continue;
      }
      if (enemy.state === "recover") {
        enemy.action = enemy.hurtT > 0 ? "hit" : "idle";
        enemy.recoverT -= dt;
        if (enemy.recoverT <= 0) {
          enemy.pendingFollowUp = enemy.move?.followUp ? { ...enemy.move.followUp, damage: enemy.damage + 3 } : null;
          enemy.state = "idle";
          enemy.cooldown = enemy.pendingFollowUp ? .05 : (enemy.boss ? .62 : .42) * difficultyById(this.selectedDifficulty).enemyRecovery;
          enemy.attackCount = (enemy.attackCount || 0) + 1;
        }
        continue;
      }
      enemy.facing = toPlayer >= 0 ? 1 : -1;
      let target;
      if (enemy.boss) target = { x: this.player.x - enemy.facing * (enemy.style === "dart" ? 2.2 : 1.5), z: this.player.z };
      else target = formationTarget(enemy, this.enemies, this.player);
      target.x = clamp(target.x, bounds.minX + .15, bounds.maxX - .15);
      const oldX = enemy.x, oldZ = enemy.z;
      enemy.x += clamp(target.x - enemy.x, -enemy.speed * dt, enemy.speed * dt);
      enemy.z += clamp(target.z - enemy.z, -enemy.speed * .57 * dt, enemy.speed * .57 * dt);
      enemy.state = Math.abs(oldX - enemy.x) + Math.abs(oldZ - enemy.z) > .003 ? "walk" : "idle";
      enemy.action = "idle"; enemy.moveT = enemy.state === "walk" ? (enemy.moveT || 0) + dt : 0;
      if (enemy.type === "guard" && absX < 2.1 && Math.abs(dz) < 1) {
        enemy.guard = ((this.gameTime + enemy.idNum * .41) % 1.65) < .95;
        if (enemy.guard) { enemy.guardFacing ??= enemy.facing; enemy.facing = enemy.guardFacing; enemy.action = "warning"; }
        else enemy.guardFacing = null;
      }
      if (Math.abs(enemy.x - this.player.x) < .64 && Math.abs(enemy.z - this.player.z) < .62) enemy.x = this.player.x - enemy.facing * .64;
      enemy.x = clamp(enemy.x, bounds.minX, bounds.maxX); enemy.z = clamp(enemy.z, -2.1, 2.1);
      const reach = enemy.boss ? 6.8 : enemy.type === "ranged" ? 7.5 : enemy.type === "charger" ? 4.2 : enemy.reach + .5;
      if (enemy.cooldown <= 0 && absX <= reach && Math.abs(dz) <= 1.4) this.startEnemyWindup(enemy);
    }
    for (let i = 0; i < this.enemies.length; i++) for (let j = i + 1; j < this.enemies.length; j++) {
      const a = this.enemies[i], b = this.enemies[j];
      if (!["walk", "idle"].includes(a.state) || !["walk", "idle"].includes(b.state) || a.entry || b.entry) continue;
      const dx = b.x - a.x, dz = b.z - a.z, distance = Math.hypot(dx,dz);
      if (distance < .74) {
        const push = Math.min(.74-distance, dt * 1.4), sign = Math.sign(dx) || 1;
        a.x = clamp(a.x - sign * push * .5, bounds.minX, bounds.maxX); b.x = clamp(b.x + sign * push * .5, bounds.minX, bounds.maxX);
        a.z = clamp(a.z - push * .25, -2, 2); b.z = clamp(b.z + push * .25, -2, 2);
      }
    }
    for (const thrown of this.enemies.filter(e => e.thrownByPlayer && e.airborne && e.health > 0)) {
      for (const target of this.enemies) {
        if (target === thrown || target.health <= 0 || target.invulnerable > 0 || thrown.thrownHit.has(target.id)) continue;
        if (Math.abs(target.x - thrown.x) < .7 && Math.abs(target.z - thrown.z) < .7) {
          thrown.thrownHit.add(target.id);
          const move = { damage: 14, knock: 2.4, stun: .35, guardBreak: true, noEnergy: true, staggerDamage: 16 };
          this.applyPlayerHit(target, move, move);
        }
      }
    }
  }

  beginEnemyRecovery(enemy) {
    enemy.state = "recover"; enemy.recoverT = enemy.move.recovery; enemy.action = "idle";
    enemy.alert = 0;
  }

  makeEnemy(type, x, z, trainingDummy = false) {
    const base = ENEMIES[type] || ENEMIES.swift;
    const difficulty = difficultyById(this.selectedDifficulty);
    const hardFactor = difficulty.enemyHealth;
    const enemy = {
      id: "foe-" + this.nextEntityId++, idNum: this.nextEntityId,
      type, name: base.name, boss: false, visual: base, color: base.color, trim: base.trim, style: base.style,
      x, y: 0, z, facing: x > this.player.x ? -1 : 1,
      health: Math.round(base.hp * hardFactor), maxHealth: Math.round(base.hp * hardFactor), damage: base.damage * difficulty.enemyAttack,
      speed: base.speed * (this.selectedDifficulty === "master" ? 1.12 : 1), reach: base.reach, state: "idle",
      action: "idle", actionElapsed: 0, actionTotal: .35, invulnerable: 0, hurtT: 0, stunT: 0, cooldown: (.45 + Math.random() * .45) * difficulty.enemyRecovery,
      vx: 0, vz: 0, jumpVelocity: 0, airborne: false, attackCount: 0, trainingDummy
    };
    return enemy;
  }

  makeBoss() {
    const b = this.currentLevel.boss;
    const difficulty = difficultyById(this.selectedDifficulty);
    const scale = difficulty.bossHealth;
    const bounds = this.renderer.getWorldBounds();
    const boss = {
      id: "boss-" + this.nextEntityId++, idNum: this.nextEntityId,
      type: "boss", name: b.name, title: b.title, boss: true, style: b.style,
      color: b.color, trim: b.trim, phases: b.phases, phase: 1, phasePattern: 0,
      x: clamp(this.player.x + Math.min(3.4, (bounds.maxX - bounds.minX) * .38), bounds.minX, bounds.maxX), y: 0, z: 0, facing: -1,
      health: Math.round(b.hp * scale), maxHealth: Math.round(b.hp * scale), damage: b.damage * difficulty.enemyAttack,
      speed: b.speed * (this.selectedDifficulty === "master" ? 1.1 : 1), reach: 1.72,
      state: "idle", action: "idle", actionElapsed: 0, actionTotal: .35,
      invulnerable: 0, hurtT: 0, stunT: 0, cooldown: .5 * difficulty.enemyRecovery,
      vx: 0, vz: 0, jumpVelocity: 0, airborne: false, attackCount: 0,
      poise: 0, poiseMax: BOSS_POISE[b.style] || 70, staggerT: 0
    };
    return boss;
  }

  spawnWave(index) {
    if (index >= 3) return;
    this.waveSpawned = true;
    this.waveIndex = index;
    this.renderer.setLevel(this.levelIndex, index);
    const types = [...this.currentLevel.waves[index]];
    if (this.selectedDifficulty === "master" && index > 0 && types.length < 4) types.push(index === 2 ? "charger" : "swift");
    if (this.selectedDifficulty === "story" && index === 2 && types.length > 2) types.pop();
    this.queueEnemyEntries(types, { wave: index });
    this.transitionT = 0;
    this.ui.toast(this.currentLevel.zones[index] + "　·　巷边传来脚步声", 1800);
  }

  queueEnemyEntries(types, options = {}) {
    this.enemyEntryQueue.push(...planEnemyEntries(types, {
      playerX: this.player.x, playerZ: this.player.z, ...options
    }));
    this.audio.sound("step");
  }

  advanceEnemyEntry(enemy, dt) {
    const previousStep = Math.floor((enemy.moveT || 0) * 3.6);
    stepEnemyEntry(enemy, dt, this.player, this.renderer.getWorldBounds());
    if (Math.floor((enemy.moveT || 0) * 3.6) > previousStep) this.audio.sound("step");
  }

  updateEnemyEntries(dt) {
    const waiting = [];
    for (const ticket of this.enemyEntryQueue) {
      ticket.delay -= dt;
      if (ticket.delay > 0) { waiting.push(ticket); continue; }
      const enemy = ticket.boss ? this.makeBoss() : this.makeEnemy(ticket.type, 0, ticket.z);
      placeEnemyEntry(enemy, ticket, this.renderer.getWorldBounds(), this.renderer.getEntryBounds());
      this.enemies.push(enemy);
    }
    this.enemyEntryQueue = waiting;
  }

  startEnemyWindup(enemy) {
    if (enemy.entry || enemy.grabbedBy || enemy.downT > 0 || enemy.staggerT > 0 || enemy.health <= 0) return false;
    const bounds = this.renderer.getWorldBounds();
    if (enemy.x < bounds.minX - .15 || enemy.x > bounds.maxX + .15) return false;
    const style = enemy.boss ? enemy.style : (ENEMIES[enemy.type]?.style || "rush");
    let move = enemy.boss ? chooseBossMove(enemy, this.player) : { ...ENEMY_MOVES[enemy.type], damage: enemy.damage, kind: "line", name: enemy.name + "出拳" };
    if (!enemy.boss) {
      if (style === "charge") move = { ...move, name: "撞街突进", kind: "charge", startup: .78, active: .46, recovery: .9, range: 3.65, cue: "直线冲撞 · 换线或翻滚" };
      if (style === "ranged") {
        if (Math.abs(enemy.x - this.player.x) < 2.3) return false;
        move = { ...move, name: "掷物瞄准", kind: "projectile", startup: .78, active: .18, recovery: .88, range: 8, cue: "掷手瞄准 · 换线接近" };
      }
      if (style === "heavy") move = { ...move, name: "双臂重砸", startup: .88, recovery: 1.05, cue: "重击蓄力 · 重拳打断" };
    }
    const difficulty = difficultyById(this.selectedDifficulty);
    move = { ...move, startup: move.startup * (this.selectedDifficulty === "story" ? 1.18 : this.selectedDifficulty === "master" ? .93 : 1), recovery: move.recovery * (this.selectedDifficulty === "story" ? 1.25 : 1) };
    this.battleClock ||= { nextAttackAt: 0, nextRangedAt: 0 };
    if (!mayAttack(enemy, this.enemies, this.projectiles, this.battleClock, this.gameTime, move.kind, this.selectedDifficulty)) return false;
    this.battleClock.nextAttackAt = this.gameTime + (this.selectedDifficulty === "master" ? .22 : this.selectedDifficulty === "story" ? .55 : .30);
    if (move.kind === "projectile") this.battleClock.nextRangedAt = this.gameTime + (this.selectedDifficulty === "story" ? 1.6 : this.selectedDifficulty === "master" ? .9 : 1.15);
    if (enemy.boss && !enemy.pendingFollowUp) enemy.phasePattern = (enemy.phasePattern || 0) + 1;
    enemy.pendingFollowUp = null;
    enemy.move = move; enemy.state = move.feint ? "feint" : "windup";
    enemy.windup = move.startup; enemy.attackResolved = false; enemy.chargeElapsed = 0;
    enemy.strikeT = move.active; enemy.cooldown = 1.1 * difficulty.enemyRecovery;
    enemy.facing = this.player.x >= enemy.x ? 1 : -1;
    enemy.aimX = this.player.x; enemy.aimZ = this.player.z; enemy.aimLocked = false;
    enemy.action = "warning"; enemy.actionElapsed = 0; enemy.actionTotal = move.startup;
    enemy.guard = false;
    this.audio.sound("telegraph");
    if (enemy.boss) this.ui.toast(move.name + " · " + move.cue, 1800);
    return true;
  }

  beginEnemyStrike(enemy) {
    if (!enemy.aimLocked) lockAim(enemy, this.renderer.getWorldBounds());
    if (enemy.move.kind === "projectile") {
      const dx = enemy.aimX - enemy.x, dz = enemy.aimZ - enemy.z, distance = Math.hypot(dx,dz) || 1;
      this.projectiles.push({ id: "shot-" + this.nextEntityId++, owner: enemy.id, side: "enemy", kind: enemy.boss ? "stone" : "cloth",
        x: enemy.x + enemy.facing * .42, y: 1.33, z: enemy.z,
        vx: dx / distance * 7.3, vy: .45, vz: dz / distance * 7.3, damage: enemy.move.damage, life: 2.1, spin: 0, target: "player" });
    }
    enemy.state = "strike"; enemy.strikeT = enemy.move.active; enemy.attackResolved = false; enemy.chargeElapsed = 0;
    enemy.action = "heavy"; enemy.actionElapsed = 0; enemy.actionTotal = enemy.move.active + .12;
  }

  evadeAttack(enemy) {
    const p = this.player;
    if (p.invulnerable > 0) return true;
    if (!rollProtected(p)) return false;
    if (!p.perfectRollUsed && p.actionElapsed / p.actionTotal <= .43) {
      p.perfectRollUsed = true; p.counterReady = 1.0; p.counterTarget = enemy.id;
      p.perfectRolls = (p.perfectRolls || 0) + 1; p.energy = clamp(p.energy + 6, 0, 100);
      this.ui.toast("擦身避开！翻滚落地后按轻拳反击。", 1500);
      this.audio.sound("guard");
    }
    return true;
  }

  checkEnemyStrike(enemy, sweptContact = false) {
    if (enemy.entry) return false;
    const p = this.player, move = enemy.move;
    const dx = p.x - enemy.x, dz = Math.abs(p.z - enemy.z);
    let connected = sweptContact;
    if (!sweptContact) {
      if (move.kind === "slam") connected = Math.abs(dx) <= move.range && dz <= 1.45 && p.y < .56;
      else if (move.kind === "sweep") connected = Math.abs(dx) <= move.range && dz <= .72 && p.y < 1.7;
      else if (move.kind === "charge") connected = Math.abs(dx) <= .78 && dz <= .65 && p.y < 1.5;
      else if (move.kind !== "projectile") connected = (!move.low || p.y < .35) && resolveEnemyHit(enemy,p,move).hit;
    }
    if (!connected || this.evadeAttack(enemy)) return false;
    this.takePlayerDamage(enemy, move.damage, move.kind === "slam" ? 3.4 : move.knock);
    return true;
  }

  takePlayerDamage(enemy, damage, knock = 1.2) {
    const p = this.player;
    if (this.mode === "defeat" || p.health <= 0 || p.training || p.invulnerable > 0 || rollProtected(p)) return;
    this.releaseGrab(true);
    p.inputBuffer = null; p.chainCount = 0; p.counterReady = 0;
    p.health = Math.max(0, p.health - Math.max(1, Math.round(damage)));
    p.damageTaken += Math.max(1, Math.round(damage));
    p.invulnerable = this.selectedDifficulty === "story" ? 1.5 : .82;
    p.hurtT = .28;
    p.stunT = .43;
    p.action = "hit";
    p.attack = null;
    p.queuedLight = false;
    p.vx = enemy.facing * knock;
    p.vz = clamp(p.z - enemy.z, -.5, .5) * 1.5;
    this.renderer.spawnHit(p.x, p.y + 1.05, p.z, 1.1, "#e89169");
    this.renderer.shake(.12);
    this.audio.sound("hit");
    if (p.health <= 0) this.endInDefeat();
  }

  changeBossPhase(boss) {
    boss.phase = 2;
    boss.color = "#503f39";
    boss.trim = "#efbd71";
    boss.damage *= 1.12;
    boss.speed *= 1.13;
    boss.invulnerable = .85;
    boss.poise = 0; boss.staggerT = 0; boss.pendingFollowUp = null; boss.move = null;
    this.projectiles = this.projectiles.filter(shot => shot.owner !== boss.id);
    boss.state = "recover";
    boss.recoverT = 1.0;
    boss.action = "special";
    boss.actionElapsed = 0;
    boss.actionTotal = .9;
    this.audio.startMusic(this.levelIndex, true);
    this.audio.sound("finisher");
    this.renderer.shake(.28);
    this.ui.toast("周啸天变招了！第二式 · 看清橙色预警再闪。", 2300);
    if (this.selectedDifficulty !== "story") {
      this.queueEnemyEntries(["guard", "ranged"], { delay: 1.0, stagger: .72, wave: 1 });
      this.ui.toast("支援赶到！先改走另一条纵深车道。", 1600);
    }
  }

  updateProjectiles(dt) {
    for (const projectile of [...this.projectiles]) {
      if (projectile.life <= 0 || !this.projectiles.includes(projectile)) continue;
      const before = { x: projectile.x, y: projectile.y, z: projectile.z };
      projectile.life -= dt;
      projectile.x += projectile.vx * dt;
      projectile.y += projectile.vy * dt;
      projectile.z += projectile.vz * dt;
      projectile.vy -= 2.5 * dt;
      projectile.spin += dt * 9;
      if (projectile.side === "enemy") {
        const dx = Math.abs(projectile.x - this.player.x);
        const dz = Math.abs(projectile.z - this.player.z);
        const dy = Math.abs(projectile.y - (this.player.y + 1.05));
        if (dx < .48 && dz < .65 && dy < .9) {
          const source = { id: projectile.owner, facing: projectile.vx >= 0 ? 1 : -1, z: projectile.z };
          if (!this.evadeAttack(source)) this.takePlayerDamage(source, projectile.damage, .8);
          projectile.life = 0;
        }
      } else {
        const contacts = this.enemies.map(enemy => ({ enemy, t: projectileContact(before, projectile, enemy, .65) }))
          .filter(hit => hit.t !== null).sort((a,b) => a.t - b.t);
        const target = contacts[0]?.enemy;
        if (target) {
          const healthBefore = target.health;
          const move = { damage: projectile.damage, knock: 3.4, stun: .65, launch: .35, guardBreak: true, staggerDamage: 32, noEnergy: true };
          this.applyPlayerHit(target, move, { ...move, hit: true });
          target.vx = Math.sign(projectile.vx) * move.knock * (target.boss ? .38 : 1);
          this.renderer.shake(.09);
          this.ui.toast("短棍命中 · " + target.name + (target.practiceFoe || target.trainingDummy ? "" : " −" + (healthBefore - target.health)), 950);
          projectile.life = 0;
        }
      }
      if (projectile.y < .12 || projectile.life <= 0 || Math.abs(projectile.x) > 12) projectile.life = 0;
    }
    this.projectiles = this.projectiles.filter((item) => item.life > 0);
  }

  spawnDrop(type, x, z) {
    const drop = { id: "drop-" + this.nextEntityId++, type, name: type === "tea" ? "姜茶" : "短棍", x, z, time: 0, ttl: 38 };
    this.drops.push(drop);
    return drop;
  }

  updatePickups(dt, frame) {
    const p = this.player;
    for (const drop of this.drops) {
      drop.time += dt;
      drop.ttl -= dt;
    }
    this.drops = this.drops.filter((drop) => drop.ttl > 0);
    this.nearbyDrop = this.drops.find((drop) => Math.hypot(drop.x - p.x, (drop.z - p.z) * .8) <= 1.18) || null;
    this.nearbyProp = this.renderer.getPropNear(p.x, p.z, 1.4);
    if (frame.device === "touch" && this.nearbyDrop && Math.hypot(this.nearbyDrop.x - p.x, this.nearbyDrop.z - p.z) < .72 && !this.autoPickupLock) {
      this.autoPickupLock = true;
      this.interact();
      setTimeout(() => { this.autoPickupLock = false; }, 450);
    }
  }

  interact() {
    const p = this.player;
    const drop = this.drops.find((item) => Math.hypot(item.x - p.x, (item.z - p.z) * .8) <= 1.18);
    if (!drop) {
      const prop = this.renderer.getPropNear(p.x, p.z, 1.5);
      if (prop) {
        this.ui.toast("木箱可以用拳脚打碎。");
      } else {
        this.ui.toast("附近没有补给；木箱和路障可以打碎。", 1200);
      }
      return;
    }
    if (drop.type === "tea") {
      const gained = Math.min(24, p.maxHealth - p.health);
      if (gained <= 0 && !p.training) {
        this.ui.toast("气血充足，把姜茶留给下一次受伤。");
        return;
      }
      p.health = p.training ? p.maxHealth : Math.min(p.maxHealth, p.health + 24);
      this.audio.sound("pickup");
      this.ui.toast(p.training ? "姜茶 · 练功房恢复" : "姜茶入喉 · 恢复 " + gained + " 点气血。", 1600);
    } else {
      if (p.weapon) {
        this.ui.toast("手里已有短棍，按 G 掷出去再捡新的。");
        return;
      }
      p.weapon = { time: 14, hits: 5 };
      this.audio.sound("pickup");
      this.ui.toast("短棍已拿稳，限时 14 秒、最多挥出 5 次；G 掷出。", 1900);
    }
    p.pickups++;
    this.drops = this.drops.filter((item) => item !== drop);
  }

  throwWeapon() {
    const p = this.player;
    if (!p.weapon) {
      p.inputBuffer = null;
      this.ui.toast("手中没有短棍 · 打碎路障后按 " + (this.input.label?.("interact") || "E") + " 拾取", 1600);
      return false;
    }
    if (p.stunT > 0 || p.dodgeT > 0 || !canCancelAttack(p, "throw")) return false;
    p.inputBuffer = null; p.chainCount = 0; p.chainUntil = 0;
    const move = { name: "掷出短棍", startup: .18, active: .10, recovery: .28, damage: 0, noEnergy: true };
    p.action = "throw"; p.actionElapsed = 0; p.actionTotal = attackTotal(move);
    p.attack = { kind: "throw", move, elapsed: 0, released: false, hit: new Set(), props: new Set() };
    return true;
  }

  updateRoomFlow(dt) {
    if (this.mode === "training") return;
    if (this.enemyEntryQueue.length || this.enemies.some((enemy) => enemy.entry && enemy.health > 0)) {
      this.transitionT = 0;
      return;
    }
    const alive = this.enemies.filter((enemy) => enemy.health > 0 && enemy.state !== "ko");
    if (this.bossStarted && alive.length === 0) {
      this.transitionT += dt;
      if (this.transitionT > 1.0) this.finishStage();
      return;
    }
    if (!this.bossStarted && this.waveSpawned && alive.length === 0) {
      this.transitionT += dt;
      if (this.transitionT > 1.65) {
        this.transitionT = 0;
        this.enemies = [];
        const restHeal = this.selectedDifficulty === "story"
          ? Math.min(this.waveIndex < 2 ? 28 : this.player.maxHealth, this.player.maxHealth - this.player.health)
          : 0;
        this.player.health += restHeal;
        if (this.waveIndex < 2) {
          const next = this.waveIndex + 1;
          this.waveSpawned = false;
          this.spawnWave(next);
          if (next === 1) this.spawnDrop("tea", -1.45, .6);
          if (restHeal > 0) this.ui.toast("街坊递来姜茶 · 恢复 " + restHeal + " 点气血。", 1800);
        } else {
          this.bossStarted = true;
          this.renderer.setLevel(this.levelIndex, 3);
          this.enemies = [];
          this.queueEnemyEntries(["boss"], { boss: true, delay: .45 });
          this.bossIntroT = 2.6;
          this.mode = "bossIntro";
          this.input.clear();
          this.ui.render("bossIntro");
          this.audio.startMusic(this.levelIndex, true);
          if (restHeal > 0) this.ui.toast("巷口歇一歇 · 恢复 " + restHeal + " 点气血，准备迎战。", 2200);
        }
      }
    }
  }

  startBossFight() {
    if (this.mode !== "bossIntro") return;
    if (this.enemyEntryQueue.length || this.enemies.some((enemy) => enemy.entry)) {
      this.bossIntroT = 0;
      return;
    }
    this.mode = "play";
    this.input.clear();
    this.ui.render("play");
    this.audio.startMusic(this.levelIndex, true);
    const boss = this.enemies.find((enemy) => enemy.boss);
    this.ui.toast(boss ? boss.title + " · 观察起手，别贪两拳。" : "头目战开始", 1800);
  }

  finishStage() {
    if (this.mode !== "play") return;
    const clear = gradeEncounter({
      hits: this.player.hits, damageTaken: this.player.damageTaken, timeSeconds: this.gameTime,
      defeated: false, difficultyBonus: difficultyById(this.selectedDifficulty).bonus
    });
    const reward = Math.round(this.currentLevel.tokens * (clear.grade === "S" ? 1.6 : clear.grade === "A" ? 1.35 : 1));
    const report = {
      level: this.levelIndex, time: this.gameTime, hits: this.player.hits, damageTaken: this.player.damageTaken,
      bestCombo: this.player.bestCombo, pickups: this.player.pickups, score: clear.score + this.player.score, grade: clear.grade,
      reward, fighter: this.selectedFighter, unlocks: []
    };
    const oldFighters = [...this.save.unlockedFighters];
    const oldVariants = [...this.save.unlockedVariants];
    this.save = applyStageClear(this.save, this.levelIndex, { ...report, score: report.score, time: report.time });
    report.unlocks = this.save.unlockedFighters.filter((id) => !oldFighters.includes(id)).map((id) => fighterById(id).name);
    if (this.save.unlockedVariants.length > oldVariants.length) report.unlocks.push("回声变招");
    this.campaignScore += report.score;
    this.lastResult = report;
    this.persist();
    this.audio.stopMusic();
    this.audio.sound("win");
    this.renderer.shake(.22);
    if (this.levelIndex === 4) {
      const aggregate = {
        time: this.campaignTime, score: this.campaignScore, fighter: this.selectedFighter,
        difficulty: this.selectedDifficulty, grade: report.grade, reward: report.reward
      };
      this.save = applyCampaignClear(this.save, aggregate);
      this.save.unlockedFighters = ["lin", "qiao", "tie"];
      report.unlocks = ["三位角色均已开放", "回声变招"];
      this.persist();
      this.lastResult = report;
      this.audio.sound("bell");
      this.goto("victory");
    } else {
      this.goto("result");
    }
  }

  endInDefeat() {
    if (this.mode === "defeat") return;
    this.audio.stopMusic();
    this.audio.sound("lose");
    this.lastResult = { ...this.lastResult, level: this.levelIndex, time: this.gameTime, hits: this.player.hits, damageTaken: this.player.damageTaken, bestCombo: this.player.bestCombo };
    this.goto("defeat");
  }

  updateTraining(dt) {
    if (!this.enemies.some((enemy) => enemy.trainingDummy || enemy.practiceFoe)) this.trainingRespawnT += dt;
    else this.trainingRespawnT = 0;
    if (this.trainingRespawnT > .5) {
      this.spawnTrainingDummy();
      this.trainingRespawnT = 0;
    }
    this.player.health = this.player.maxHealth;
    this.player.energy = 100;
  }

  updateTutorial(frame) {
    if (!this.tutorial.enabled) return;
    if (this.tutorial.moved && !this.tutorial.moveSeen) {
      this.tutorial.moveSeen = true;
      this.ui.toast("前后都能走：上、下键沿纵深换位，攻击时也能移动。", 2100);
    }
    if (this.tutorial.attacked && !this.tutorial.attackSeen) {
      this.tutorial.attackSeen = true;
      this.ui.toast("轻拳接重击快速破防；两次轻拳接重击挑空，再跳起追击。", 3000);
    }
    if (this.tutorial.dodged && !this.tutorial.dodgeSeen) {
      this.tutorial.dodgeSeen = true;
      this.ui.toast("翻滚中段避伤；擦身躲开攻击，落地后按轻拳反击。", 2600);
    }
    if (this.tutorial.energy && !this.tutorial.energySeen) {
      this.tutorial.energySeen = true;
      this.ui.toast("命中积攒气劲：U 消耗 35，I 需要满 100 才能终结。", 2200);
    }
  }

  updateWorld(delta) {
    this.renderer.setPickupsAndProjectiles(this.drops, this.projectiles);
    const dt = Math.min(.05, delta);
    this.renderer.update(dt, this.player, this.enemies, 0);
    this.ui?.renderHud(false);
  }
}
