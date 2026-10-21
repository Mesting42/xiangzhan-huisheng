const DEFAULT_BINDS = {
  up: ["w", "arrowup"], down: ["s", "arrowdown"], left: ["a", "arrowleft"], right: ["d", "arrowright"],
  light: ["j"], heavy: ["k"], jump: [" "], dodge: ["l"], special: ["u"], finisher: ["i"], interact: ["e"], throw: ["g"], pause: ["escape"]
};
const PREVENT = new Set(["arrowup", "arrowdown", "arrowleft", "arrowright", " ", "escape"]);
const GAMEPAD = { light: 0, heavy: 2, jump: 3, dodge: 1, special: 4, finisher: 5, interact: 2, pause: 9 };

function keyName(key) {
  if (key === " ") return " ";
  return String(key).toLowerCase();
}

export class Input {
  constructor(root, saved = {}) {
    this.root = root;
    this.binds = { ...DEFAULT_BINDS };
    for (const [action, keys] of Object.entries(saved || {})) {
      if (DEFAULT_BINDS[action] && Array.isArray(keys) && keys.length) this.binds[action] = keys.map(keyName);
    }
    this.down = new Set();
    this.edges = new Set();
    this.touchDown = new Set();
    this.touchPointers = new Map();
    this.stickPointer = null;
    this.touchMove = { x: 0, z: 0 };
    this.sensitivity = 1;
    this.waiting = null;
    this.lastDevice = "keyboard";
    this.onKeyDown = this.onKeyDown.bind(this);
    this.onKeyUp = this.onKeyUp.bind(this);
    this.clear = this.clear.bind(this);
    window.addEventListener("keydown", this.onKeyDown, { passive: false });
    window.addEventListener("keyup", this.onKeyUp, { passive: true });
    window.addEventListener("blur", this.clear);
    document.addEventListener("visibilitychange", () => { if (document.hidden) this.clear(); });
    this.bindTouch();
  }

  onKeyDown(event) {
    const key = keyName(event.key);
    if (key !== "escape" && !this.waiting && event.target?.closest?.("input,select,textarea,button,a,summary") && !this.root.classList?.contains("is-playing")) return;
    if (PREVENT.has(key)) event.preventDefault();
    if (this.waiting && !event.repeat && key !== "escape") {
      const action = this.waiting;
      this.waiting = null;
      this.setBind(action, key);
      this.rebindDone?.(action, key);
      return;
    }
    if (event.repeat) return;
    this.lastDevice = "keyboard";
    if (!this.down.has(key)) this.edges.add(key);
    this.down.add(key);
  }

  onKeyUp(event) {
    this.down.delete(keyName(event.key));
  }

  clear() {
    this.down.clear();
    this.edges.clear();
    this.touchDown.clear();
    this.touchPointers.clear();
    this.stickPointer = null;
    this.touchRead = new Set();
    this.touchMove.x = 0;
    this.touchMove.z = 0;
    this.waiting = null;
    const knob = document.getElementById("stick-knob");
    if (knob) knob.style.transform = "translate(-50%, -50%)";
  }

  setBind(action, key) {
    const normalized = keyName(key);
    for (const name of Object.keys(this.binds)) this.binds[name] = this.binds[name].filter((item) => item !== normalized);
    this.binds[action] = action === "pause" && normalized !== "escape" ? [normalized, "escape"] : [normalized];
    this.clear();
  }

  startRebind(action, done) {
    this.waiting = action;
    this.rebindDone = done;
  }

  isDown(action) {
    if (this.touchDown.has(action)) return true;
    const keys = this.binds[action] || [];
    for (const key of keys) if (this.down.has(key)) return true;
    return false;
  }

  wasPressed(action, padPressed) {
    if (this.touchDown.has(action) && !this.touchRead?.has(action)) return true;
    const keys = this.binds[action] || [];
    for (const key of keys) if (this.edges.has(key)) return true;
    return Boolean(padPressed?.[action]);
  }

