# 室外继续开发记录 · 2026-11-19

## 实施
- city_vista：新增破损前景混凝土墙、外露弯曲钢筋；修复首轮墙底与碎块悬空、侧面UV拉伸；两栋中景楼改用现有Poly Haven扫描立面；增加实体藤蔓及中景树冠；加强远景层次；调整镜头。三档草LOD和不可见楼背面剔除将19.17M三角面降至14.37M。
- street_tlou：保留阴天hero，新增shot=golden。低角度右后暖太阳、晴天天空、较淡雾、团簇草侵占、落叶泥土层、三棵路缘树。经过三轮改进，修正草叶过宽、背面黑片、稀疏单根问题。
- 全部复用已有Poly Haven及ez-tree资源，没有新下载资源。

## 实际GPU截图
1600×900，Chrome WebGPU，最终日志全部为空。

| 场景 | 文件 | GPU ms | 绘制调用 | 三角面（含多pass） |
|---|---|---:|---:|---:|
| 城市远景 | city_final.jpg | 3.02 | 282 | 14,372,551 |
| 黄金街道 | street_final.jpg | 6.73 | 560 | 16,439,151 |

街道三角面仍高于15M预算，GPU时间低于10ms。当前首屏着色器编译可能需要60–90秒，ready之后约60fps不代表首屏加载快。诊断脚本禁用Vite HMR，避免其他Agent写文件导致截图重新加载。

## 质量结论
**未达到1:1或3A通过线。** 独立评审确认改进但仍指出：远景重复窗格、城市草坪构图偏离参考4；街道车辆造型和损坏纹理仍显程序化；前景积水与路面不够真实；光影分布仍不同于参考3。

亮度和饱和度测量见measurements.json。黄金街道亮度p10/p50/p90为17/42/161，参考为28/80/233；城市为51/89/149，参考为5/68/200。统计揭示差距，不能代替审图。

## 入口
- ?scene=street_tlou&shot=golden
- ?scene=city_vista&shot=hero

新增/改动代码：src/scenes/street_tlou.js、src/scenes/city_vista.js、src/city_vista/{atmos,city,grass,reclamation,ruin}.js。语法检查通过。主Agent负责最终全项目build及集成。
