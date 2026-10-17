# Release Notes

## v1.5.5 — 2026-10-17

### Highlights

- **区间首末照片预览弹窗** — 在向导中**添加源卡/文件夹**或**点选拍摄日期**时，弹出该选择区间内第一张与最后一张照片的预览：显示文件名与拍摄时间，确认选对了素材再继续
- **JPG 直接显示，RAW 用内嵌略缩图** — 边界照片是 JPG 时直接输出原图；存在同文件名 JPG（RAW+JPG 双格式拍摄）时优先使用 JPG；纯 RAW（NEF/NRW/ARW/CR2/CR3/RAF/ORF/RW2/PEF/DNG/X3F/INSP）则自动提取文件内嵌的 JPEG 预览图显示

### Improvements

- 新增 `/api/thumb` 接口：JPG 直出、RAW 用原生扫描提取「最大 FFD8FF…FFD9 区段」内嵌预览（无需第三方依赖，各家 RAW 通用），带内存缓存避免重复解析
- 弹窗内图片加载失败时优雅降级为「无法生成预览」文字；点击遮罩或 ✕ 关闭
- 边界判定按文件名自然排序（相机命名即时间序）；三语文案；前端缓存号 v35

### Downloads

| 文件 | 大小 | SHA256 |
|---|---|---|
| `eCOPY Setup 1.5.5.exe`（NSIS 安装版） | 78.4 MB | `3AEC1D0E5831439BDD182D88082A628374B4F5C2BCA9ECAAAD0FC91D8CF75374` |
| `eCOPY 1.5.5.exe`（便携版） | 78.2 MB | `D8581A58CF819585FFE500897E720D0BF6586E91FFD065584038D99EA2F18445` |

> Windows 10/11 x64。SMART 温度监控需管理员权限运行（应用内可一键提权重启）。

---

## v1.5.5 — English

### Highlights

- **Boundary-photo preview popup** — adding a source card/folder or picking a shooting date in the wizard now pops up the first and last photo of that selection range, with filename and timestamp — confirm the right footage before you continue
- **JPGs show directly, RAWs use embedded thumbnails** — JPG boundaries stream as-is; a stem-matched JPG sibling (RAW+JPG shooting pairs) wins when present; pure RAW files (NEF/NRW/ARW/CR2/CR3/RAF/ORF/RW2/PEF/DNG/X3F/INSP) fall back to their embedded JPEG preview

### Improvements

- New `/api/thumb` endpoint: JPGs served directly, RAW previews extracted by scanning for the largest FFD8FF…FFD9 span (works across every RAW flavour, zero dependencies) with an in-memory cache
- Failed image loads degrade gracefully to a "no preview" note; close via backdrop or ✕
- Boundaries follow natural filename sort (camera naming is chronological); trilingual copy; cache v35

### Downloads

See the table above for SHA256 checksums. Windows 10/11 x64; SMART temperature monitoring requires running as administrator (one-click elevated restart inside the app).

---

## v1.5.4 — 2026-10-11

### Highlights

- **新增 DJI（大疆）识别** — `DJI_` 前缀素材（DJI_0001.MP4 / DJI_0123.JPG 等，DJI 无人机、Osmo、Ronin 系列）与 `DCIM/1xxDJI` 目录结构自动识别为 DJI 卡，插卡即提示「DJI 大疆」，片段序号自动解析
- **新增 Nikon（尼康）识别** — `.NEF` / `.NRW` RAW 素材、`DCIM/100NIKON`、`DCIM/1xxNCxx`（100NCZ8 / 100NCD850 等 Z 系列与单反目录）及 `100___NI` 布局全部识别，`DSC_` / `DSCN` / `NC1_` 片段号自动解析
- **再补 7+ 个品牌** — GoPro（DCIM/1xxGOPRO）、Fujifilm（.RAF / 100_FUJI）、Olympus/OM（.ORF / 100OLYMP）、Sony α 照片卡（.ARW / 100MSDCF）、Canon 照片（.CR2 / .CR3）、Panasonic Lumix（.RW2）、Pentax（.PEF）、Sigma（.X3F）、Insta360（.INSV / .INSP）

### Improvements

