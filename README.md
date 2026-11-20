# The Last Rule

基于 Three.js 和 Vite 的游戏原型，包含场景探索、驾驶演示与战斗系统。

## 本地运行

安装支持当前 Vite 版本的 Node.js，然后执行：

```sh
npm ci
npm run dev
```

打开终端显示的本地地址。战斗原型入口为 `/combat.html`。

## 构建

```sh
npm run build
npm run preview
```

构建输出在 `dist/`。仓库包含运行所需的 `public/assets/` 和 `public/data/`。
`node_modules/`、`dist/`、本地缓存和体积较大的 `combat-framework/assets-source/` 原始素材不纳入版本控制。
原始素材来源、许可与重建说明见 [combat-framework/ASSETS.md](combat-framework/ASSETS.md)。

## 项目说明

- [战斗系统说明与操作](combat-framework/README.md)
- [开发进度](docs/PROGRESS.md)
- [资源来源与署名](combat-framework/ASSETS.md)

当前为开发中的原型，已知限制见上述文档。
