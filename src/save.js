export const SAVE_KEY = "xiangzhan-huisheng-save-v1";
export const DEFAULT_SETTINGS = {
  quality: "high", effects: 1, shake: true, lowFlash: true, music: .42, sfx: .72,
  touchSensitivity: 1, keybinds: null
};

export function freshSave() {
  return {
    version: 1,
    unlockedLevel: 0,
    unlockedFighters: ["lin"],
    unlockedVariants: [],
    unlockedLooks: [],
    difficulty: "standard",
    selectedFighter: "lin",
    completed: [],
    coins: 0,
    records: {},
    settings: { ...DEFAULT_SETTINGS }
  };
}

function isSaveShape(value) {
  return value && value.version === 1 && Number.isInteger(value.unlockedLevel) &&
    Array.isArray(value.unlockedFighters) && value.settings && typeof value.settings === "object";
}

export function loadSave(storage = window.localStorage) {
  try {
    const raw = storage.getItem(SAVE_KEY);
    if (!raw) return { save: freshSave(), damaged: false };
    const parsed = JSON.parse(raw);
    if (!isSaveShape(parsed)) return { save: freshSave(), damaged: true };
    const defaults = freshSave();
    const save = { ...defaults, ...parsed, settings: { ...DEFAULT_SETTINGS, ...parsed.settings } };
    save.unlockedLevel = Math.max(0, Math.min(4, save.unlockedLevel));
    save.unlockedFighters = [...new Set(["lin", ...save.unlockedFighters])].filter((id) => ["lin", "qiao", "tie"].includes(id));
    save.completed = Array.isArray(save.completed) ? save.completed.filter((id) => Number.isInteger(id) && id >= 0 && id < 5) : [];
    save.records = save.records && typeof save.records === "object" ? save.records : {};
    save.unlockedVariants = Array.isArray(save.unlockedVariants) ? save.unlockedVariants : [];
    save.unlockedLooks = Array.isArray(save.unlockedLooks) ? save.unlockedLooks : [];
    return { save, damaged: false };
  } catch {
    return { save: freshSave(), damaged: true };
  }
}

export function writeSave(save, storage = window.localStorage) {
  try {
    storage.setItem(SAVE_KEY, JSON.stringify(save));
    return true;
  } catch {
    return false;
  }
}

export function clearSave(storage = window.localStorage) {
  try { storage.removeItem(SAVE_KEY); return true; }
  catch { return false; }
}

export function applyStageClear(save, levelIndex, result) {
  const next = structuredClone(save);
  if (!next.completed.includes(levelIndex)) next.completed.push(levelIndex);
  next.unlockedLevel = Math.max(next.unlockedLevel, Math.min(4, levelIndex + 1));
  next.coins += result.reward;
  const current = next.records[String(levelIndex)];
  const record = { time: result.time, score: result.score, fighter: result.fighter, grade: result.grade };
  if (!current || result.score > current.score || result.time < current.time) next.records[String(levelIndex)] = record;
  if (levelIndex === 0 && !next.unlockedFighters.includes("qiao")) next.unlockedFighters.push("qiao");
  if (levelIndex === 1 && !next.unlockedFighters.includes("tie")) next.unlockedFighters.push("tie");
  if (levelIndex === 1 && !next.unlockedVariants.includes("echo")) next.unlockedVariants.push("echo");
  if (levelIndex === 2 && !next.unlockedLooks.includes("street_master")) next.unlockedLooks.push("street_master");
  return next;
}

export function applyCampaignClear(save, result) {
  const next = structuredClone(save);
  next.completed = [0, 1, 2, 3, 4];
  next.unlockedLevel = 4;
  next.coins += result.reward;
  next.records.campaign = { time: result.time, score: result.score, fighter: result.fighter, difficulty: result.difficulty, grade: result.grade };
  next.unlockedVariants = [...new Set([...next.unlockedVariants, "master-forms"])];
  return next;
}