- **照片与 RAW 计入媒体素材** — JPG / DNG / 各家 RAW 现在与视频一样进入素材列表、按拍摄日期筛选与统计；摄影+视频混合卡（无人机/微单）可整卡筛选拷贝
- 识别规则维持「强信号优先」：品牌专属文件与目录结构优先，RAW 扩展名次之，最后回退通用 DCF；原有 ARRI / RED / Sony / BMD / Canon / Panasonic 识别不受影响（回归通过）
- 插卡自动检测（probeCard）同步受益，新品牌插卡即弹提示

### Downloads

| 文件 | 大小 | SHA256 |
|---|---|---|
| `eCOPY Setup 1.5.4.exe`（NSIS 安装版） | 78.4 MB | `1E607092B4B6A0E6C85B2D4113CFB4BEA9C822E5FD9F6BF19905DE830F368D77` |
| `eCOPY 1.5.4.exe`（便携版） | 78.1 MB | `324E4A42C83E6B9EE147F10AAE25DE64F7DB2225F7FA93B7FAC09CB777FE37A0` |

> Windows 10/11 x64。SMART 温度监控需管理员权限运行（应用内可一键提权重启）。

---

## v1.5.4 — English

### Highlights

- **DJI detection** — cards with `DJI_`-prefixed clips (drones, Osmo, Ronin) or `DCIM/1xxDJI` folders are recognised as DJI on insertion, with clip numbers parsed automatically
- **Nikon detection** — `.NEF` / `.NRW` RAWs, `DCIM/100NIKON`, `DCIM/1xxNCxx` (100NCZ8 / 100NCD850 — Z & DSLR layouts) and `100___NI` structures all identify as Nikon; `DSC_` / `DSCN` / `NC1_` clip numbers parsed
- **Seven more brands** — GoPro (1xxGOPRO), Fujifilm (.RAF / 100_FUJI), Olympus/OM (.ORF), Sony α photo cards (.ARW / 100MSDCF), Canon stills (.CR2/.CR3), Panasonic Lumix (.RW2), Pentax (.PEF), Sigma (.X3F) and Insta360 (.INSV/.INSP)

### Improvements

- **Stills & RAW count as media** — JPG / DNG / vendor RAWs now join clips, the shooting-date filter and totals; hybrid photo+video cards (drones, mirrorless) can be filtered and offloaded as a whole
- Detection keeps strong-signals-first ordering (brand files & folders → RAW extensions → generic DCF); existing ARRI / RED / Sony / BMD / Canon / Panasonic detection is unchanged (regression-tested)
- Card-insert auto-probe benefits automatically — new brands announce themselves on insertion

### Downloads

See the table above for SHA256 checksums. Windows 10/11 x64; SMART temperature monitoring requires running as administrator (one-click elevated restart inside the app).

---

## v1.5.3 — 2026-10-11

### Highlights

- **磁盘连接协议标签** — 磁盘页物理盘名称旁新增连接协议徽标（NVMe / SATA / SAS / USB / CSMI / RAID，取自 smartctl 检测的设备类型，悬停显示「连接协议」说明）；一眼区分内置 NVMe、SATA 硬盘与读卡器桥接的 USB 卡
- **卷与向导同步显示** — 整盘卷（如摄影机卡）按容量匹配到对应物理盘时，磁盘页卷行与向导「检测到的卡」卡片也会带协议标签；CFE-B 卡在读卡器里读作 NVMe，拷卡前即可确认连接形态。分区卷（如系统 C:）容量与整盘不符、不匹配时则正确地不显示

### Improvements

- 新增共享工具 `protocolLabel()` / `matchPhysicalForVolume()`（lib.js），协议显示名映射与 ±2% 容量匹配在磁盘页、向导两处复用；向导原有 SMART 匹配逻辑并入共享实现
- 三语（中/日/英）「连接协议」悬停文案；前端缓存号 v34

### Downloads

| 文件 | 大小 | SHA256 |
|---|---|---|
| `eCOPY Setup 1.5.3.exe`（NSIS 安装版） | 78.4 MB | `F560BBF8D6266FCE334084F5CF50A54A0DBCD690ADF67C037367AE46293D81A2` |
| `eCOPY 1.5.3.exe`（便携版） | 78.1 MB | `9FE2CB16494660DBA258E9CB808E4FA46429EE8B07CC6A9B59CB1CFF361FACE9` |

