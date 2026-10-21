# 本轮模型检查图

- enemy-costumes-troops.png：五类小兵与精英的实际几何造型。
- enemy-costumes-bosses.png：五位 Boss 与最终第二阶段。
- roll-poses.png：林岚翻滚的六个阶段。

这些是读取正式渲染器、骨架和 glTF 网格后生成的独立 CPU 检查图，不是浏览器截图。图中使用简化的光照；玩家原始贴图未在 CPU 检查器中还原，不能用翻滚图判断游戏内服装色彩。敌方新衣装使用实际顶点色与配件材质。

本轮浏览器自动操作因无法可靠识别当前网址被系统中止，因此未完成浏览器实玩复测。npm test 与 npm run build 均通过。

开发预览中的正式模型检查：

- /tests/visual/enemy-review.html
- /tests/visual/animation-review.html（已加入翻滚）
- /tests/visual/enemy-arena.html

如需重新生成独立检查图：先运行 node tests/render-model-review.js，再用安装了 Pillow 的 Python 运行 tests/rasterize-model-review.py。中间 JSON 只用于离线绘图，不属于游戏运行资源。
