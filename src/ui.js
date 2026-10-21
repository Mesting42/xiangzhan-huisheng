import { FIGHTERS, DIFFICULTIES, LEVELS } from "./data.js";

const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);

function menuButton(action, label, index, note, primary = false, extra = "") {
  return '<button class="menu-button ' + (primary ? "primary " : "") + extra + '" data-action="' + action + '">' +
    '<span class="menu-index">' + index + '</span><span class="menu-label">' + label + '</span><span class="menu-note">' + note + '</span></button>';
}

function actionButton(action, label, primary = false, extra = "") {
  return '<button class="action-button ' + (primary ? "primary " : "") + extra + '" data-action="' + action + '">' + label + '</button>';
}

function controlsMarkup(input, dense = false) {
  const key = (action) => esc(input.label(action));
  const items = [
    ["移动", key("up") + " / " + key("left") + " " + key("down") + " " + key("right")],
    ["轻攻击", key("light")], ["重击破防", key("heavy")], ["跳跃 / 空中追击", key("jump") + " + " + key("light") + " / " + key("heavy")],
    ["翻滚", key("dodge")], ["绝招 / 终结技", key("special") + " / " + key("finisher")],
    ["拾取 / 投掷短棍", key("interact") + " / " + key("throw")], ["暂停", key("pause")]
  ];
  const half = dense ? items.slice(0, 6) : items;
  return '<div class="controls-box ' + (dense ? "dense" : "") + '">' + half.map((row) => '<div><strong>' + row[0] + '</strong>　' + row[1] + '</div>').join("") +
    '<div><strong>手柄</strong>　左摇杆移动 · A轻拳 · X重击 · Y跳跃 · B翻滚 · LB绝招 · RB终结 · Start暂停</div>' +
    (dense ? '' : '<div><strong>连招</strong>　轻→重快速破防；轻→轻→重挑空，跳起追击。铁山直接重击可擒摔。</div><div><strong>反击</strong>　翻滚中段避伤；擦身避开后，落地按轻拳反击。Boss 失衡或收招时适合进攻。</div>') + '</div>';
}

export class UI {
  constructor(game) {
    this.game = game;
    this.screen = document.getElementById("screen");
    this.hud = document.getElementById("hud");
    this.gameRoot = document.getElementById("game");
    this.toastEl = document.getElementById("toast");
    this.touch = document.getElementById("touch-controls");
    this.toastTimer = 0;
    this.modalOpen = false;
    this.boundClick = (event) => this.handleClick(event);
    this.boundChange = (event) => this.handleChange(event);
    this.boundInput = (event) => this.handleInput(event);
    this.screen.addEventListener("click", this.boundClick);
    this.hud.addEventListener("click", this.boundClick);
    this.screen.addEventListener("change", this.boundChange);
    this.screen.addEventListener("input", this.boundInput);
    this.screenMode = "";
    this.hudMode = "";
    this.touchPreference = Boolean(window.matchMedia?.("(any-pointer: coarse)").matches);
    this.touchLayoutMedia = window.matchMedia?.("(max-width: 1100px)") || null;
    this.orientationTipDismissed = false;
    this.lastOrientation = window.innerWidth > window.innerHeight ? "landscape" : "portrait";
    for (const [action,label] of [["interact","拾取"],["throw","投棍"]]) {
      if (!this.touch.querySelector('[data-action="'+action+'"]')) {
        const button = document.createElement("button");
        button.className = "touch-button utility " + action; button.dataset.action = action; button.textContent = label;
        this.touch.querySelector(".touch-actions").append(button);
        this.game.input.bindTouchButton(button);
      }
    }
    this.syncTouchControls = () => {
      const playing = ["play", "training", "bossIntro"].includes(this.screenMode);
      const narrow = Boolean(this.touchLayoutMedia?.matches);
      const touchLayout = this.touchPreference || narrow;
      this.touch.classList.toggle("visible", playing && touchLayout && this.screenMode !== "bossIntro");
      this.gameRoot.classList.toggle("touch-layout", touchLayout);
      this.gameRoot.classList.toggle("is-playing", playing);
      const orientation = window.innerWidth > window.innerHeight ? "landscape" : "portrait";
      if (orientation !== this.lastOrientation) {
        this.lastOrientation = orientation;
        this.game.input.clear();
        if (playing) { this.game.pauseGame(); return; }
      }
    };
    this.touchLayoutMedia?.addEventListener?.("change", this.syncTouchControls);
    window.addEventListener("resize", this.syncTouchControls);
  }

