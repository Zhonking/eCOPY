# Release Notes

## v1.5.1 — 2026-10-11

### Highlights

- **向导第一步全面重构** — 检测到的卡与驱动器改为可点选卡片：名称 · 盘符、容量条、文件系统、剩余空间一目了然，可移动卡按容量匹配显示 SMART 温度/健康徽标；点击即添加为源卡（再点移除），新增「刷新检测」按钮与最后检测时间
- **已选源摘要面板** — 右侧新增常驻摘要：源卡 chips（可单独移除）、文件数、总大小、预估拷贝时长、类型分布堆叠条（按扩展名统计大小占比），选择即时反馈
- **拖放添加源卡** — 添加框文案改为「点击浏览，或将文件夹拖到此处」，支持整文件夹拖入（多选可一次添加多张）；通过 preload webUtils 适配 Electron ≥32 的拖放路径解析
- **步骤条实用化** — 已完成步骤可点击直接回退；步骤 2/3 悬停显示当前摘要（已选目标与模板 / 文件数与总大小）

### Improvements

- 「继续」按钮禁用态明确化：降低透明度 + not-allowed 光标 + 悬停提示「请先选择源卡/目标盘」；底部操作栏改为「上一步/重置 + 当前已选摘要 + 继续」三段式
- 标题、步骤条、「源卡只读」安全徽标合并为一行，节省纵向空间；安全说明从灰字升级为绿色 🔒 常驻徽标
- 侧边栏「已连接」状态移至顶栏药丸；空状态新增「存储卡 → 硬盘」线稿插图（呼吸动画）
- 每张源卡显示预估拷贝时长；三语（中/日/英）文案同步；前端缓存号 v32

### Downloads

| 文件 | 大小 | SHA256 |
|---|---|---|
| `eCOPY Setup 1.5.1.exe`（NSIS 安装版） | 78.4 MB | `9289B748B2D738AF4BF5240B7BF13E69DCE3C4C9E9964549089C76554D14880D` |
| `eCOPY 1.5.1.exe`（便携版） | 78.1 MB | `30BBE8BD1A80BBD3AC20B2E5F046F07036AAA180CD8DB4393B583A708E4DFBF1` |

> Windows 10/11 x64。SMART 温度监控需管理员权限运行（应用内可一键提权重启）。

---

## v1.5.1 — English

### Highlights

- **Step 1 rebuilt** — detected cards & drives are now clickable cards: label · mount, capacity bar, filesystem and free space at a glance; removable cards matched by capacity show SMART temperature/health badges. Click to add as a source (click again to remove), plus a "Rescan" button and last-scan time
- **Selected-sources panel** — a live summary on the right: removable source chips, file count, total size, estimated copy time and a type-mix stacked bar (size share by extension) — instant feedback as you pick
- **Drag-and-drop sources** — the add tile now reads "Click to browse, or drop a folder here" and accepts dropped folders (multi-drop supported); drop paths resolve via preload webUtils for Electron ≥32
- **A stepper that works** — completed steps are clickable shortcuts back; hovering steps 2/3 previews the current selection (targets & template / files & size)

### Improvements

- The "Next" button has an explicit disabled state (dimmed, not-allowed cursor, hover hint "Select a source card first"); the footer bar is now back/reset + live selection summary + next
- Title, stepper and the "sources read-only" safety badge share one row; the safety note is now a green 🔒 badge instead of grey text
- The sidebar "connected" status moved into a topbar pill; empty states get a breathing "card → drive" line illustration
- Per-source estimated copy time; trilingual copy (zh/ja/en); front-end cache version v32

### Downloads

See the table above for SHA256 checksums. Windows 10/11 x64; SMART temperature monitoring requires running as administrator (one-click elevated restart inside the app).

---

## v1.5.0 — 2026-10-11

### Highlights

- **全新动态环境背景** — 五层舞台式动态场景：极光色带（蓝/青/紫三色缓慢漂移）+ 三颗柔光光斑 + 全局工程网格（从开屏延伸至整个应用）+ 上升星尘粒子 + 边缘暗角。所有动效周期均在 20 秒以上、低对比度，是氛围而非干扰；高对比主题自动关闭全部背景，亮色主题自动柔化
- **磨砂玻璃质感界面** — 顶栏、侧边栏、卡片、选择卡、弹窗、抽屉、通知气泡全面升级为半透明磨砂玻璃（backdrop-blur），卡片带顶部高光描边与环境光阴影，透过卡片可隐约看到流动的极光
- **页面切换过渡** — 导航切换视图时内容逐项错峰淡入上移（staggered entrance），页面之间不再生硬跳变