  bindTouch() {
    const stick = document.querySelector(".stick-wrap");
    const base = document.querySelector(".stick-base");
    const knob = document.getElementById("stick-knob");
    if (base) {
      base.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        if (this.stickPointer !== null) return;
        this.stickPointer = event.pointerId;
        this.lastDevice = "touch";
        base.setPointerCapture(event.pointerId);
        this.updateStick(event, base, knob);
      });
      base.addEventListener("pointermove", (event) => {
        if (event.pointerId === this.stickPointer) this.updateStick(event, base, knob);
      });
      const release = (event) => {
        if (event.pointerId !== this.stickPointer) return;
        this.stickPointer = null; this.touchMove.x = 0; this.touchMove.z = 0;
        if (knob) knob.style.transform = "translate(-50%, -50%)";
      };
      base.addEventListener("pointerup", release);
      base.addEventListener("pointercancel", release);
      base.addEventListener("lostpointercapture", release);
    }
    if (stick) stick.addEventListener("contextmenu", (event) => event.preventDefault());
    for (const button of document.querySelectorAll(".touch-button")) {
      this.bindTouchButton(button);
    }
  }

  bindTouchButton(button) {
      const action = button.dataset.action;
      button.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        this.lastDevice = "touch";
        button.setPointerCapture(event.pointerId);
        this.touchPointers.set(event.pointerId, action);
        if (!this.touchDown.has(action)) this.edges.add("touch:" + action);
        this.touchDown.add(action);
      });
      const release = (event) => {
        event?.preventDefault(); this.touchPointers.delete(event.pointerId);
        if (![...this.touchPointers.values()].includes(action)) this.touchDown.delete(action);
      };
      button.addEventListener("pointerup", release);
      button.addEventListener("pointercancel", release);
      button.addEventListener("lostpointercapture", release);
      button.addEventListener("contextmenu", (event) => event.preventDefault());
  }

  updateStick(event, base, knob) {
    const box = base.getBoundingClientRect();
    const max = box.width * .33;
    const dx = event.clientX - (box.left + box.width / 2);
    const dy = event.clientY - (box.top + box.height / 2);
    const distance = Math.max(1, Math.hypot(dx, dy));
    const scale = Math.min(1, max / distance);
    const x = dx * scale / max;
    const y = dy * scale / max;
    this.touchMove.x = Math.abs(x) < .2 ? 0 : x * this.sensitivity;
    this.touchMove.z = Math.abs(y) < .2 ? 0 : y * this.sensitivity;
    if (knob) knob.style.transform = "translate(calc(-50% + " + (dx * scale) + "px), calc(-50% + " + (dy * scale) + "px))";
  }

  sample() {
    const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
    const pad = Array.from(gamepads).find(Boolean);
    const padPressed = {};
    let padX = 0, padZ = 0;
    if (pad) {
      const ax = pad.axes[0] || 0;
      const az = pad.axes[1] || 0;
      padX = Math.abs(ax) > .18 ? ax : ((pad.buttons[15]?.pressed ? 1 : 0) - (pad.buttons[14]?.pressed ? 1 : 0));
      padZ = Math.abs(az) > .18 ? az : ((pad.buttons[13]?.pressed ? 1 : 0) - (pad.buttons[12]?.pressed ? 1 : 0));
      for (const [action, index] of Object.entries(GAMEPAD)) {
        const pressed = Boolean(pad.buttons[index]?.pressed);
        padPressed[action] = pressed && !this.padWas?.[action];
        if (pressed) this.lastDevice = "gamepad";
      }
      this.padWas = Object.fromEntries(Object.entries(GAMEPAD).map(([action, index]) => [action, Boolean(pad.buttons[index]?.pressed)]));
    } else {
      this.padWas = {};
    }
    const moveX = Math.max(-1, Math.min(1, Number(this.isDown("right")) - Number(this.isDown("left")) + this.touchMove.x + padX));
    const moveZ = Math.max(-1, Math.min(1, Number(this.isDown("down")) - Number(this.isDown("up")) + this.touchMove.z + padZ));
    const pressed = {};
    for (const action of ["light", "heavy", "jump", "dodge", "special", "finisher", "interact", "throw", "pause"]) {
      pressed[action] = this.edges.has("touch:" + action) || this.wasPressed(action, padPressed);
    }
    this.edges.clear();
    this.touchRead = new Set(this.touchDown);
    return { moveX, moveZ, held: Object.fromEntries(["light", "heavy", "jump", "dodge", "special", "finisher", "interact", "throw"].map((action) => [action, this.isDown(action)])), pressed, device: this.lastDevice };
  }

  label(action) {
    const labels = { up: "W / ↑", down: "S / ↓", left: "A / ←", right: "D / →", light: "J", heavy: "K", jump: "空格", dodge: "L", special: "U", finisher: "I", interact: "E", throw: "G", pause: "Esc" };
    const key = this.binds[action]?.[0];
    if (!key || key === " ") return labels[action] || "—";
    const friendly = { escape: "Esc", arrowup: "↑", arrowdown: "↓", arrowleft: "←", arrowright: "→", shift: "Shift" };
    return friendly[key] || key.toUpperCase();
  }
}

export const DEFAULT_KEYBINDS = DEFAULT_BINDS;