  render(mode) {
    const previousMode = this.screenMode;
    const previousScroll = this.screen.querySelector("section")?.scrollTop || 0;
    this.screenMode = mode;
    this.modalOpen = false;
    this.screen.innerHTML = this.viewFor(mode);
    const shell = this.screen.querySelector("section");
    if (shell) shell.classList.add("mode-" + mode);
    if (shell && previousMode === mode) shell.scrollTop = previousScroll;
    if (shell && !this.orientationTipDismissed && ["menu","character","intro","training-ready","pause"].includes(mode)) {
      const tip = document.createElement("aside");
      tip.className = "orientation-tip";
      tip.innerHTML = '<span><strong>建议横屏交手</strong>两侧来敌更早看见，双手操作更舒展。竖屏也可完整游玩。</span><button data-action="dismiss-orientation" aria-label="关闭横屏建议">知道了</button>';
      shell.prepend(tip);
    }
    const playing = ["play", "training", "bossIntro"].includes(mode);
    this.hud.classList.toggle("visible", playing);
    this.syncTouchControls();
    if (this.screenMode !== mode) return;
    if (!playing) {
      this.hud.innerHTML = "";
      this.hudMode = "";
    } else {
      this.renderHud(true);
    }
    this.screen.setAttribute("aria-label", this.screenLabel(mode));
  }

  screenLabel(mode) {
    return ({
      menu: "主菜单", character: "角色选择", intro: "关卡介绍", pause: "暂停菜单", settings: "设置",
      levels: "关卡选择", records: "街坊手记", result: "关卡结算", defeat: "失败结算", victory: "胜利结局",
      training: "训练场", "training-ready": "训练场说明", bossIntro: "头目登场"
    })[mode] || "游戏界面";
  }

  viewFor(mode) {
    if (mode === "menu") return this.menuView();
    if (mode === "character") return this.characterView();
    if (mode === "intro") return this.introView();
    if (mode === "pause") return this.pauseView();
    if (mode === "settings") return this.settingsView();
    if (mode === "levels") return this.levelsView();
    if (mode === "records") return this.recordsView();
    if (mode === "result") return this.resultView();
    if (mode === "defeat") return this.defeatView();
    if (mode === "victory") return this.victoryView();
    if (mode === "training") return "";
    if (mode === "training-ready") return this.trainingView();
    if (mode === "bossIntro") return this.bossIntroView();
    return "";
  }

  menuView() {
    const save = this.game.save;
    const input = this.game.input;
    const hasProgress = save.completed.length > 0 && save.completed.length < 5;
    const completed = save.completed.length;
    const progressCopy = completed === 5 ? "五段街巷已走完 · 可重开更高难度" : completed ? "已守住 " + completed + " 段街巷 · 继续未完的路" : "守住一间扎根老街的社区武馆";
    let buttons = "";
    if (hasProgress) buttons += menuButton("continue-story", "继续旅程", "续", "第 " + String(completed + 1).padStart(2, "0") + " 关", true);
    buttons += menuButton("new-story", completed === 5 ? "重新开篇" : "开始守馆", hasProgress ? "01" : "起", "五段完整主线", !hasProgress);
    buttons += menuButton("levels", "重走街巷", "02", "已开放 " + Math.max(1, save.unlockedLevel + 1) + " 段");
    buttons += menuButton("training-select", "练功房", "03", "试招与连段");
    buttons += menuButton("records", "街坊手记", "04", "奖励 · 记录 · 操作");
    buttons += menuButton("settings", "设置", "05", "画面 · 声音 · 按键");
    return '<div class="screen-shade"></div><section class="menu-shell">' +
      '<div class="eyebrow brand-eyebrow"><img src="/brand-mark.svg" alt="" aria-hidden="true"><span>单人横版格斗　·　五段街巷</span></div><h1 class="game-title">巷战回<span class="title-mark">声</span></h1>' +
      '<p class="tagline">拳过旧巷，回声犹在。</p><p class="menu-copy">' + progressCopy + '。人情、拳脚和一盏没有熄灭的灯，都得有人守着。</p>' +
      '<nav class="menu-stack">' + buttons + '</nav>' +
      '<p class="menu-foot">' + esc(input.label("up")) + esc(input.label("left")) + esc(input.label("down")) + esc(input.label("right")) + ' / 方向键移动　·　' + esc(input.label("light")) + ' 轻击　' + esc(input.label("heavy")) + ' 重击　' + esc(input.label("jump")) + ' 跳跃　' + esc(input.label("dodge")) + ' 翻滚<br>每一拳都有回声。关卡进度与设置保存在本机浏览器。</p></section>' +
      '<div class="corner-seal" aria-hidden="true">守</div>';
  }

