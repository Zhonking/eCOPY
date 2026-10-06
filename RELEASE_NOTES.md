# Release Notes

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
