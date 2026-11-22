# 消防站室内资产包

打开项目开发服务的 `/assets/station-kit/index.html`，按名称或分区查找资产。每项可旋转查看模型、核对三视图、下载独立 GLB。直接从磁盘打开同目录的 index.html 也能查看图纸，通过“打开本地 GLB”加载模型。

## 交付

- `concept.png` 是四件任务资产的原创正、侧、顶视原画。`hero-render.jpg` 是四个导出模型的 WebGL 渲染。
- `views/` 内每项一张工程三视图。`projections.json` 保存带部件名及材质键的三组米制投影。建模程序读取正视确定 X/Y 和宽高，读取右视确定 Z 和深度，再对照顶视复核。
- `models/` 内每项一个自包含 glTF 2.0 二进制文件，纹理嵌入 GLB，Y 向上，+Z 为正面。模型以米为单位。
- `manifest.json` 记录稳定 ID、建议宿主、安装基准、设计包络、导出几何测量值、部件数和文件名。尺寸顺序为宽、高、深。设计包络是建模输入，附件可以超出包络。每个放置实例的具体宿主 ID、碰撞和位置需在关卡中确定。
- 407 项包括独立物件、复合装配和状态变体。卷门分关闭、半开、全开，推车分带水带、卸空、装泵，穿戴柜有空架、满装、取用后和个人物品组合。
- 项目尺寸沿用消防站灰盒交接，其他道具采用美术估算。验收脚本重新导入所有 GLB，检查几何包围盒、底面和部件数。所列结果属于独立资产检查。关卡内的动作、碰撞、寻路、目标机帧时间及最终近景画质仍需在布置后评审。

## 从项目根目录重建

```powershell
node tools/station-kit/build.mjs
node tools/station-kit/gallery.mjs
node tools/station-kit/verify.mjs
```

前两步使用项目已有的 Three.js 和 Vite。第三步使用 Puppeteer 和本机 Chrome / Edge，可用 CHROME_PATH 指定浏览器位置。平面构件和次要小件使用共享参数化模型；木纹、油漆、织物和钢材的基础色取样于原画，并叠加程序化表面变化。
## 原画还原版

值班台、试泵台、水带推车和南卷门按 concept.png 的原图像素定位构件。试泵台采用中央单泵和双表，独立可搬运的两台泵保留在资产库中。推车空载与装载版、卷门半开与全开版共用重建后的主体。原画未展示的背面、底面和装载结构采用补建几何及同材质采样。

重建脚本从同级 AI相关/three.js 的源码调用 ExtrudeGeometry、LatheGeometry 和 TubeGeometry，可用 RA2_THREE_SOURCE 更改路径。独立分发时可使用项目安装的 Three.js。reference-comparison.jpg 左右并列显示原画和重新导入 GLB 的三个方向。每幅图独立按外框取景，原画中的轻微透视保留。reference-check.json 是中性背景分割所得的外形辅助数据，识别灰钢与封闭空洞时存在误差。其余 399 项的依据是原有工程投影。

组件几何来自 reference-meshes.mjs，原图贴图随模型嵌入。运行 build.mjs 和 gallery.mjs 后，verify.mjs 会从最终 GLB 重绘这八项在资产库中的三视图，并更新对照图。