  characterView() {
    const game = this.game;
    const training = game.launchIntent === "training";
    const unlocked = training ? FIGHTERS.map((fighter) => fighter.id) : game.save.unlockedFighters;
    const selectedId = game.selectedFighter || game.save.selectedFighter || "lin";
    const cards = FIGHTERS.map((fighter) => {
      const open = unlocked.includes(fighter.id);
      const selected = selectedId === fighter.id;
      const stats = ["拳脚", "韧性", "身法"];
      return '<button class="fighter-card ' + (selected ? "selected " : "") + (!open ? "locked" : "") + '" data-action="select-fighter" data-fighter="' + fighter.id + '" aria-pressed="' + selected + '">' +
        '<span class="fighter-glyph" style="color:' + fighter.trim + ';border-color:' + fighter.trim + '">' + fighter.glyph + '</span>' +
        '<span class="fighter-name">' + fighter.name + '</span><span class="fighter-role">' + fighter.role + '</span>' +
        '<span class="fighter-desc">' + (open ? fighter.description : "通关老街巷后加入。练功房可先行试招。") + '</span>' +
        stats.map((name, index) => '<span class="stat-line"><span>' + name + '</span><span class="stat-track"><span class="stat-fill" style="width:' + fighter.stats[index] + '%"></span></span></span>').join("") +
        '</button>';
    }).join("");
    const difficulties = DIFFICULTIES.map((difficulty) => '<button class="choice-button ' + (game.selectedDifficulty === difficulty.id ? "selected" : "") + '" data-action="select-difficulty" data-difficulty="' + difficulty.id + '" aria-pressed="' + (game.selectedDifficulty === difficulty.id) + '">' + difficulty.name + '</button>').join("");
    const variantUnlocked = game.save.unlockedVariants.includes("echo");
    const variant = variantUnlocked ? '<button class="choice-button ' + (game.variantOn ? "selected" : "") + '" data-action="toggle-variant" aria-pressed="' + game.variantOn + '">回声变招 · ' + (game.variantOn ? "已启用" : "可选") + '</button>' :
      '<span class="overlay-note">完成夜市街区，解锁回声变招</span>';
    const startLabel = training ? "进入练功房" : "从第 " + (game.startStageIndex + 1) + " 关出发";
    return '<div class="center-shade"></div><section class="center-shell">' +
      '<div class="eyebrow">' + (training ? "练功房 · 三种身手都可试用" : "守馆人 · 选择你的打法") + '</div>' +
      '<h2 class="section-title">选一个趁手的拳路</h2><p class="section-subtitle">' +
      (training ? "训练场解锁全部角色，无伤害压力，可自由试招。选好后即刻开始。" : "主线会按顺序推进；倒下可以重来。练功房随时开放全部三位角色。") + '</p>' +
      '<div class="card-row">' + cards + '</div>' +
      '<div class="difficulty-row">' + difficulties + '</div><p class="overlay-note">' +
      (DIFFICULTIES.find((d) => d.id === game.selectedDifficulty)?.note || "") + "　" + variant + '</p>' +
      controlsMarkup(game.input, true) +
      '<div class="button-row">' + actionButton("back-menu", "返回") + actionButton(training ? "launch-training" : "launch-story", startLabel, true) + '</div></section>';
  }

  introView() {
    const level = this.game.currentLevel;
    const lesson = this.game.pendingTutorial;
    const input = this.game.input;
    const key = (action) => esc(input.label(action));
    const lessonBlock = level.lesson ? '<div class="controls-box"><div><strong>' + key("light") + '</strong> 轻→重破防；轻→轻→重挑空　·　<strong>' + key("heavy") + '</strong> 趁重敌蓄力时打断</div><div><strong>' + key("dodge") + '</strong> 中段避伤，擦身后轻拳反击　·　<strong>' + key("jump") + '</strong> 起跳，空中按 ' + key("light") + ' 或 ' + key("heavy") + ' 追击</div><div><strong>' + key("special") + '</strong> 消耗 ' + (this.game.variantOn ? 40 : 35) + ' 能量放出绝招　·　<strong>' + key("finisher") + '</strong> 满 100 能量终结　·　<strong>' + key("interact") + '</strong> 拾取补给或短棍</div></div>' : "";
    return '<div class="center-shade"></div><section class="center-shell compact">' +
      '<div class="eyebrow">第 ' + String(level.id + 1).padStart(2, "0") + ' 关　/　五段街巷</div><h2 class="section-title">' + level.name + '</h2>' +
      '<p class="section-subtitle">' + level.subtitle + '</p><p class="story-beat">“' + level.intro + '”</p>' +
      '<div class="story-speaker">' + level.line + '</div>' + lessonBlock +
      '<p class="story-skip">' + (level.lesson ? "引导只在前两段战斗给出提示，也可以跳过。" : "三段固定战斗区域 · 最后一段头目战　·　有补给喘息时间") + '</p>' +
      '<div class="button-row">' + actionButton("back-menu", "返回主菜单") + actionButton("begin-stage", lesson ? "跳过引导，直接开打" : "走进街巷", true) +
      (lesson ? actionButton("begin-tutorial", "带着招式提示开始") : "") + '</div></section>';
  }

  pauseView() {
    const training = this.game.modeBeforePause === "training";
    return '<div class="center-shade"></div><section class="center-shell compact">' +
      '<div class="eyebrow">停一停 · 街巷仍在这里</div><h2 class="section-title">暂停</h2>' +
      '<p class="section-subtitle">' + (training ? "练功场不会计时，也不会记录受伤。" : "目前进度会在关卡结算时写入本机存档。") + '</p>' +
      controlsMarkup(this.game.input, false) +
      '<div class="button-row">' + actionButton("resume", "继续", true) +
      (training ? actionButton("reset-training", "重置练功") : actionButton("restart-stage", "重来本关")) +
      actionButton("settings", "设置") + actionButton("back-menu", "回主菜单") + '</div></section>';
  }

