# eCOPY — Professional Camera-Card Offload

简体中文 | [English](./README_EN.md)

**Multi-target verified copy · Safe to Format · Auditable reports**

eCOPY is professional offload software for film and video production sets: it copies camera-card media to multiple destination drives simultaneously and performs an **independent read-back verification** on every target. The **Safe to Format** signal is shown only after all targets pass — eliminating data-loss accidents by process, not by habit.

## Key Features

### Data Safety
- **Source cards are strictly read-only** — nothing is ever written back to the card
- **Independent read-back verification** — verification never relies on hashes computed during the copy; every byte is re-read from each target and compared (xxHash64)
- **Safe to Format trust signal** — the green "SAFE TO FORMAT" banner appears only when every target has fully passed verification; a single tampered byte is detected and flips the banner to a red warning
- **Incremental resume** — interrupted jobs can be retried: verified files are kept and only failed legs are re-copied, then re-verified in full

### Workflow
- **Three-step wizard** — pick source card → pick targets & folder template → confirm and start
- **Multi-target concurrent copy** — write to several drives at once, each leg with its own progress, speed and status
- **Folder templates** — variables `{project} · {date} · {camera} · {reel} · {operator} · {volume} · {scene}`; organized by `Project/Date/Camera/Reel` by default
- **Automatic camera-card detection** — recognizes cards and reels from ARRI / RED / Sony / Blackmagic / Canon and more
- **Conflict policy** — "fail with warning (safest)" by default, or "keep both, rename new file"
- **Job history management** — every offload is auditable; delete individual jobs or clear finished ones in one click (running jobs are protected)

### Reports & Audit
- Per-target **ASC MHL** (Media Hash List), **CSV** and **HTML** reports generated automatically
- Checksums, paths, operator and timeline recorded — ready for set delivery and audit
- Safe eject flow and an explicit "Allow Formatting" confirmation

### System Monitoring
- Volume list, free space and physical drive health (SMART)
- SMART temperature monitoring (requires administrator privileges on Windows — one-click elevated restart from within the app)

### User Experience
- Deep-navy "airport self-service kiosk" style UI with a system-boot splash animation
- **Train journey copy animation**: the train accelerates on departure, the world flows at a speed proportional to the real copy speed, and it decelerates on arrival
- Ambient animated background, top-right toast notifications, trilingual UI (简体中文 / 日本語 / English)

## Architecture

```
┌─────────────────────────────────────────────┐
│  Electron Shell (electron/main.cjs)         │
│    ├─ Zero-dependency backend               │  ← port 5218
│    │    ├─ engine.js    copy/verify engine  │
│    │    ├─ checksum.js  xxHash64            │
│    │    ├─ reports.js   ASC MHL / CSV / HTML│
│    │    ├─ disks.js     volumes / SMART     │
│    │    ├─ cameras.js   card detection      │
│    │    └─ store.js     job store (JSON)    │
│    └─ Frontend    public/ (vanilla JS + SSE)│
└─────────────────────────────────────────────┘
```

- **Backend**: Node.js (≥ 18.15) ESM with **zero npm dependencies** — copy, hashing, reporting and SSE are all built on native modules
- **Frontend**: framework-free vanilla JS with real-time progress/log/event updates over SSE
- **Packaging**: electron-builder → Windows NSIS installer + portable build

## Getting Started

### Run from source

```bash
npm install
npm start          # backend + web UI → http://localhost:5218
npm run electron   # run as an Electron desktop app
```

### Build the Windows installer

```bash
npm run dist       # output in dist/: NSIS setup + portable exe
```

### Self-test

```bash
npm test           # scripts/selftest.js
```

## Usage

1. **New Offload** — cards are detected automatically once inserted; select the source
2. **Choose target drives and folder template**, fill in project / operator
3. **Start verified copy** — copying covers 0–92% of the progress bar, read-back verification 92–100%; format the card only after reaching 100% with all targets green

> ⚠️ Best practice: format cards in the camera. "Safe to Format" in eCOPY means your data is safely on all target drives.

## Platform Support

| Feature | Windows | macOS / Linux |
|---|---|---|
| Copy + verification + reports | ✅ | ✅ (from source) |
| SMART temperature / safe eject | ✅ | ❌ (Windows APIs) |

## License

Copyright © XUEZHIZHONG. All rights reserved. Reproduction, distribution or modification of this software without authorization is not permitted.