### Improvements

- 输入框 focus 光环（3px 柔和蓝晕）、hover 边框反馈；按钮 hover 上浮、全部交互控件新增键盘 focus-visible 焦点环，键盘可达性更好
- 进度条新增流光扫过动画（含悬浮窗进度条），「数据在移动」一目了然
- 页头新增 kiosk 风格蓝色竖条标记；导航项 hover 微位移；空状态图标呼吸动画
- 文本选中色、滚动条悬停反馈细化；开屏 SYSTEM BOOT 版本标识更新为 V1.5

### Downloads

| 文件 | 大小 | SHA256 |
|---|---|---|
| `eCOPY Setup 1.5.0.exe`（NSIS 安装版） | 78.3 MB | `958BED9E0EF7D06B32F01EB2156632ACC8F2B05DA035BCF2041546CE5AFE0AD4` |
| `eCOPY 1.5.0.exe`（便携版） | 78.1 MB | `9DDF3030CD79EA71096A8A7073E009E6092C67A7C7DADCE436AFB25F39ACCCCF` |

> Windows 10/11 x64。SMART 温度监控需管理员权限运行（应用内可一键提权重启）。

---

## v1.5.0 — English

### Highlights

- **All-new ambient scene** — a five-layer stage: aurora bands (blue / cyan / purple, slowly drifting) + three soft orbs + a global engineering grid (now extending beyond the splash into the whole app) + rising star dust + an edge vignette. Every motion runs on 20s+ periods at low contrast — atmosphere, not distraction. The high-contrast theme disables the scene entirely; the light theme softens every layer
- **Frosted-glass interface** — top bar, sidebar, cards, pick cards, modals, drawers and toasts are now translucent frosted glass (backdrop-blur) with a top highlight edge and ambient shadows; the flowing aurora glows faintly through every surface
- **View transitions** — navigating between views staggers content in with a soft fade-and-rise, instead of a hard swap

### Improvements

- Inputs get a 3px focus halo and hover borders; buttons lift on hover; every interactive control gains a keyboard focus-visible ring for better keyboard accessibility
- Progress bars gain a sweeping shimmer (floating window included) — "data is moving" at a glance
- Kiosk-style accent rail on page headers; subtle nav hover slide; breathing empty-state icons
- Text selection color and scrollbar hover feedback refined; splash SYSTEM BOOT tag updated to V1.5

### Downloads

See the table above for SHA256 checksums. Windows 10/11 x64; SMART temperature monitoring requires running as administrator (one-click elevated restart inside the app).

---

## v1.4.1 — 2026-10-11

### Highlights

- **悬浮窗设置开关** — 设置页新增「悬浮进度窗」区块：可一键开启/关闭后台运行时的桌面悬浮进度窗。关闭后关闭主窗口或点击「后台运行」时仅保留系统托盘图标，不再弹出悬浮窗；托盘菜单中的「显示悬浮窗」仍可随时手动打开
- **默认开启、向后兼容** — 升级后保持原有行为（悬浮窗开启）；老版本设置文件自动补全默认值，无需手动迁移

### Improvements

- 顶层布尔设置项现由设置页直接收集保存（checkbox 取值修复），后续新增开关类设置更简单
- 主窗口顶栏「后台运行」按钮提示更新，说明悬浮窗显示与否由设置决定
- 前端静态资源缓存版本号升级（v30），确保升级后浏览器不残留旧版设置页

### Downloads

| 文件 | 大小 | SHA256 |
|---|---|---|
| `eCOPY Setup 1.4.1.exe`（NSIS 安装版） | 78.3 MB | `E9BCE3AAA1B8B94C954B8FCDBDF77D437B525B7E0C697C4F59EB656D2A775A6D` |
| `eCOPY 1.4.1.exe`（便携版） | 78.1 MB | `3E2C7DD77A6FEB006FC474A39052A2156A5AAA3080A6A40D5A223D19328E9F90` |