  settingsView() {
    const settings = this.game.save.settings;
    const range = (key, label, value, percent = true) => '<label class="setting-row"><span>' + label + '</span><input type="range" min="' + (key === "touchSensitivity" ? ".4" : "0") + '" max="' + (key === "touchSensitivity" ? "1.5" : "1") + '" step="0.01" value="' + value + '" data-setting="' + key + '" aria-label="' + label + '"><span class="setting-value" data-value-for="' + key + '">' + (percent ? Math.round(value * 100) + "%" : value.toFixed(2)) + '</span></label>';
    const toggle = (key, label, checked) => '<label class="setting-row"><span>' + label + '</span><span><input type="checkbox" data-setting="' + key + '" ' + (checked ? "checked" : "") + '> 开启</span><span class="setting-value">' + (checked ? "是" : "否") + '</span></label>';
    const quality = '<label class="setting-row"><span>画面质量</span><select data-setting="quality"><option value="high" ' + (settings.quality === "high" ? "selected" : "") + '>细腻</option><option value="medium" ' + (settings.quality === "medium" ? "selected" : "") + '>均衡</option><option value="low" ' + (settings.quality === "low" ? "selected" : "") + '>省电</option></select><span class="setting-value"></span></label>';
    const rows = [
      ['light', "轻攻击"], ['heavy', "重击"], ['jump', "跳跃"], ['dodge', "翻滚"],
      ['special', "绝招"], ['finisher', "终结技"], ['interact', "拾取"], ['throw', "掷出短棍"], ['pause', "暂停"]
    ].map((item) => '<div class="setting-row"><span>' + item[1] + '</span><button class="choice-button" data-action="rebind" data-bind="' + item[0] + '">' + this.game.input.label(item[0]) + ' · 改键</button><span class="setting-value"></span></div>').join("");
    const previous = this.game.previousUiMode;
    return '<div class="center-shade"></div><section class="center-shell">' +
      '<div class="eyebrow">依你顺手 · 立即保存</div><h2 class="section-title">设置</h2>' +
      '<div class="settings-grid">' + quality +
      range("effects", "特效强度", settings.effects, true) +
      toggle("shake", "镜头震动", settings.shake) + toggle("lowFlash", "降低闪屏", settings.lowFlash) +
      range("music", "音乐音量", settings.music) + range("sfx", "音效音量", settings.sfx) +
      range("touchSensitivity", "触控灵敏度", settings.touchSensitivity) +
      '<div class="setting-row"><span>按键设置</span><span class="setting-value">选中后按新键</span><span></span></div>' + rows + '</div>' +
      '<div class="controls-box"><div><strong>手柄布局</strong>　左摇杆移动 · A 轻拳 · X 重击 · Y 跳跃 · B 翻滚</div><div>LB 绝招 · RB 终结技 · Start 暂停。窗口失焦、打开菜单时会清空按住状态。</div></div>' +
      '<p class="overlay-note">重置本机存档会清除关卡解锁、角色解锁、变招、最佳成绩和当前设置；只影响这个浏览器中的《巷战回声》记录。</p>' +
      '<div class="button-row">' + actionButton("reset-save", "重置本机存档", false, "danger") + actionButton("settings-back", previous === "pause" ? "返回暂停" : "返回", true) + '</div>' +
      '<div class="modal-backdrop" id="rebind-modal" hidden><div class="modal"><h3>按下新键</h3><p>按任意键完成绑定，Esc 仍用于暂停，不能改成新按键。</p><div class="button-row">' + actionButton("cancel-rebind", "取消") + '</div></div></div>' +
      '</section>';
  }

  levelsView() {
    const rows = LEVELS.map((level) => {
      const open = level.id <= this.game.save.unlockedLevel || this.game.save.completed.includes(level.id);
      const record = this.game.save.records[String(level.id)];
      return '<div class="stage-item"><span class="stage-num">' + String(level.id + 1).padStart(2, "0") + '</span><span><span class="stage-name">' + level.name + '</span><br><span class="stage-lock">' + (open ? (level.subtitle + (record ? " · 最佳 " + record.grade + " / " + this.formatTime(record.time) : "")) : "通关上一段后开放") + '</span></span>' +
        '<button class="choice-button ' + (open ? "" : "locked-choice") + '" data-action="visit-stage" data-level="' + level.id + '">' + (open ? "重走" : "锁定") + '</button></div>';
    }).join("");
    return '<div class="center-shade"></div><section class="center-shell compact"><div class="eyebrow">五段街巷 · 依序推进</div><h2 class="section-title">重走街巷</h2>' +
      '<p class="section-subtitle">已开放的章节可以重打，成绩会与个人纪录比较。锁着的章节通关前一段后开放。</p><div class="stage-list">' + rows + '</div>' +
      '<div class="button-row">' + actionButton("back-menu", "返回主菜单", true) + '</div></section>';
  }

