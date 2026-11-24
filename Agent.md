# Agent.md · 《归零法则 · ZERO AXIOM》项目上下文摘要

## 1. 项目概况
- **项目名称**：《归零法则 · ZERO AXIOM》（极简瑞士几何印刷风 HTML5 Canvas 肉鸽生存游戏）
- **项目路径**：`D:\归零法则`（原目录曾为 `D:\小球肉鸽`）
- **技术栈**：纯原生 HTML / CSS / JavaScript（无构建工具，直接由 `<script>` 按序加载）；测试使用 Node.js 内置 `node:test` + `vm` 沙盒。

## 2. 核心文件结构
- [index.html](index.html)：页面结构，包含画布 `#game`、局内 `#hud`、标题页 `#screenTitle`（含更新公告面板）、升级/遗物选卡 `#screenLevel`、暂停 `#screenPause`、合成图鉴 `#screenCodex`、结算 `#screenOver`、战绩档案 `#screenHistory`。
- [css/style.css](css/style.css)：全局样式、暖白纸面主题变量与 HUD/卡片/图鉴/弹窗/分析面板样式。
- [js/utils.js](js/utils.js)：数学工具、数字格式化 `fmt` / `fmtTime`、颜色映射表 `PALETTE` 与 `palCol()` / `hexToRgb()` / `rgba()` / `shade()`。
- [js/config.js](js/config.js)：
  - `SKILL_TYPES`、`ARCHETYPES`（6 大流派）、`COMBOS`（6 种 Ⅳ阶双极叠加态）、`SKILLS`（26 个常规技能）、`ENDLESS_SKILLS`（4 个无尽超频模组）、`RELICS`（4 个 Boss 遗物）、`ORBS`（3 种初始球体）、`DIFFICULTIES`（3 个难度档位）。
  - 成长与刷怪曲线：`xpNeedFor`、`hpScaleAt`、`dmgScaleAt`、`spawnRateAt`、`threatAt`、`pickEnemyType`。
- [js/render.js](js/render.js)：
  - `Render.install(ctx)`：劫持主画布 `fillStyle` / `strokeStyle` setter，将逻辑色自动映射到 `PALETTE` 显示色，保证逻辑数据与测试断言不变。
  - `Render.ball()`：2× 超采样离屏缓存（柔和投影、体积渐变、底部反光、柔焦高光点）。
  - `Render.background()` / `Render.vignette()`：暖白制图纸渐变、世界锚定纸张颗粒 `grain()`、64px/320px 双层网格与坐标标记、屏幕暗角。
- [js/analytics.js](js/analytics.js)：单局遥测汇总 `buildRunSummary`、5 维游玩风格分析 `computeStyle`、称号判定、`localStorage`（`zero_axiom_history_v1`，上限 25 局）持久化与 SVG 雷达/趋势图渲染。
- [js/ui.js](js/ui.js)：所有界面渲染与状态同步（`renderOrbs`、`renderDifficulties`、`showLevelUp`、`showCodex` / `renderCodex`、`showOver` 风格画像、`showHistory` / `hideHistory`、`syncHud`、`syncDock` 等）。
- [js/game.js](js/game.js)：核心主循环、状态机（`menu` / `playing` / `paused` / `levelup` / `codex` / `win` / `dead`）、四阶进化与叠加态判定（`evaluateEvolution`、`resolveAceCombo`、`resolveCombo`）、遥测埋点（`Game.telemetry`）、碰撞与战斗逻辑（含穿透+弹射叠加态）、`render()` / `drawPlayer()` 等。
- [tests/combat_and_difficulty.test.js](tests/combat_and_difficulty.test.js)：17 项核心战斗、数值曲线、进化、UI 完整性与风格分析遥测测试。

## 3. 视觉与配色规范（已实装）
- **设计原则**：保留瑞士建筑制图纸 + 极简几何印刷风格，禁止修改游戏逻辑中的原始色值常量（部分测试硬编码校验 `#0055FF`、`#E63312`、`#FFB800`、`#111315`）。
- **显示映射**：通过 `js/utils.js` 中的 `PALETTE` + `palCol()` 与 `Render.install(ctx)` 在渲染与 UI `--accent` 注入时统一映射到更沉稳的印刷油墨色系（如 `#0055FF` → `#2B5CE6`、`#E63312` → `#E5482F`、`#111315` → `#1B1D23`、`#F26419` → `#F28A33` 等）。
- **UI 面板**：`--bg: #F3F0E8`、`--surface: #FFFEFB`、`--panel: rgba(255, 254, 251, 0.86)`、`--panel-shadow`，配合 `backdrop-filter: blur(10px) saturate(1.1)`。
- **备份**：初始画面优化前的文件备份位于 `_backup_before_visual/`（若需对比或回滚可参考）。
- **已知待细化项**：网格交点坐标在负象限会显示为 `-1.-1`，可按需改为 `−1 / −1` 或移除；标题页/升级卡片/结算页的卡片质感可进一步统一。

