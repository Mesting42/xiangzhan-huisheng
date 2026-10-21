export const FIGHTERS = [
  {
    id: "lin", name: "林岚", call: "守馆人", role: "平衡型 · 稳拳连势",
    glyph: "守", color: "#9b4b36", trim: "#e5bd77", skin: "#d8a37f",
    health: 118, speed: 4.9, power: 1, dodge: 1, special: "回风掌",
    description: "稳健拳脚，第三击破防。每段连招都留有转身余地。",
    stats: [72, 62, 68], outfit: "blue"
  },
  {
    id: "qiao", name: "乔小满", call: "夜市跑堂", role: "迅捷型 · 连闪快打",
    glyph: "疾", color: "#426e62", trim: "#e1bb75", skin: "#e0ae8a",
    health: 94, speed: 6.1, power: .76, dodge: 1.28, special: "穿巷步",
    description: "轻拳迅疾，翻滚后接影步突进，适合游走与追击。",
    stats: [91, 45, 87], outfit: "green"
  },
  {
    id: "tie", name: "铁山", call: "退役搬运工", role: "强力型 · 擒拿震地",
    glyph: "震", color: "#80533d", trim: "#d6a45f", skin: "#c98d68",
    health: 145, speed: 4, power: 1.46, dodge: .85, special: "山靠",
    description: "重拳震开整排敌人。慢半拍，但谁也挡不住他站稳。",
    stats: [48, 96, 41], outfit: "ochre"
  }
];

export const DIFFICULTIES = [
  { id: "story", name: "街坊相助", note: "预警更宽 · 伤害较低 · Boss 战前补满气血", playerDamage: 1.25, enemyAttack: .60, playerHealth: 1.35, enemyRecovery: 1.3, enemyHealth: .85, bossHealth: .85, bonus: .9 },
  { id: "standard", name: "巷战本色", note: "连招压制 · 翻滚避险 · 抓住 Boss 收招反击", playerDamage: 1, enemyAttack: 1, playerHealth: 1, enemyRecovery: .85, enemyHealth: 1, bossHealth: 1, bonus: 1 },
  { id: "master", name: "武馆试炼", note: "双近战协攻 · 远程压制更紧 · 失误代价更高", playerDamage: .95, enemyAttack: 1.2, playerHealth: .95, enemyRecovery: .70, enemyHealth: 1.12, bossHealth: 1.12, bonus: 1.55 }
];

export const ENEMIES = {
  swift: { id: "swift", name: "快手", hp: 100, damage: 14, speed: 4.1, reach: 1.14, style: "rush", color: "#53746a", trim: "#d7bf8e", score: 160 },
  heavy: { id: "heavy", name: "扛把子", hp: 190, damage: 26, speed: 2.4, reach: 1.5, style: "heavy", color: "#785b45", trim: "#d2a46d", score: 260 },
  guard: { id: "guard", name: "护手", hp: 145, damage: 18, speed: 2.9, reach: 1.25, style: "guard", color: "#5e7765", trim: "#d4b778", score: 220 },
  ranged: { id: "ranged", name: "掷手", hp: 96, damage: 15, speed: 2.8, reach: 6.2, style: "ranged", color: "#566978", trim: "#d4ae76", score: 200 },
  charger: { id: "charger", name: "撞街客", hp: 140, damage: 22, speed: 3.35, reach: 1.35, style: "charge", color: "#856244", trim: "#dda966", score: 230 },
  elite: { id: "elite", name: "街口硬茬", hp: 240, damage: 24, speed: 3.5, reach: 1.48, style: "elite", color: "#70464a", trim: "#e0ab6c", score: 440 }
};

