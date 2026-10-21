# 第三方素材说明

《巷战回声》的浏览器运行资源随仓库保存在 `public/`，无需运行时联网下载。

## Quaternius Universal Base Characters

- 作者：Quaternius
- 来源：https://quaternius.itch.io/universal-base-characters
- 许可：CC0 1.0 Universal
- 运行文件：`public/assets/models/quaternius/`
- 许可副本：`public/assets/models/quaternius/LICENSE-CC0-1.0.txt`

## Quaternius Modular Character Outfits — Fantasy

- 作者：Quaternius
- 来源：https://quaternius.itch.io/modular-character-outfits-fantasy
- 许可：CC0 1.0 Universal
- 运行文件：`public/assets/models/quaternius-outfits/`
- 许可副本：`public/assets/models/quaternius-outfits/License_Standard.txt`

角色几何、服装配色和骨骼动作在游戏中进行了调整。模型原始下载压缩包与重复解压文件保留在开发者本地，不纳入 Git；运行和测试需要的 glTF、二进制缓冲区与纹理均包含在上述 `public/` 目录。

## Three.js 与 Vite

依赖及其确切版本由 `package.json`、`package-lock.json` 管理，通过 `npm ci` 安装。

- Three.js：https://github.com/mrdoob/three.js ，MIT 许可。
- Vite：https://github.com/vitejs/vite ，MIT 许可。

第三方素材与依赖的许可按其原始许可文件执行。本文件不为项目自身源码另行授予许可。
