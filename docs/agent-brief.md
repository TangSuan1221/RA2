# 子 Agent 共享简报：TLOU 1/2 视觉还原（Three.js WebGPU）

你是一名资深实时图形 / 技术美术工程师。项目目录：`C:\Users\Lenovo\Desktop\the last rule`。
目标：用 Three.js r187（`three/webgpu` + TSL）在浏览器里做出与《最后生还者 1/2》关卡**并排盲测难分高下**的画面。不接受"Demo 感"。

## 1. 必读
- 本文件全部内容
- `docs/reference/ref*_view.jpg`（你**能看的**小图，≤30KB）。大图 `ref*.jpg` 用于盲测工具，**不要直接 Read 大图**，超过约 30KB 的图片会被丢弃（显示 "Image omitted"）——看任何图片之前都先用 `tools/small.py` 压缩。
- 用户提供的两份方法论（要点已摘进第 6 节）：`C:\Users\Lenovo\Downloads\the_last_of_us_ai.md`、`C:\Users\Lenovo\Desktop\制作管线.txt`

## 2. 参考图说明
| 文件 | 内容 | 关键视觉 |
|---|---|---|
| ref1 | TLOU1 Part I 城市远景：高草、树、废弃高楼、长颈鹿 | 阳光、饱和但柔和的绿、远景大气透视 |
| ref2 | TLOU 阳光室内（木质书店/仓库） | **强烈暖色硬阳光**穿过窗户在地面形成光斑，室内大面积暗部，木架、灰尘、门口长草 |
| ref3 | TLOU2 黑暗积水室内 | 几乎全黑，**手电光束**照亮雾气，门框边缘有一点暖光，积水地面，墙上植物 |
| ref4 | TLOU2 阴天废墟远景 | 低对比、青灰，倒塌建筑，大气雾 |
| ref5 | TLOU2 阴暗街道 | 低饱和，湿冷，灰 |
| **ref6（用户新提供，仅文字）** | TLOU2 **长满苔藓的小巷**：右侧是横向凹槽的混凝土/护墙板高墙，墙面**大片苔藓+黑色水渍流痕**从顶部向下；墙根堆满**常春藤/阔叶藤蔓**；左侧是钢架玻璃温室/中庭（玻璃破碎、钢梁），远处一盏冷白灯亮着；脚下是**破裂的混凝土步道，裂缝里长满苔藓与草**，有积水湿痕；阴天柔光 | 苔藓的厚度与分布、墙面竖向流痕、藤蔓体积感 |
| **ref7（用户新提供，仅文字）** | TLOU2 **淹水中庭/大楼入口**：前景是一条铝制划艇在**深绿色、几乎镜面的死水**上；水面漂着**睡莲叶**；左侧有**蕨类**和从高处垂下的**常春藤帘幕**；正前方是过曝的明亮出口（玻璃门/拱形钢架），门外是**带刺铁丝网**围栏和草地；两侧是深色木/金属立柱；水面倒映出口的亮光 | 水面反射、暗部室内与过曝室外的强烈明暗对比、垂挂藤蔓 |

参考图中的角色、HUD、水印都忽略，只比较环境。

## 3. 项目结构与约定（务必遵守，多个 Agent 在并行工作）
- 场景宿主：`src/main.js`，按 `?scene=<名字>` 加载 `src/scenes/<名字>.js`。场景模块导出：
  - `export const SHOTS = { hero: { position:[x,y,z], lookAt:[x,y,z], fov:50 }, top: { mode:'top', yaw, pitch:55, distance, target:[x,y,z] } }`（第一个为默认机位；`position` 写法是固定电影机位，`mode` 写法是游戏俯视控制器）
  - `export async function build({ scene, renderer, camera, controls, params })` → 返回 `{ sun?, csm?, M?, update?(dt, t), pipelineOptions?, gui?(lilGui) }`
- `pipelineOptions` 可用字段（见 `src/core/renderer.js`）：
  - `volumes: [createVolumeFog(geometry, { density, steps, noise })]` —— 体积光（光柱、手电光束）。需要产生光柱的灯要 `light.layers.enable(VOLUME_LAYER)`。从 `src/core/renderer.js` 导入 `createVolumeFog, VOLUME_LAYER`。已验证可用（`src/scenes/_voltest.js`）。
  - `volumeIntensity`、`volumeResolution`
  - `postHDR(hdrNode, { scenePass, preDepth, camera })` → 色调映射前的线性 HDR 处理
  - `postLDR(ldrNode, ctx)` → 替换默认调色（默认调色见 `colorGrade` 与 `grade` uniforms）
  - `bloomThreshold`
- 管线已有：法线/速度预渲染 → GTAO → （体积光）→ TRAA → Bloom → AgX → 调色。`renderer.toneMapping` / `toneMappingExposure` 你可以在 build 里改。
- 可复用模块：`src/world/assets.js`（`loadModel` glTF→节点材质并外挂 alpha 贴图、`InstanceBatch` 实例化、`pbrMaterial`、`loadTexture`、`loadHDR`、`trs`）、`src/materials/weathering.js`（世界空间苔藓/潮湿/雨痕/积水）、`src/world/buildings.js`（模块化立面拼楼）、`src/world/ground.js`。