## 4. 核心玩法与合成图鉴机制
- **六大流派与四阶进化**（`ARCH_THRESHOLDS`: `stage1: 1`, `stage2: 10`, `stage3: 20`, `capLocked: 19`, `MAX_ULTIMATES: 2`）：
  - 流派：`xianxia`（国风仙侠）、`norse`（北欧神话）、`xuanhuan`（东方玄幻）、`arcane`（英式奥术）、`billiard`（台球物理）、`exact_zero`（数字法则）。
  - 技能提供 `+2pt`（核心）或 `+1pt`（辅助），Boss 遗物提供 `+3pt` 催化。
  - 每局最多锁定 2 条 Ⅲ阶流派，其余流派上限封顶 `19pt`。
- **Ⅳ阶双极叠加态**：任意 2 条流派均达到 Ⅲ阶（20pt）时自动融合：
  - 6 种专属融合（`COMBOS`）：红莲业火剑仙（仙侠×玄幻）、九霄雷罚剑域（仙侠×北欧）、诸神雷霆保龄（北欧×台球）、奇点坍缩开球（玄幻×台球）、所罗门分光剑阵（奥术×仙侠）、宿命同调矩阵（奥术×归零）。
  - 其余任意双 Ⅲ阶组合触发通用「双极共鸣」（双形态同步释放 +35% 全局伤害）。
- **合成图鉴（`#screenCodex`）**：
  - 入口：标题页 `合成图鉴` 按钮（`#btnCodexTitle`）、局内 HUD 右上角 `图` 按钮（`#btnCodexHud`）、暂停页 `合成图鉴` 按钮（`#btnCodexPause`），全局快捷键 `C` 开关、`Esc` 关闭。
  - 双页签：`Ⅳ阶 · 双极叠加态 (6)`（实时显示本局激活/差多少 pt/槽位已满）与 `六大流派 · 进化与模组`（各阶路线、专属搭档、技能与遗物列表）。
  - 持久化：`localStorage` key `zero_axiom_codex_v1` 记录历史达成过的 Ⅲ阶流派与 Ⅳ阶叠加态。

## 5. 数值膨胀、专修与游玩风格分析系统
- **数值与流派节奏约定**：
  - 开局全流派单发起步，微尘起步经每 5 级「核心跃迁（CORE TIER）」与升级乘区递进膨胀至十万/百万级。
  - 功法修炼路径为 `5~10` 级（含中阶质变与大成机制质变），抽卡池 `rollSkills` 对已修未满级功法保底至少 1 槽；穿透与弹射同时持有时触发「弹穿叠加态」（穿透期间同步分叉弹射，弹射后重充 1 次穿透）。
- **遥测与游玩风格分析（[js/analytics.js](js/analytics.js)）**：
  - `Game.telemetry` 实时采集：伤害拆解（`dmgPrimary` / `dmgSub` / `dmgBilliard` / `dmgExactZero` / `dmgOverkill`）、峰值秒伤 `peakDps`、最高暴击 `maxCritDmg`、移动与站桩时长（`moveDist` / `idleTime`）、技能释放 `skillCasts`、信标占领 `beaconsCaptured`、承伤/回复与构筑顺序。
  - 五维风格雷达（0~100）：`侵略`、`机动`、`操控`、`法则`、`坚韧`，并据此判定风格称号（`台球物理学家`、`数字处刑官`、`大成专修宗师`、`信标猎手`、`极速游侠`、`自动阵列师`、`阵地重炮台`、`均衡探索者`）。
  - UI 与持久化：`localStorage` key `zero_axiom_history_v1` 保存最近 `25` 局；结算页 `#overAnalysis` 展示本局 vs 生涯均值雷达对比与伤害占比条，标题页 `#btnHistory` 打开 `#screenHistory` 查看生涯总览、近 10 局存活趋势与战报列表。

## 6. 本地预览与测试命令
- **本地启动预览**（浏览器直接打开 `file://` 会被安全策略拦截，需起本地 HTTP 服务）：
  ```powershell
  cd D:\归零法则
  python -m http.server 8765 --bind 127.0.0.1
  ```
  然后访问 `http://127.0.0.1:8765/index.html`。
- **运行自动化测试**：
  ```powershell
  cd D:\归零法则
  node --test tests/combat_and_difficulty.test.js
  ```