  recordsView() {
    const rows = LEVELS.map((level) => {
      const record = this.game.save.records[String(level.id)];
      return '<div class="stage-item"><span class="stage-num">' + String(level.id + 1).padStart(2, "0") + '</span><span><span class="stage-name">' + level.name + '</span><br><span class="stage-lock">' +
        (record ? record.grade + " 评价 · " + this.formatTime(record.time) + " · " + record.score.toLocaleString("zh-CN") + " 分 · " + (FIGHTERS.find((f) => f.id === record.fighter)?.name || "—") : "尚无通关记录") + '</span></span><span class="stage-lock">' +
        (this.game.save.completed.includes(level.id) ? "已守住" : "未通关") + '</span></div>';
    }).join("");
    const campaign = this.game.save.records.campaign;
    const reward = "街坊谢礼：" + this.game.save.coins + " 枚回声印";
    return '<div class="center-shade"></div><section class="center-shell compact"><div class="eyebrow">街坊手记 · 本机保存</div><h2 class="section-title">走过的每一拳</h2>' +
      '<p class="section-subtitle">' + reward + (campaign ? " · 总战绩 " + campaign.grade + " · " + this.formatTime(campaign.time) + " · " + campaign.score.toLocaleString("zh-CN") + " 分" : "") + '</p>' +
      '<div class="stage-list">' + rows + '</div><div class="controls-box"><div><strong>连段</strong>　轻击可以组成专属连拳；重击破防、击飞后跳起追击。</div><div><strong>资源</strong>　命中攒能量，35 点放绝招，100 点终结；姜茶回血，短棍限时使用。</div>' +
      '<div><strong>保存</strong>　关卡、设置、解锁和最佳成绩保存在当前浏览器，不依赖联网。</div></div>' +
      '<div class="button-row">' + actionButton("back-menu", "返回主菜单", true) + '</div></section>';
  }

  resultView() {
    const report = this.game.lastResult;
    const fighter = FIGHTERS.find((item) => item.id === report.fighter);
    const unlocks = report.unlocks.length ? "新加入：" + report.unlocks.join("、") + "。街坊谢礼已记入手记。" : "街坊谢礼已记入手记，最佳成绩已更新。";
    return '<div class="center-shade"></div><section class="center-shell compact"><div class="eyebrow">第 ' + String(report.level + 1).padStart(2, "0") + ' 关 · 已守住</div>' +
      '<h2 class="section-title">' + LEVELS[report.level].name + '　<span style="color:#e6b16c">' + report.grade + '</span></h2>' +
      '<p class="section-subtitle">' + fighter.name + ' · ' + unlocks + '</p>' +
      '<div class="result-grid"><div class="result-cell"><b>' + report.score.toLocaleString("zh-CN") + '</b><span>本关得分</span></div>' +
      '<div class="result-cell"><b>' + this.formatTime(report.time) + '</b><span>用时</span></div>' +
      '<div class="result-cell"><b>' + report.damageTaken + '</b><span>受伤</span></div>' +
      '<div class="result-cell"><b>' + report.bestCombo + '</b><span>最高连击</span></div></div>' +
      '<p class="overlay-note">命中 ' + report.hits + ' 次 · 拾取 ' + report.pickups + ' 件 · 奖励 ' + report.reward + ' 枚回声印</p>' +
      '<div class="button-row">' + actionButton("back-menu", "回主菜单") + actionButton("replay-stage", "重玩本关") + actionButton("continue-stage", "继续下一段", true) + '</div></section>';
  }

  defeatView() {
    const report = this.game.lastResult;
    return '<div class="center-shade"></div><section class="center-shell compact"><div class="eyebrow">倒在街口也能再站起来</div><h2 class="section-title">这一拳，算对方先到</h2>' +
      '<p class="section-subtitle">被击倒在' + LEVELS[this.game.levelIndex].name + '。本关进度未结算，药茶和短棍也会重新放好。</p>' +
      '<div class="result-grid"><div class="result-cell"><b>' + this.formatTime(report.time) + '</b><span>坚持时间</span></div><div class="result-cell"><b>' + report.hits + '</b><span>命中</span></div>' +
      '<div class="result-cell"><b>' + report.bestCombo + '</b><span>最高连击</span></div><div class="result-cell"><b>' + report.damageTaken + '</b><span>受伤</span></div></div>' +
      '<div class="controls-box"><div><strong>再试一次</strong>　注意橙色预警：普通蓄力可用重击打断；Boss 稳势招先避开，再抓收招。</div><div>被多人夹击时先挪动纵深车道；受击保护会持续一小段时间。</div></div>' +
      '<div class="button-row">' + actionButton("back-menu", "回主菜单") + actionButton("restart-stage", "重开本关", true) + '</div></section>';
  }

