// Shared CC0 human rigs, with separate silhouettes and costume treatments.
export const ENEMY_MODELS = {
  swift: { name: "快手", form: "male", height: 1.06, width: .91, depth: .94, shirt: "#566b58", pants: "#34464d", hair: "mohawk", costume: "bomber", headwear: "none", face: "lean", skin: "#bc8d71", accent: "#ddd1ae" },
  heavy: { name: "扛把子", form: "male-ranger", height: 1.15, width: 1.38, depth: 1.29, shirt: "#393b38", pants: "#73644e", hair: "bald", costume: "workvest", headwear: "none", face: "broad", skin: "#c2977e", accent: "#b7a17a" },
  guard: { name: "护手", form: "male-ranger", height: 1.13, width: 1.13, depth: 1.10, shirt: "#293b50", pants: "#27303b", hair: "bald", costume: "security", headwear: "securitycap", face: "square", skin: "#ac826b", accent: "#b9c5cb" },
  ranged: { name: "掷手", form: "male", height: 1.05, width: .86, depth: .92, shirt: "#848079", pants: "#343d44", hair: "bald", costume: "courier", headwear: "beanie", face: "lean", skin: "#ba927b", accent: "#c39a65" },
  charger: { name: "撞街客", form: "male-ranger", height: 1.12, width: 1.18, depth: 1.12, shirt: "#d87931", pants: "#4c5555", hair: "bald", costume: "safety", headwear: "hardhat", face: "square", skin: "#bd8e73", accent: "#eee09c" },
  elite: { name: "街口硬茬", form: "male-ranger", height: 1.17, width: 1.03, depth: 1.02, shirt: "#343a3b", pants: "#242c33", hair: "undercut", costume: "biker", headwear: "none", face: "lean", skin: "#af8c78", accent: "#c8c5b2" },
  ram: { name: "钢牙梁", form: "male-ranger", height: 1.23, width: 1.33, depth: 1.22, shirt: "#733e39", pants: "#2e333a", hair: "bald", costume: "enforcer", headwear: "none", face: "broad", skin: "#bc9075", accent: "#c3a05f" },
  dart: { name: "红袖鸢", form: "female-ranger", height: 1.16, width: .94, depth: .98, shirt: "#713939", pants: "#2d343e", hair: "asymmetric", costume: "cropped", headwear: "none", face: "lean", skin: "#c99f87", accent: "#d4c6a9" },
  slam: { name: "炉锤", form: "male-ranger", height: 1.24, width: 1.43, depth: 1.30, shirt: "#595e55", pants: "#3f4545", hair: "bald", costume: "foreman", headwear: "hardhat", face: "broad", skin: "#ad8267", accent: "#dba14a" },
  feint: { name: "断弦", form: "male-ranger", height: 1.22, width: .90, depth: .95, shirt: "#626f79", pants: "#2d3642", hair: "topknot", costume: "longcoat", headwear: "none", face: "lean", skin: "#bca18b", accent: "#cecac0" },
  tactician: { name: "周啸天", form: "male-ranger", height: 1.21, width: 1.10, depth: 1.07, shirt: "#333c48", pants: "#29313d", hair: "slick", costume: "suit", headwear: "none", face: "square", skin: "#c0a08a", accent: "#b64c3f" }
};

export function enemyModelProfile(enemy) {
  const key = enemy.boss ? enemy.style : (enemy.type || "swift");
  const profile = ENEMY_MODELS[key] || ENEMY_MODELS.swift;
  return { ...profile, key, modelKey: "enemy:" + key + (enemy.boss && enemy.phase > 1 ? ":phase2" : ""),
    phase2: Boolean(enemy.boss && enemy.phase > 1),
    ...(enemy.boss && enemy.phase > 1 ? { shirt: "#c27e6c", accent: "#e8bd72" } : {}) };
}