### 文件所有权（防冲突，违反会毁掉别人的工作）
- 你**只能创建/修改**：`src/scenes/<你的场景名>.js` 和 `src/<你的场景名>/` 目录下的文件，以及 `shots/<你的场景名>/` 下的截图。
- **禁止修改**任何共享文件：`src/main.js`、`src/core/*`、`src/world/*`、`src/materials/*`、`src/debug/*`、`tools/*`、`index.html`、`package.json`。需要改共享模块的行为时，复制到你自己的目录再改。
- 不要 git commit / 切分支。不要 `npm install` 新包（已有：`three@0.187`、`lil-gui`、`@dgreenheck/ez-tree`（程序化树）、`puppeteer-core`）。确实需要新包时在返回结果里提出，由主 Agent 安装。

## 4. 资产
- 已下载：`public/assets/`（Poly Haven CC0：立面套件、植被、残骸车、路障、杂物、路面/人行道/泥土/混凝土贴图、`urban_street_01` HDRI）。清单见 `public/assets/LICENSES.md`。
- 追加下载 Poly Haven 资产（**用命令行参数，不要改脚本**）：
  `node tools/fetch-assets.mjs --models id1,id2 --textures id:2k,id2:1k --hdris id:2k`
  可用列表：`.cache/tex.json`、`.cache/mod.json`、`.cache/hdri.json`（键为资产 id），或 `curl -A tlr https://api.polyhaven.com/assets?t=textures`。注意 Poly Haven 的草/苔藓贴图普遍偏枯黄，需取亮度细节后重新着色（见 `weathering.js` 的 `tintDetail`）。
- 也可用 **ambientCG**（CC0）：`https://ambientcg.com/api/v2/full_json?type=Material&q=moss&include=downloadData`，下载 zip 后解压到 `public/assets/ambientcg/<id>/`，并在你的返回结果里列出来源（主 Agent 更新授权清单）。
- 禁止使用任何顽皮狗 / 游戏提取资产。
- 大规模植被、藤蔓、碎屑、水面、雾、光柱等，**用代码程序化生成**（藤蔓沿表面生长算法、实例化叶片卡片、TSL 水面）。

## 5. 截图与自检（每次修改后都要做）
- 开发服务器：`http://localhost:5173`（应已在运行；`curl -s -o /dev/null -w "%{http_code}" http://localhost:5173` 不是 200 时，后台运行 `npx vite --port 5173 --strictPort`）。
- 真 GPU 无头截图：
  `node tools/shot.mjs --url "http://localhost:5173/?scene=<名>&shot=hero" --out shots/<名>/r1_hero.jpg --w 1600 --h 900 --wait 4000`
  输出 JSON 含 `stats`（fps / gpu ms / drawCalls / triangles）和控制台报错。**零报错**才算数。
- 查看截图：`python -I tools/small.py shots/<名>/r1_hero.jpg shots/<名>/r1_hero_view.jpg` 然后 Read `_view.jpg`。参考小图同理已备好（`docs/reference/ref*_view.jpg`）。
- 量化对齐：`python -I` 写小脚本测参考图与渲染图的亮度分位数（p10/p50/p90）、平均饱和度、主色，让渲染统计接近参考（参考统计见 `docs/视觉目标.md`）。不要凭感觉调。
- 性能预算（1600×900，RTX 5080）：GPU ≤ 10 ms（shot.mjs 的 `stats.gpu`），三角面 ≤ 15M，绘制调用 ≤ 800。

## 6. TLOU 视觉要点（来自用户方法论，已结合本项目）
- **植被**：常春藤覆盖立面 40–70%，从墙根、窗框、裂缝开始；地面裂缝塞满杂草；苔藓在背阴面与积水边缘最厚。藤蔓必须有体积（叶片卡片/实例化叶子），不能只是贴图染绿。
- **材质衰变**：金属重度锈蚀；混凝土剥落露钢筋；油漆起泡剥落；竖向水渍流痕。严禁大面积纯色、均匀粗糙度的"塑料感"表面；可见的程序化几何要倒角。
- **光影**：TLOU 的核心是**明暗对比**——暗部压得很深（参考图室内中位亮度只有 20–40/255），光只从窗口/手电/天光来；暖色硬阳光与冷色阴影的反差；体积光柱与空气中的尘埃/孢子粒子。
- **调色**：对比偏高，绿色深邃略去饱和；黑位略抬（胶片感）；轻微颗粒、暗角。
- **后期红线**：Bloom 阈值 ≥ 0.85，只允许真正的发光体起辉，严禁全画面发雾。
- **地面积水**：粗糙度/法线变化的湿区，水洼中心近镜面。
- **人类遗迹**：散落行李、衣物、纸张、翻倒家具、手写标语等叙事细节。

## 7. 评审标准（独立评审 Agent 会用这个打分，非常苛刻）
评审会把你的 `hero` 截图与对应参考图**随机左右放置盲测**，判断哪张更像 3A 成品，并按以下维度 1–10 打分：
构图与景深层次 / 光照与明暗对比 / 材质真实度 / 植被与自然侵蚀 / 细节密度与叙事 / 大气与后期 / 与参考图情绪一致度 / 有无穿帮（悬空、穿模、拉伸贴图、平铺重复、锯齿、噪点）。
通过线：**每项 ≥ 8，且盲测中评审认为两张"难分高下"或渲染图更好**。
