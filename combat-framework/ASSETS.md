# 资源来源

作者 Quaternius；原始许可 CC0。下载使用作者资源的公开镜像，许可原文随源文件保留。没有使用原游戏提取资产。

官方资源页：
- https://quaternius.com/packs/universalanimationlibrary.html
- https://quaternius.com/packs/universalanimationlibrary2.html
- https://quaternius.com/packs/universalbasecharacters.html

镜像清单：https://github.com/WaviestSun/atelier-packs

| 文件 | 下载地址 | SHA256 |
|---|---|---|
| UAL1_Standard.glb | https://github.com/WaviestSun/atelier-packs/releases/download/characters-1/UAL1_Standard.glb | 69591853d817488edaa8fd9bf8fc1d821eaeaf789f8627b3cd23b41c4ed67997 |
| UAL2.zip | https://github.com/WaviestSun/atelier-packs/releases/download/packs-2/Universal-Animation-Library-2-Standard.zip | 4008ea208a604773a2b2177d965f0f5d3195498b5bf838c3f5785d68e95f2a68 |
| Characters.zip | https://github.com/WaviestSun/atelier-packs/releases/download/packs-2/Universal-Base-Characters-Standard.zip | fdbf1804c90dfc1ea03e992bff7da2dfd1a79318e13270a660180f9308455f40 |

源文件位于 `assets-source/`，供骨架与许可复核。下载逐一核对镜像公布的 SHA256。Standard 包各 43 clips，不能把付费完整包的 120/130+ 数量计入本工程。

派生资源 `public/assets/combat/character-female.glb`：UAL1 → Superhero_Female_FullBody；65 同名骨映射、休止姿态旋转差修正、30Hz 采样。逐片段长度见 `assets-source/retarget-report.json`。生成器 `tools/retarget.py` 需在已载入源和目标的 Blender `CombatAssetLab` 场景中运行。

追加 UAL2 重定向后，共 85 段不重复动作、4193 帧。`retarget-report-ual2.json` 记录新增 42 段；重复 A_TPose 不计入。角色头发来自同包 Hair_Buns，衣裤鞋由 CC0 基体的权重网格派生，制作脚本 `tools/outfit.py`；属于原型美术。

## CMU 动捕

原始采集方：Carnegie Mellon University Graphics Lab，NSF EIA-0196217 资助。BVH 格式转换：Bruce Hahne，2010 MotionBuilder-friendly release。源包 `READMEFIRST.txt` 允许研究及商业项目使用，转换者不附加限制。当前用于游戏工程内的派生动画，不作为独立动作商品转售。

- 原始来源：https://mocap.cs.cmu.edu/
- 转换发布页：https://sites.google.com/a/cgspeed.com/cgspeed/motion-capture/the-motionbuilder-friendly-bvh-conversion-release-of-cmus-motion-capture-database
- 转换说明：https://sites.google.com/a/cgspeed.com/cgspeed/motion-capture/the-motionbuilder-friendly-bvh-conversion-release-of-cmus-motion-capture-database/readme-motionbuilder-2010-release
- 下载镜像：`http://static.85.43.251.148.clients.your-server.de/dl/cmuconvert/`

| 包 | SHA256 |
|---|---|
| cmuconvert-mb2-01-09.zip | 8822d96dac5694cb5df35e017fa7df174a051249d48d70d6732a7b68953016d9 |
| cmuconvert-mb2-113-128.zip | 03c462ef76a2869b9fb5a43ee17c95a4c74f3552c70c78f9a88d90c1c7b5b85c |

镜像 HTTPS 证书域名不匹配，使用其公开 HTTP 数据下载；上述为本地下载后的存档哈希，**没有声称得到作者签名验证**。每个选用 BVH 的哈希另存于派生清单。只读取动作数据，未运行包内代码。

选用 68 段走、跑、地形走、起停、转向和侧步动作，源帧率约 120Hz，转换所加首帧 T-pose 只作校准并排除。`tools/retarget-cmu.py` 将其重定向为 65 骨、Y-up、+Z 前向、30Hz ANIM。根位移和朝向保留为实测元数据，姿态去除全局根平移与朝向以供控制器驱动。每片段使用固定踝平面高度修正适配身体比例，记录 `heightCorrection`。

当前 MMDB：7685 帧，其中 7368 为清洗后的 CMU 实测根轨迹帧、317 为 Quaternius 原地动作帧。后者根速度为明确标注的控制器标定值；没有将标定值称为动捕测量。无镜像、重复填充或合成帧。CMU_07_12、CMU_09_10 各排除一处 >12m/s 跳变及相邻样本，详细报告 `evidence/mm-bake.json`。

可重现顺序：Blender 重定向 → `node combat-framework/tools/bake-animations.mjs` → Blender CMU 重定向 → `node combat-framework/tools/bake-mm.mjs`。Blender 场景副本：`assets-source/combat-retarget.blend`。

## 追加俯卧与通行动作

从 KinemIQ 公开目录下载 5 个 GLB，共1518个源采样帧，使用 `tools/retarget-extra.py` 在 Blender 重定向。来源、每文件哈希、原始来源、许可和变换记录存于 `public/data/combat/extra-animations.json`，署名随运行资源分发在 `CREDITS.txt`。这些不是移动 MMDB 的填充帧，MMDB仍为7685帧。

- ACCAD 女性前爬、后爬、蹲转卧：Open Motion Project by ACCAD / The Ohio State University，CC BY 3.0。原始许可页：https://accad.ohio-state.edu/research/motion-lab/mocap-system-and-data 。分发页：https://kinemiq.app/sources/ 。本工程增加65骨重定向、朝向归一化、提取水平根运动及播放区间适配。
- Safety Vault、Climb Up 2m：Quaternius UAL2，CC0 1.0，经上述公开分发页获得；额外提取较低脚部的垂直根轨迹。
- 另下载 CMU 131–135 包核查爬行动作，SHA256 `fc1a83b590dd15ff7bda24b1362a2f6ca067db9c17295929b2b5a02a5c57dbf5`。133_01是四肢跪爬，未作为俯卧动作加入生产清单。
- 俯卧原型速度改为0.16m/s，与选用慢爬数据的约0.15m/s相适配；这是工程值，并非原游戏测量值。完整入卧/起身过渡、侧向爬行及身体长轴碰撞仍需完善。

## 左右180°转身补充（2026-11-20）

- 文件：KinemIQ公开库 `clips/turn180_l.glb`、`clips/turn180_r.glb`；原始出处UAL2，两个GLB均内嵌Quaternius CC0 1.0声明。
- SHA256：左 `e1bcf172a436a742512aac9645d7cbe586d1f6d17864a0b1b123ec1ac40134e6`；右 `c61698f7844175372cf4600df6f2f60776dda1ed252fb50c7fc0ce20fc0be302`。
- Blender脚本 `tools/retarget-turn.py` 将其适配65骨架，并把逐帧pelvis yaw分离到headings，避免角色控制器与动作重复旋转。每段51帧，共102帧，未计入移动MMDB。
- 运行清单现有160段；这两段已烘焙但尚未接入转身动作调度，不能据此宣称转身脚滑已修复。完整复现顺序：retarget-extra.py → retarget-turn.py → bake-mm.mjs。