  victoryView() {
    const report = this.game.lastResult;
    const campaign = this.game.save.records.campaign;
    const summary = report ? '<div class="result-grid"><div class="result-cell"><b>' + report.score.toLocaleString("zh-CN") + '</b><span>最終一關</span></div><div class="result-cell"><b>' + this.formatTime(report.time) + '</b><span>決戰用時</span></div><div class="result-cell"><b>' + report.damageTaken + '</b><span>受傷</span></div><div class="result-cell"><b>' + report.bestCombo + '</b><span>最高連擊</span></div></div>' : "";
    return '<div class="screen-shade"></div><section class="menu-shell" style="width:min(700px,78vw)">' +
      '<div class="eyebrow">第五关 · 武馆决战 · 结局</div><h2 class="game-title" style="font-size:clamp(44px,7vw,80px)">灯还亮着</h2>' +
      '<p class="tagline">街坊们没有散场。</p><p class="ending-copy">清晨，巷口最后一台挖机撤出了老街。被揭下的封条铺成一串纸船，漂进街坊搬来的那盆姜茶里。武馆的木门补好了，夜市重新摆起摊子；楼上亮着一排灯，大家都知道彼此回到了家。<span class="final-line">守住的从来不只一扇门。</span></p>' +
      summary + '<p class="menu-foot">五段主线已完成 · ' + (campaign ? "总评价 " + campaign.grade + " · " + this.formatTime(campaign.time) + " · " + campaign.score.toLocaleString("zh-CN") + " 分" : "全部章节已通关") + '。更高难度与全角色已开放。</p>' +
      '<nav class="menu-stack">' + menuButton("replay-campaign", "再走一回", "新", "选择更高难度", true) + menuButton("training-select", "去练功房", "练", "自由试招") + menuButton("records", "查看街坊手记", "记", "成绩与解锁") + menuButton("menu", "回到主菜单", "回", "旅程留在本机") + '</nav>' +
      '<div class="corner-seal" aria-hidden="true">安</div></section>';
  }

  trainingView() {
    return '<div class="center-shade"></div><section class="center-shell compact"><div class="eyebrow">练功房 · 无伤害 · 无计时</div>' +
      '<h2 class="section-title">把拳路练熟</h2><p class="section-subtitle">靶人会持续站起，可自由尝试起手、追击、翻滚、绝招与终结技。练功不影响主线记录。</p>' +
      controlsMarkup(this.game.input, false) +
      '<div class="training-drills" aria-label="练习项目">' + [["combo","连招与追击"],["counter","翻滚反击"],["boss","Boss 失衡"]].map(([id,name])=>'<button class="choice-button" data-action="training-drill" data-drill="'+id+'" aria-pressed="'+((this.game.trainingDrill||"combo")===id)+'">'+name+'</button>').join('')+'</div>' +
      '<div class="button-row">' + actionButton("training-restart", "重置练功房") + actionButton("settings", "设置") + actionButton("back-menu", "返回主菜单") + actionButton("resume", "开始练习", true) + '</div></section>';
  }

  bossIntroView() {
    const boss = this.game.currentLevel.boss;
    return '<section class="boss-arrival-banner"><div><div class="eyebrow">头目入场</div>' +
      '<h2>' + esc(boss.name) + '</h2><p>' + esc(boss.title) + ' · 看清起手，闪开再反击。</p></div>' +
      actionButton("boss-now", "准备交手", true) + '</section>';
  }

  formatTime(seconds = 0) {
    const total = Math.max(0, Math.floor(seconds));
    return String(Math.floor(total / 60)).padStart(2, "0") + ":" + String(total % 60).padStart(2, "0");
  }

