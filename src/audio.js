const MUSIC = [
  [110, 164.81, 220, 146.83, 196],
  [98, 146.83, 196, 130.81, 174.61],
  [82.41, 123.47, 164.81, 110, 146.83],
  [92.5, 138.59, 185, 123.47, 164.81],
  [73.42, 110, 146.83, 98, 130.81]
];

export class AudioEngine {
  constructor(settings) {
    this.musicVolume = settings.music ?? .42;
    this.sfxVolume = settings.sfx ?? .72;
    this.context = null;
    this.musicTimer = 0;
    this.musicStep = 0;
    this.levelIndex = 0;
    this.boss = false;
    this.musicMaster = null;
    this.sfxMaster = null;
  }

  unlock() {
    if (this.context) {
      if (this.context.state === "suspended") this.context.resume().catch(() => {});
      return;
    }
    try {
      const Context = window.AudioContext || window.webkitAudioContext;
      if (!Context) return;
      this.context = new Context();
      this.musicMaster = this.context.createGain();
      this.sfxMaster = this.context.createGain();
      this.musicMaster.connect(this.context.destination);
      this.sfxMaster.connect(this.context.destination);
      this.applyVolumes();
      this.startMusic(this.levelIndex, this.boss);
    } catch {
      this.context = null;
    }
  }

  applyVolumes() {
    if (!this.context) return;
    const now = this.context.currentTime;
    this.musicMaster.gain.setTargetAtTime(this.musicVolume, now, .08);
    this.sfxMaster.gain.setTargetAtTime(this.sfxVolume, now, .035);
  }

  setVolumes(music, sfx) {
    this.musicVolume = Math.max(0, Math.min(1, music));
    this.sfxVolume = Math.max(0, Math.min(1, sfx));
    this.applyVolumes();
  }

  note(frequency, duration, type, volume, destination, detune = 0) {
    if (!this.context) return;
    const now = this.context.currentTime;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);
    oscillator.detune.setValueAtTime(detune, now);
    gain.gain.setValueAtTime(.0001, now);
    gain.gain.exponentialRampToValueAtTime(Math.max(.0002, volume), now + .016);
    gain.gain.exponentialRampToValueAtTime(.0001, now + duration);
    oscillator.connect(gain);
    gain.connect(destination);
    oscillator.start(now);
    oscillator.stop(now + duration + .035);
  }

  sound(name) {
    this.unlock();
    if (!this.context || this.sfxVolume === 0) return;
    const n = {
      light: [300, .11, "triangle", .13], heavy: [128, .22, "sawtooth", .2], hit: [94, .14, "triangle", .24],
      guard: [410, .09, "square", .09], dodge: [520, .12, "sine", .11], jump: [260, .12, "triangle", .09],
      special: [218, .42, "sawtooth", .22], finisher: [82, .62, "triangle", .27], telegraph: [180, .24, "sine", .13],
      break: [145, .24, "square", .13], pickup: [660, .21, "sine", .12], win: [523.25, .7, "triangle", .2],
      lose: [138.59, .62, "sine", .17], bell: [784, .48, "sine", .14], step: [67, .055, "triangle", .035]
    }[name];
    if (!n) return;
    this.note(n[0], n[1], n[2], n[3], this.sfxMaster);
    if (name === "heavy" || name === "hit" || name === "special" || name === "finisher") {
      this.note(n[0] * 1.47, n[1] * .55, "triangle", n[3] * .38, this.sfxMaster, -7);
    }
  }

  startMusic(levelIndex = 0, boss = false) {
    this.levelIndex = levelIndex;
    this.boss = boss;
    if (!this.context) return;
    clearInterval(this.musicTimer);
    this.musicStep = 0;
    const pattern = MUSIC[levelIndex % MUSIC.length];
    const beat = () => {
      if (!this.context || this.musicVolume === 0) return;
      const step = this.musicStep++;
      const base = pattern[step % pattern.length] * (boss ? .82 : 1);
      const type = boss ? "sawtooth" : "triangle";
      const bed = boss ? .035 : .024;
      this.note(base, boss ? .46 : .62, type, bed, this.musicMaster);
      if (step % 4 === 0) this.note(base * 1.5, .25, "sine", boss ? .025 : .032, this.musicMaster, 3);
      if (step % 2 === 1 && !boss) this.note(base * 2, .12, "sine", .016, this.musicMaster);
      if (boss && step % 2 === 0) this.note(54, .1, "triangle", .04, this.musicMaster);
    };
    beat();
    this.musicTimer = setInterval(beat, boss ? 390 : 540);
  }

  stopMusic() {
    clearInterval(this.musicTimer);
  }
}
