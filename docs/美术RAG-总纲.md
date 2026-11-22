# 项目美术 RAG 总纲

本页是《The Last Rule》单关卡美术制作的统一入口。灰盒和正式美术共用以下三份专项规范。

| 制作时要回答的问题 | 查阅的规范 |
|---|---|
| 玩家要达成什么目标？机关如何改变路线？灰盒如何试玩验收？ | [关卡机制设计执行手册](./美术RAG-关卡机制设计-AI执行手册-v1.0.md)。方案查第 1–2、8 节，灰盒查 ART-BOX-01 至 04，测试查第 4–5 节，交付查第 9 节。 |
| 交互物属于哪一类？量门洞、门扇还是操作空间？ | [交互物清单与尺寸规范](./美术RAG-交互物清单与尺寸规范.md)。按交互物 ID 查尺寸口径，分别记录研究参考值、项目采用值和实测结果。 |
| 物件装在哪里、依附谁？保存后如何检查接缝和支撑？ | [单关卡放置与吸附关系](./美术RAG-单关卡吸附.md)。按 ART-SNAP-01 至 04 确认宿主、安装点、支撑面和验收依据。 |

**消防局卷门示例**：设计时记录升门后开放哪条抱箱路线；建模时按 DR-04 记录有效净宽和升起后的净高；布置时让门扇与洞口共用基准，把手链安装在固定墙框上。验收时实际操作手链，检查关闭时的遮挡和开启后的抱箱通行，并记录试玩结果。

## 关卡制作资料索引

| 制作阶段 | 查什么 | 入口 |
|---|---|---|
| 大地图立项与选址 | 查关卡所属大区、POI 等级、周边道路和载具通行宽度；用图集定位相邻地点。 | [西雅图地图设计规范](./西雅图地图设计规范.md) · [地图图集](./map-atlas/index.html) · [分区点位](./map-atlas/districts.html) |
| 美术与生产 | 确定场景视觉目标，按制作工序查对应阶段的交付物和验收清单。 | [视觉目标](./视觉目标.md) · [制作工序](./制作工序.md) |
| 灰盒布置与试玩 | 验证结构安装点、交互物落点和角色可达性。HTML 工具通过项目 Vite 服务打开。 | [吸附实验台](./snap-lab.html) · [单关卡验收台](../review.html) |
| 大地图联调 | 查滨海撤离布局、道路测试用例、Three.js 实机验收和场景截图。 | [布局图](./driving-demo/layout.png) · [测试清单](./driving-demo/测试清单.md) · [实机验收](./driving-demo/ThreeJS实机验收.md) · [场景审查记录](../shots/evac/inspection/审查记录.md) |

### 消防局关卡档案

| 要回答的问题 | 对应资料 |
|---|---|
| 关卡有哪些机制、状态和灰盒布置要求？ | [关卡机制数据](./fire-station-mechanics/level_fire_station.jsonc) · [灰盒设计说明](./fire-station-mechanics/blockout_fire_station.md) |
| 设计图与实际搭建的空间如何对应？ | [关卡设计图](./fire-station-mechanics/station-design.svg) · [实建平面图](./fire-station-mechanics/station-as-built.png) |
| 到哪里试玩、核对建筑和复查验收项？ | [消防局试玩](../station.html) · [关卡验收清单与记录](./fire-station-mechanics/acceptance_fire_station.md) · [建筑结构验收记录与截图说明](./fire-station-mechanics/structure/验收记录.md) |
| 各房间的资产放在哪里，怎样核对？ | [13 张布局图与实景](../public/assets/station-rooms/index.html) · [美术试玩与工坊订单](../station.html?play=1) · [室内资产布置记录](./fire-station-mechanics/室内资产布置.md) |
| 已保存的关卡构件如何核对？ | [布局与宿主定义](../src/world/placements/station-layout.js) · [已保存的放置数据](../src/world/placements/saved.json) · [放置校验脚本](../tools/station-placement-audit.mjs) |

### 关卡研究原稿

以下相对链接指向同级研究仓库 RA2_-。项目采用的交互尺寸和机制规则查本页开头的专项规范。

- 大地图尺度、区域与单关卡之间的关系见[西雅图裂城地图设计研究](../../RA2_-/研究/地图设计-西雅图裂城-v1.0.md)和[大地图与关卡规范研究](../../RA2_-/研究/TLOU-REA-大地图与关卡规范.md)。
- 复核机制设计方法、交互物分类及尺寸估算的来源时，查[关卡机制设计研究原稿](../../RA2_-/研究/关卡机制设计-AI执行手册-v1.0.md)和[交互物尺寸研究原稿](../../RA2_-/研究/TLOU2-交互物清单与尺寸规范-v1.0.md)。