  renderHud(force = false) {
    const g = this.game;
    if (!["play", "training", "bossIntro"].includes(g.mode)) return;
    if (!force && this.hudMode !== g.mode) force = true;
    if (force) {
      this.hudMode = g.mode;
      this.hud.innerHTML = '<div class="hud-top"><div class="hud-player"><div class="hud-portrait" data-hud="portrait">守</div><div>' +
        '<div class="hud-name"><span data-hud="name">林岚</span><span class="hud-role" data-hud="role">守馆人</span></div>' +
        '<div class="bar-track" aria-label="生命"><div class="bar-fill health" data-hud="health" style="width:100%"></div></div></div></div>' +
        '<div class="hud-player"><div class="hud-portrait" style="font-size:17px">氣</div><div><div class="hud-name">气劲<span class="hud-role" data-hud="energy-text">0 / 100</span></div>' +
        '<div class="bar-track" aria-label="能量"><div class="bar-fill energy" data-hud="energy" style="width:0%"></div></div></div></div>' +
        '<div class="hud-objective"><div class="hud-level" data-hud="level"></div><div class="hud-target" data-hud="target"></div></div>' +
        '<button class="hud-pause" data-action="pause" aria-label="暂停">Ⅱ</button></div>' +
        '<div class="hud-boss" data-hud="boss"><div class="hud-boss-name"><span data-hud="boss-name"></span><span data-hud="boss-phase"></span></div>' +
        '<div class="bar-track" aria-label="头目生命"><div class="bar-fill boss" data-hud="boss-health"></div></div>' +
        '<div class="boss-poise-copy" data-hud="boss-status"></div><div class="poise-track" aria-label="头目失衡积累"><div data-hud="boss-poise"></div></div></div>' +
        '<div class="hud-bottom"><div class="hud-pickup-copy"><div class="hud-meters" data-hud="pickup"></div></div>' +
        '<div class="hud-combo" data-hud="combo"></div></div>' +
        '<div class="hud-hint" data-hud="hint"></div>' +
        '<div class="entry-cue left" data-hud="entry-left" hidden>← 左侧来敌</div>' +
        '<div class="entry-cue right" data-hud="entry-right" hidden>右侧来敌 →</div>';
    }
    const player = g.player;
    if (!player) return;
    const role = FIGHTERS.find((fighter) => fighter.id === player.fighterId);
    this.setText("name", player.name);
    this.setText("role", role?.call || "练功守人");
    this.setText("portrait", role?.glyph || "守");
    this.setWidth("health", 100 * Math.max(0, player.health / player.maxHealth));
    this.setWidth("energy", player.energy);
    this.setText("energy-text", Math.round(player.energy) + " / 100");
      this.setText("level", "第 " + String(g.levelIndex + 1).padStart(2, "0") + " 关　·　" + (g.mode === "training" ? "练功房" : g.currentLevel.name));
    const boss = g.enemies.find((enemy) => enemy.boss && enemy.health > 0);
    const pending = g.enemyEntryQueue || [];
    const arriving = g.enemies.filter((enemy) => enemy.entry && enemy.health > 0);
    const remaining = g.enemies.filter((enemy) => enemy.health > 0 && !enemy.trainingDummy).length + pending.length;
    const drillGoal = g.trainingDrill === "counter" ? "落地轻拳反击 " + Math.min(3,player.counterHits||0) + "/3" : g.trainingDrill === "boss" ? "击破失衡 " + Math.min(2,player.bossBreaks||0) + "/2" : "破防 " + Math.min(1,player.branches?.break||0) + "/1 · 挑空 " + Math.min(1,player.branches?.launcher||0) + "/1 · 空中追击 " + Math.min(1,player.airHits||0) + "/1";
    const drillDone = g.trainingDrill === "counter" ? player.counterHits >= 3 : g.trainingDrill === "boss" ? player.bossBreaks >= 2 : player.branches?.break > 0 && player.branches?.launcher > 0 && player.airHits > 0;
    const objective = g.mode === "training" ? (drillDone ? "已练成 · 可继续自由交手" : drillGoal) :
      g.mode === "bossIntro" ? "头目正在入场　·　站稳后交手" :
      boss ? (boss.staggerT > 0 ? "头目失衡　·　重击或绝招追击" : boss.state === "recover" && !boss.move?.followUp ? "收招破绽　·　现在进攻" : boss.move?.name || "头目战　·　观察起手") :
      g.waveIndex < 3 ? "清理街口　" + (g.waveIndex + 1) + " / 3　·　余敌 " + remaining + (pending.length || arriving.length ? " · 入场中" : remaining === 0 ? " · 稍作喘息" : "") :
      "巷口已清　·　" + (boss ? "头目战" : "准备交手");
    this.setText("target", objective);
    for (const [name, side] of [["left", -1], ["right", 1]]) {
      const cue = this.hud.querySelector('[data-hud="entry-' + name + '"]');
      if (cue) cue.hidden = g.mode === "training" || !pending.some((ticket) => ticket.side === side && ticket.delay < 1.2) && !arriving.some((enemy) => enemy.entry.side === side);
    }
    const bossHud = this.hud.querySelector('[data-hud="boss"]');
    bossHud?.classList.toggle("visible", Boolean(boss));
    if (boss) {
      this.setText("boss-name", boss.name);
      this.setText("boss-phase", boss.phases > 1 ? "　式 " + boss.phase + " / " + boss.phases : "");
      this.setWidth("boss-health", Math.max(0, 100 * boss.health / boss.maxHealth));
      this.setWidth("boss-poise", 100*(boss.poise||0)/(boss.poiseMax||70));
      this.setText("boss-status", boss.staggerT > 0 ? "失衡 · 反击窗口" : boss.move?.armor && ["windup","strike"].includes(boss.state) ? "稳势出招 · 重击积累失衡" : "失衡积累 " + Math.floor(boss.poise||0) + " / " + (boss.poiseMax||70));
    }
    const combo = this.hud.querySelector('[data-hud="combo"]');
    if (combo) {
      combo.textContent = player.counterReady > 0 ? "轻拳反击" : player.comboCount >= 2 ? "连击 × " + player.comboCount : "";
      combo.classList.toggle("visible", player.counterReady > 0 || player.comboCount >= 2 && g.comboTimer > 0);
    }
    this.setText("pickup", (player.weapon ? "短棍 " + player.weapon.hits + "次 · " + Math.ceil(player.weapon.time) + "秒 · " + g.input.label("throw") + "掷出" : "拾取 " + player.pickups) + (g.nearbyDrop ? "　·　" + g.input.label("interact") + " " + g.nearbyDrop.name : ""));
    const gamepad = g.input.lastDevice === "gamepad";
    this.setText("hint", gamepad ? "左摇杆移动　A轻拳　X重击　B翻滚　Y跳跃\nLB绝招　RB终结　Start暂停" :
      this.touchPreference || Boolean(this.touchLayoutMedia?.matches) ? "左侧摇杆移动　·　右侧按键攻击\n触碰Ⅱ暂停" :
      g.input.label("light") + "轻拳　" + g.input.label("heavy") + "重击　" + g.input.label("jump") + "跳跃　" + g.input.label("dodge") + "翻滚\n" +
      g.input.label("special") + "绝招　" + g.input.label("finisher") + "终结　" + g.input.label("interact") + "拾取　" + g.input.label("throw") + "掷棍　" + g.input.label("pause") + "暂停");
    const finisher = this.touch.querySelector('[data-action="finisher"]');
    const special = this.touch.querySelector('[data-action="special"]');
    if (finisher) finisher.disabled = player.energy < 100 && g.mode !== "training";
    if (special) special.disabled = player.energy < (g.variantOn ? 40 : 35) && g.mode !== "training";
    const light = this.touch.querySelector('[data-action="light"]'), heavy = this.touch.querySelector('[data-action="heavy"]');
    if (light) light.textContent = player.counterReady > 0 ? "反击" : "轻拳";
    if (heavy) heavy.textContent = player.chainUntil > g.gameTime && player.chainCount > 0 ? (player.chainCount >= 2 ? "挑空" : "破防") : "重击";
  }