> Windows 10/11 x64。SMART 温度监控需管理员权限运行（应用内可一键提权重启）。

---

## v1.4.1 — English

### Highlights

- **Floating window setting** — new "Floating progress window" section in Settings: toggle the desktop floating progress window shown in background mode. When off, closing the main window or clicking "Background" keeps only the system tray icon — no floating overlay; "Show floating window" in the tray menu still opens it manually at any time
- **On by default, backward compatible** — existing behavior is preserved after upgrading (floating window enabled); older settings files are automatically merged with the new default, no manual migration needed

### Improvements

- Top-level boolean settings are now collected directly by the settings page (checkbox value fix), making future toggle-style settings simpler
- The "Background mode" top-bar button tooltip now reflects that the floating window follows the setting
- Front-end static asset cache version bumped (v30) so upgraded browsers never keep a stale settings page

### Downloads

See the table above for SHA256 checksums. Windows 10/11 x64; SMART temperature monitoring requires running as administrator (one-click elevated restart inside the app).

---

## v1.4.0 — 2026-10-06

### Highlights

- **多任务并行拷卡** — 引擎原生支持同时发起多个拷卡任务，每个任务独立后台运行，互不阻塞；任务页可查看全部并发任务的实时进度
- **关窗后台运行** — 有拷卡任务进行时关闭主窗口，应用不退出：主窗口隐藏、转入系统托盘，拷卡继续在后台执行；无任务时关闭才真正退出
- **桌面悬浮进度窗** — 无边框、置顶、可拖拽的桌面悬浮窗，实时显示**拷卡总进度**（运行任务数、总百分比、聚合速度、剩余时间 ETA），并提供「显示主窗口」与「退出（停止所有任务）」按钮
- **系统托盘** — 托盘菜单支持「显示主窗口」「显示悬浮窗」「退出」，后台运行时从托盘即可快速召回或安全退出

### Improvements

- 新增 `/api/aggregate` 端点与 `engine.getAggregate()`，聚合所有运行中任务的总字节、已拷贝字节、速度与 ETA
- 主窗口顶栏新增「后台运行」按钮，一键转入后台并显示悬浮窗
- IPC 新增 `app:show-floating / hide-floating / restore-main / quit-now / running-count / background-mode`

### Fixed

- 修复多任务场景下聚合统计遗漏的问题，所有 `running` 状态任务均被纳入总量计算

### Downloads

| 文件 | 大小 | SHA256 |
|---|---|---|
| `eCOPY Setup 1.4.0.exe`（NSIS 安装版） | 78.3 MB | `D3BE9615C2FEFFE30CDE648FE2142CE674D91E79C5C3845CF71A9AE53637611B` |
| `eCOPY 1.4.0.exe`（便携版） | 78.1 MB | `8C15E5D1218B91FBB4FAC12CD30127AB0FD11B90A8B2D0861B61A3010340C76A` |

> Windows 10/11 x64。SMART 温度监控需管理员权限运行（应用内可一键提权重启）。

---

## v1.4.0 — English

### Highlights

- **Parallel multi-job offload** — the engine natively supports starting multiple offload jobs at once; each runs independently in the background without blocking. The Jobs page shows live progress of every concurrent job
- **Keep running after closing the window** — when jobs are running, closing the main window hides it and sends the app to the system tray instead of quitting; copying continues in the background. The app only quits on close when no jobs are running
- **Desktop floating progress window** — a frameless, always-on-top, draggable overlay that shows the **aggregate offload progress** in real time (number of running jobs, total percentage, combined speed, ETA), with "Show main window" and "Quit (stop all jobs)" buttons
- **System tray** — tray menu offers "Show main window", "Show floating window" and "Quit"; quickly recall or safely exit the app while it runs in the background

### Improvements

- New `/api/aggregate` endpoint and `engine.getAggregate()` aggregating total bytes, copied bytes, speed and ETA across all running jobs
- New "Background mode" button in the main window top bar — one click to hide the window and show the floating overlay
- New IPC handlers: `app:show-floating / hide-floating / restore-main / quit-now / running-count / background-mode`

### Fixed