export const LEVELS = [
  {
    id: 0, name: "老街巷", subtitle: "武馆门前 · 雨停之后", palette: "street", ground: "#59635a", accent: "#bb684a",
    boss: { id: "steel", name: "钢牙梁", title: "街口收账人", hp: 840, damage: 22, speed: 3.05, style: "ram", color: "#573c3b", trim: "#d69655", phases: 1 },
    zones: ["卷帘门外", "石板巷口", "当铺前街"],
    intro: "天还没亮，拆迁队先把封条贴上了武馆门。街坊们围成一圈，钢牙梁却拿砖头敲着铁桶走来。",
    line: "老规矩。拳头说完，才轮到纸上的字。",
    waves: [["swift"], ["guard", "ranged"], ["heavy", "charger"]],
    lesson: true, tokens: 2
  },
  {
    id: 1, name: "夜市街区", subtitle: "灯火深处 · 人情未散", palette: "market", ground: "#514c43", accent: "#df9b58",
    boss: { id: "kite", name: "红袖鸢", title: "夜市追风手", hp: 960, damage: 20, speed: 4.15, style: "dart", color: "#834540", trim: "#e7be79", phases: 1 },
    zones: ["鱼档与茶摊", "灯笼长街", "后巷凉棚"],
    intro: "摊主们把最后几盏灯挂上檐。红袖鸢从人群顶上翻过来，木签在指间转得像一阵风。",
    line: "留盏灯。今晚还有人要回家。",
    waves: [["swift", "ranged"], ["charger", "swift", "guard"], ["elite", "ranged"]],
    tokens: 2
  },
  {
    id: 2, name: "废弃工厂", subtitle: "炉火将熄 · 铁还记得热", palette: "factory", ground: "#4f5552", accent: "#d98545",
    boss: { id: "forge", name: "炉锤", title: "旧厂看守", hp: 1140, damage: 30, speed: 2.45, style: "slam", color: "#534b46", trim: "#dc8d51", phases: 1 },
    zones: ["冷却车间", "废料输送带", "锅炉平台"],
    intro: "旧厂的传送带还在转。炉锤把路障拖进火星里，沉重的脚步震落屋顶灰尘。",
    line: "机器会停。人心不能凉。",
    waves: [["heavy", "swift"], ["charger", "heavy", "ranged"], ["elite", "guard", "charger"]],
    tokens: 3
  },
  {
    id: 3, name: "屋顶通道", subtitle: "云低风紧 · 退路在身后", palette: "roof", ground: "#455557", accent: "#7eaaad",
    boss: { id: "string", name: "断弦", title: "天台截路人", hp: 1260, damage: 25, speed: 4.5, style: "feint", color: "#424d5b", trim: "#c9af80", phases: 1 },
    zones: ["水塔边缘", "天线走廊", "旧楼天台"],
    intro: "风把告示吹向楼下。断弦守在天台最窄的一段路上，铁链拖过积水，留下一道细响。",
    line: "下面有人等着。我们不往后退。",
    waves: [["charger", "ranged"], ["swift", "guard", "swift"], ["elite", "heavy", "ranged"]],
    tokens: 3
  },
  {
    id: 4, name: "武馆决战", subtitle: "回到门前 · 守住灯火", palette: "dojo", ground: "#51473c", accent: "#cb6646",
    boss: { id: "zhou", name: "周啸天", title: "强拆队主使 · 第一式", hp: 1520, damage: 28, speed: 3.25, style: "tactician", color: "#51423b", trim: "#e1b36e", phases: 2 },
    zones: ["被封住的前院", "天井木廊", "祖师堂外"],
    intro: "封条被街坊一张张揭下。武馆里，周啸天脱掉西装外套，换上旧拳套。最后一架挖机停在巷口。",
    line: "这扇门后面，是大家一起过日子的地方。",
    waves: [["guard", "swift", "ranged"], ["elite", "charger", "heavy"], ["elite", "guard", "ranged"]],
    tokens: 5
  }
];

export const ZONE_LABELS = ["教学后巷", "短暂喘息", "头目来袭"];
export const PICKUPS = { tea: { name: "姜茶", text: "街坊递来的姜茶，恢复 24 点气血", heal: 24 }, club: { name: "练功短棍", text: "按攻击挥棍；按 G 掷出，短时有效", duration: 14 } };