> Windows 10/11 x64。SMART 温度监控需管理员权限运行（应用内可一键提权重启）。

---

## v1.5.3 — English

### Highlights

- **Disk connection-protocol tags** — physical disks on the Disks page now show a protocol badge next to their name (NVMe / SATA / SAS / USB / CSMI / RAID, from the smartctl device type; hover explains "Connection protocol") — tell internal NVMe, SATA drives and USB-bridged cards apart at a glance
- **Volumes & wizard in sync** — whole-disk volumes (camera cards) capacity-matched to their physical disk also show the tag on the Disks page volume rows and the wizard's detected cards; a CFE-B card in a reader reads as NVMe, visible before you offload. Partitioned volumes (e.g. C:) correctly show nothing when no disk matches

### Improvements

- New shared helpers `protocolLabel()` / `matchPhysicalForVolume()` in lib.js — the protocol mapping and ±2% capacity matching are reused by both the Disks view and the wizard; the wizard's SMART matching now rides the same implementation
- Trilingual hover copy; front-end cache version v34

### Downloads

See the table above for SHA256 checksums. Windows 10/11 x64; SMART temperature monitoring requires running as administrator (one-click elevated restart inside the app).

---

## v1.5.2 — 2026-10-11

### Highlights

- **拷卡动画重做为「光轨」** — 用一条极简光轨取代此前的列车山景全场景：一条细轨、一颗随进度前行的发光梭舱（绿色品牌条纹 + 头灯 + 速度拖尾）、随**真实拷贝速度**流动的轨道刻度、蓝→绿进度填充、右侧终点圆环到站亮起并扩散脉冲。画面元素从十余种降到四种，安静、克制、一目了然
- **保留全部原有动效机制** — 视觉速度 ∝ 拷贝速度、起步加速/到站减速、校验阶段画面永不冻结（爬行速度下限）、3 秒最短可读动画（快速小拷贝也能完整呈现）、到站绿色脉冲后舞台平滑收起

### Improvements

- 动画舞台高度 200px → 172px、百分比字号微调，整体更紧凑；上方保留稀疏漂浮光点与整体氛围背景呼应
- 动画代码量减半（约 500 行 → 260 行），绘制开销更低；对 `prefers-reduced-motion` 与窗口遮挡的既有处理不变
- 前端缓存号 v33

### Downloads

| 文件 | 大小 | SHA256 |
|---|---|---|
| `eCOPY Setup 1.5.2.exe`（NSIS 安装版） | 78.4 MB | `44967E68B526A660CAC700DD16E6457E943F4E5A093CEF8EFB22760CC3D094B9` |
| `eCOPY 1.5.2.exe`（便携版） | 78.1 MB | `3639573450D30165EA567DFC3682111B0939340A395B60BF1DBB7AAEC94E0C62` |

> Windows 10/11 x64。SMART 温度监控需管理员权限运行（应用内可一键提权重启）。

---

## v1.5.2 — English

### Highlights

- **Copy animation rebuilt as "LightRail"** — the full landscape train scene is replaced by one minimal light rail: a thin track, a glowing shuttle whose position mirrors progress (green brand stripe, headlight, speed trail), rail ticks that flow at the **real copy speed**, a blue→green progress fill, and a destination ring that lights up with an expanding pulse on arrival. A dozen scene elements are down to four — calm, restrained, instantly readable
- **Every motion mechanic kept** — visual speed ∝ copy speed, departure acceleration / arrival deceleration, never-freeze crawl during verify, the 3-second minimum readable journey, and the smooth stage exit after the arrival pulse

### Improvements

- Stage height 200px → 172px with a slightly smaller percentage — a tighter, quieter block; sparse drifting motes remain in the upper half to echo the ambient background
- Animation code roughly halved (~500 → ~260 lines) with lower draw cost; reduced-motion and window-occlusion handling unchanged
- Front-end cache version v33

### Downloads

See the table above for SHA256 checksums. Windows 10/11 x64; SMART temperature monitoring requires running as administrator (one-click elevated restart inside the app).

---

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