- Fixed aggregate stats missing some jobs in multi-job scenarios; all `running` jobs are now counted

### Downloads

See the table above for SHA256 checksums. Windows 10/11 x64; SMART temperature monitoring requires running as administrator (one-click elevated restart inside the app).

---

## v1.3.0 — 2026-09-26

### Highlights

- **列车行驶拷卡动画** — 开始拷贝时列车起步加速，世界随真实拷贝速度流动（视觉速度 ∝ 拷贝速度），停止时减速进站；含视差山景、速度线、车头灯束与高速残影。动画全程流畅不冻结：场景滚动由速度积分驱动，即使校验阶段进度停滞，画面依然保持流动
- **全局动态背景** — 三颗缓动光斑为整个应用增添含蓄的科技感氛围（高对比主题下自动关闭）
- **历史任务管理** — 支持单条删除与一键「清空已完成」，均带确认弹窗；运行中任务受保护不可删除，API 层双重校验
- **强制动画最短时长** — 拷贝动画保证至少 3 秒完整呈现（smootherstep 坡道），快速小文件拷贝不再一闪而过
- **机场自助终端风格 UI** — 深蓝配色、开屏系统自检动画、三语界面（简体中文 / 日本語 / English）

### Improvements

- 提示气泡（Toast）移至右上角，入场动画改为自上滑入
- 拷贝进度映射更合理：拷贝 0–92%，回读校验 92–100%，只有全部校验通过才到 100%
- 站台元素移除，动画更纯粹聚焦列车与世界

### Fixed

- 修复启动任务接口阻塞整任务时长的问题——向导点击「开始」后立即跳转任务页（原先需等拷贝完成才跳转）
- 修复快速任务时进度一度超过 100% 的显示错误
- 修复窗口被遮挡时进度条停滞（不再依赖 requestAnimationFrame 平滑）
- 修复拷卡动画在内容溢出时被压缩至消失（flex 布局不再压缩动画区域）
- 修复「以管理员身份重启」无响应的问题

### Downloads

| 文件 | 大小 | SHA256 |
|---|---|---|
| `eCOPY Setup 1.3.0.exe`（NSIS 安装版） | 77.9 MB | `DF96E5C647B8D686D5A19221787A1F7CC2F302E2A330A142DBE310A120AF9264` |
| `eCOPY 1.3.0.exe`（便携版） | 77.7 MB | `8F0417B7B08EB27CB9C1E2E8F4588D085B684A42931FE89E87B7078B1BBA079A` |

> Windows 10/11 x64。SMART 温度监控需管理员权限运行（应用内可一键提权重启）。

---

## v1.3.0 — English

### Highlights

- **Train journey copy animation** — the train accelerates on departure, the world flows at a speed proportional to the real copy rate, and it decelerates into the station when copying finishes. Parallax scenery, speed lines, headlight beam and a high-speed motion trail included. The scene scrolls via velocity integration so it never freezes — even when the verify phase stalls progress
- **Ambient animated background** — three slowly orbiting light orbs add a subtle tech feel (disabled in high-contrast theme)
- **Job history management** — delete single jobs or clear all finished ones, with confirmation dialogs; running jobs are protected at both UI and API level
- **Guaranteed minimum animation duration** — the copy animation always plays for at least 3 seconds (smootherstep ramp), so quick small-card copies are no longer over in a flash
- **Airport kiosk style UI** — deep navy palette, system-boot splash, trilingual interface (简体中文 / 日本語 / English)

### Improvements

- Toast notifications moved to the top-right corner
- Better progress mapping: copy = 0–92%, read-back verification = 92–100%; 100% only after every target passes
- Removed platform elements for a purer train-and-world scene

### Fixed

- Fixed the start-job API blocking for the whole job duration — the wizard now jumps to the job page instantly
- Fixed displayed progress exceeding 100% on fast jobs
- Fixed the progress HUD stalling when the window was occluded (no longer relies on requestAnimationFrame)
- Fixed the copy animation being squeezed out of view when content overflowed (flex layout no longer compresses it)
- Fixed the unresponsive "Restart as administrator" action

### Downloads

See the table above for SHA256 checksums. Windows 10/11 x64; SMART temperature monitoring requires running as administrator (one-click elevated restart inside the app).
