# Release Notes

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
