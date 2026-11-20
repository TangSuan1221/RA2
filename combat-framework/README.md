# 战斗系统实施工程

原始需求快照：`spec/`；决议：`DECISIONS.md`；资源来源与重建：`ASSETS.md`；独立审查：`../docs/combat-review.md`。

```powershell
npm run dev -- --host 127.0.0.1
# 浏览器访问 http://127.0.0.1:5173/combat.html
node --test --test-isolation=none combat-framework/tests/*.test.mjs
npm run build
```

鼠标左键近战，右键瞄准；瞄准时左键射击。WASD 移动、Shift 冲刺、C 蹲、Z 入卧／起身、Space 闪避、Q 重击、F 招架、E 处决／环境通行、R 换弹、H 治疗、G 投掷、V 换肩、Tab 调试。Esc 释放鼠标并暂停。

`src/` 不依赖 Three.js。生产骨骼姿态来自 ANIM，由固定 60Hz 逻辑采样、上下身合成、惯性化和足部 IK；渲染仅插值最终姿态，命中使用同一骨骼 FK。运动匹配读取离线白化 PCA/KDTree MMDB，并对候选进行原始特征加权精算。

**本工程尚未完成全套复刻，不能作为已验收交付。** 虽然真实移动采样已超过6000帧，已接入基础三角形BVH胶囊和俯卧动作，仍缺完整环境交互、双人动作、全部敌人类型、完整脚滑与控制器性能验收等；已知差异及测试证据持续记录，不能用单元测试通过替代实机及目录验收。
