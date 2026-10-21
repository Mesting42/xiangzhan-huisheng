import "./style.css";
import { Game } from "./game.js";
import { UI } from "./ui.js";

const canvas = document.getElementById("world");
const game = new Game(canvas);
const ui = new UI(game);
game.ui = ui;
ui.render("menu");
if (game.damagedSave) ui.toast("存档内容已损坏，已为你准备新档；仍可正常开始。", 4200);

let previous = performance.now();
let frameCount = 0;
function frame(now) {
  const delta = Math.min(.05, Math.max(0, (now - previous) / 1000));
  previous = now;
  game.update(delta);
  game.updateWorld(delta);
  frameCount++;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

window.addEventListener("error", (event) => {
  console.error("巷战回声运行错误：", event.error || event.message);
});
window.addEventListener("unhandledrejection", (event) => {
  console.error("巷战回声异步错误：", event.reason);
});