  setText(key, value) {
    const node = this.hud.querySelector('[data-hud="' + key + '"]');
    if (node) node.textContent = value;
  }

  setWidth(key, percent) {
    const node = this.hud.querySelector('[data-hud="' + key + '"]');
    if (node) node.style.width = Math.max(0, Math.min(100, percent)) + "%";
  }

  toast(text, duration = 1900) {
    this.toastEl.textContent = text;
    this.toastEl.classList.add("visible");
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toastEl.classList.remove("visible"), duration);
  }

  handleClick(event) {
    if (event.target.closest('[data-action="dismiss-orientation"]')) {
      this.orientationTipDismissed = true; event.target.closest(".orientation-tip")?.remove(); return;
    }
    const target = event.target.closest("[data-action]");
    if (!target) return;
    const action = target.dataset.action;
    if (action === "rebind") {
      const modal = document.getElementById("rebind-modal");
      if (modal) modal.hidden = false;
      target.textContent = "等待新键…";
      const binding = target.dataset.bind;
      this.game.input.startRebind(binding, (name, key) => {
        if (modal) modal.hidden = true;
        const row = this.screen.querySelector('[data-bind="' + name + '"]');
        if (row) row.textContent = this.game.input.label(name) + " · 改键";
        this.game.persist();
        this.toast("按键已设为 " + this.game.input.label(name));
      });
      return;
    }
    if (action === "cancel-rebind") {
      this.game.input.clear();
      const modal = document.getElementById("rebind-modal");
      if (modal) modal.hidden = true;
      this.render(this.screenMode);
      return;
    }
    this.game.handleUI(action, target.dataset);
  }

  handleChange(event) {
    const control = event.target;
    if (!control.dataset.setting) return;
    const key = control.dataset.setting;
    let value = control.type === "checkbox" ? control.checked : control.value;
    if (control.type === "range") value = Number(value);
    this.game.changeSetting(key, value);
    if (control.type === "checkbox") this.render(this.screenMode);
  }

  handleInput(event) {
    const control = event.target;
    if (!control.dataset.setting) return;
    const key = control.dataset.setting;
    if (control.type === "range") {
      const label = this.screen.querySelector('[data-value-for="' + key + '"]');
      if (label) label.textContent = Math.round(Number(control.value) * 100) + "%";
      this.game.changeSetting(key, Number(control.value), false);
    }
  }

  showSaveReset() {
    const modal = document.createElement("div");
    modal.className = "modal-backdrop";
    modal.id = "save-reset-modal";
    modal.innerHTML = '<section class="modal" role="dialog" aria-modal="true" aria-labelledby="reset-heading">' +
      '<h3 id="reset-heading">重置本机存档？</h3><p>这会清除《巷战回声》在当前浏览器里的关卡进度、已解锁角色与变招、最佳成绩和设置，然后返回主菜单。只影响这款游戏的本地记录。</p>' +
      '<div class="button-row">' + actionButton("cancel-reset", "保留存档") + actionButton("clear-save-confirm", "清除并重新开篇", false, "danger") + '</div></section>';
    this.screen.appendChild(modal);
  }
}
