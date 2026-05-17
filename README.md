# ⚡ FlowPilot — Claude Auto Resume

<div align="center">

**Automatically resumes Claude.ai conversations when free message limits hit.**
**Set it once. It handles the rest.**

![Chrome](https://img.shields.io/badge/Chrome-Extension-4285F4?style=for-the-badge&logo=googlechrome&logoColor=white)
![Manifest V3](https://img.shields.io/badge/Manifest-V3-34A853?style=for-the-badge)
![Status](https://img.shields.io/badge/Status-Production_Ready-00C853?style=for-the-badge)
![License](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge)

</div>

---

## 📋 Table of Contents

- [Problem](#-the-problem)
- [Solution](#-the-solution)
- [How It Works](#-how-it-works)
- [Core Flow](#-core-flow)
- [Architecture](#-architecture)
- [File Structure](#-file-structure)
- [State Machine](#-state-machine)
- [Installation](#-installation)
- [Usage](#-usage)
- [Button States](#-button-states)
- [Technical Details](#-technical-details)
- [Security & Safety](#-security--safety)
- [Browser Compatibility](#-browser-compatibility)

---

> [!IMPORTANT]
> **Internet Connection Required**: FlowPilot requires an active internet connection to monitor Claude.ai and resume conversations. It does not work offline.

---

## 😤 The Problem

You're deep into a long Claude conversation. Claude is generating a complex, multi-part response. Then suddenly:

> **"You are out of free messages until 2:50 AM"**

Claude stops mid-generation. Your response is incomplete. You have two bad options:

1. **Stay up until 2:50 AM** — manually return, type "continue", and hope it finishes.
2. **Give up** — lose your train of thought and restart tomorrow.

Both options break your workflow. Especially when the limit might hit *again* during the continuation.

---

## 💡 The Solution

**FlowPilot** is a Chrome Extension that automates the entire retry cycle with precision control:

1. **Detects** the limit message automatically.
2. **Alerts** you with a pulsing icon.
3. **Asks** you exactly what command to send next (e.g., "continue the code").
4. **Schedules** a background alarm to fire when the limit resets.
5. **Persists** across tab and browser closures by tracking the unique Chat UUID.
6. **Reopens** your exact chat and sends your custom command automatically.
7. **Repeats** silently if the limit hits again.

**You set it once. Then step away.** Even if you close Chrome, FlowPilot handles the waiting game.

---

## 🔄 How It Works

```text
┌─────────────────────────────────────────────────────────┐
│                    YOU ARE CHATTING                     │
│                                                         │
│   You: "Write a comprehensive React application..."     │
│                                                         │
│   Claude: "Here is the code..."                         │
│           "const App = () => {"                         │
│           "  return ("                                  │
│                                                         │
│   ╔═══════════════════════════════════════════════════╗ │
│   ║ ⚠ You are out of free messages until 2:50 AM      ║ │
│   ╚═══════════════════════════════════════════════════╝ │
│                                                         │
│                    ┌──────────┐                         │
│                    │ 🟠 ICON  │ ← Pulses to alert you   │
│                    └──────────┘                         │
│                         │                               │
│                 User Clicks Icon                        │
│                         │                               │
│         ┌───────────────────────────────┐               │
│         │ What should I send?           │               │
│         │ [ continue the React code... ]│ ← Type cmd    │
│         │                    [Schedule] │               │
│         └───────────────────────────────┘               │
│                         │                               │
│                    YOU GO TO SLEEP 😴                   │
│                                                         │
│   ┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐       │
│      FlowPilot waits silently in the background...      │
│                                                         │
│      2:51 AM → reopens chat                             │
│      2:51 AM → types "continue the React code..."       │
│      2:52 AM → Claude resumes writing...                │
│      2:55 AM → limit hits again? → auto-reschedules     │
│      3:51 AM → reopens, sends your command again        │
│      4:10 AM → response fully complete ✅               │
│   └ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘       │
│                                                         │
│   YOU WAKE UP → FULL RESPONSE WAITING FOR YOU 🎉        │
└─────────────────────────────────────────────────────────┘
```

---

## 🎯 Core Flow

```text
Claude generating response
        │
        ▼
Limit message appears:
"You are out of free messages until 2:50 AM"
        │
        ▼
Extension detects limit → Icon pulses AMBER
        │
        ▼
User clicks extension icon ONCE
        │
        ▼
Input popup appears: "What should I send?"
User types command (e.g., "continue") & submits
        │
        ▼
Extension extracts time (2:50 AM), converts to timestamp
        │
        ▼
Creates Chrome alarm (survives browser restart)
Icon shows green countdown ring
        │
        ▼
At 2:51 AM (+ 90s safety buffer):
  ├── Reopen stored Claude chat URL
  ├── Wait for page to fully load
  ├── Type user's custom command + Enter
  └── Monitor generation...
        │
        ├── ✅ Generation completes
        │     └── DONE! Green check badge appears.
        │
        └── ⏰ Limit appears AGAIN
              └── Extract new time → Schedule new alarm
                  └── REPEAT automatically with same command
```

---

## 🏗 Architecture

### High-Level Overview

```text
┌──────────────────────────────────────────────────────────────┐
│                     CHROME BROWSER                           │
│                                                              │
│  ┌─────────────────────┐     ┌────────────────────────────┐  │
│  │  BACKGROUND LAYER   │     │      CONTENT LAYER         │  │
│  │  (Service Worker)   │     │      (claude.ai page)      │  │
│  │                     │     │                            │  │
│  │  ┌───────────────┐  │     │  ┌────────────────────────┐│  │
│  │  │ Alarm Manager │  │◄────┤  │ FlowPilot Controller   ││  │
│  │  │               │  │     │  │ (content.js)           ││  │
│  │  │ • create alarm│  │────►│  │                        ││  │
│  │  │ • fire alarm  │  │     │  │  ┌──────────────────┐  ││  │
│  │  │ • open tabs   │  │     │  │  │ Limit Detector   │  ││  │
│  │  │ • recover     │  │     │  │  └──────────────────┘  ││  │
│  │  └───────────────┘  │     │  │  ┌──────────────────┐  ││  │
│  │                     │     │  │  │ Resume Engine    │  ││  │
│  │  ┌───────────────┐  │     │  │  │ (reads cmd)      │  ││  │
│  │  │ chrome.storage│◄─┼─────┤  │  └──────────────────┘  ││  │
│  │  │   .local      │  │     │  │  ┌──────────────────┐  ││  │
│  │  │               │──┼─────►  │  │ Completion Det.  │  ││  │
│  │  │ Shared state  │  │     │  │  └──────────────────┘  ││  │
│  │  └───────────────┘  │     │  │  ┌──────────────────┐  ││  │
│  └─────────────────────┘     │  │  │ Button Injector  │  ││  │
│                              │  │  │ (floating icon + │  ││  │
│  ┌─────────────────────┐     │  │  │  input popup)    │  ││  │
│  │    POPUP LAYER      │     │  │  └──────────────────┘  ││  │
│  │                     │     │  └────────────────────────┘│  │
│  │  Status dashboard   │     │                            │  │
│  │  Active Command     │     │  ┌────────────────────────┐│  │
│  │  Cancel / Reset     │     │  │ Time Parser | Helpers  ││  │
│  └─────────────────────┘     │  └────────────────────────┘│  │
│                              └────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

---

## 📁 File Structure

```text
Claude_resume/
├── manifest.json        # Extension configuration (Manifest V3)
├── icons/               # Extension icons
├── src/                 # Background worker, content scripts, UI & utils
└── popup/               # Status dashboard HTML/CSS/JS
```
---

## 🚀 Installation

1. **Clone or Download** this repository.
2. Open Chrome and navigate to `chrome://extensions/`.
3. Enable **Developer mode** (toggle in top-right).
4. Click **"Load unpacked"** and select the `Claude_resume` folder.
5. Visit [claude.ai](https://claude.ai) — the icon will appear in the bottom right.

---

## ⚙️ Background Execution Setup

To ensure FlowPilot works even when you close the browser window, follow these steps:

1. Open Chrome **Settings**.
2. Go to **System** (usually on the left sidebar).
3. Toggle ON: **"Continue running background apps when Google Chrome is closed"**.
4. (Optional) Right-click the FlowPilot icon in your extensions toolbar and ensure it is **Pinned** for easy status monitoring.

> [!TIP]
> If this setting is OFF, FlowPilot will still work but will wait until you **re-open** Chrome to trigger the resume.

---

## 🎮 Usage

1. **Chat Normally**: Use Claude as you normally would. The FlowPilot icon sits quietly.
2. **Limit Hit**: When you run out of messages, the icon pulses **amber**.
3. **Activate**: Click the icon.
4. **Set Command**: A popup asks what message to send when the limit resets. Type your prompt (e.g., "continue the python script") and click **Schedule**.
5. **Close Everything**: You can close the tab, the window, or even quit Chrome. The green countdown ring indicates the background worker is active.
6. **Auto-Resume**: At the exact reset time, FlowPilot re-opens the specific chat using its unique **Chat UUID**, sends your message, and monitors the response.
7. **Multi-Cycle**: If the limit hits again during the resumption, FlowPilot **silently re-schedules** using your same command. No interaction needed until the task is complete!

---

## 🔘 Button States

| State | Visual | Meaning |
|-------|--------|---------|
| **Idle** | Icon only, subtle dark border | Watching for limits. Does nothing if clicked. |
| **Limit Detected** | Amber border + pulsing dot | Limit hit! Click to open the input popup. |
| **Scheduled** | Green countdown ring | Alarm set. Counting down to auto-resume. |
| **Resuming** | Blue border + spinning icon | Actively typing your command and waiting. |
| **Completed** | Green ✓ badge | All done! Response fully generated. |

---

## 🔧 Technical Details

- **`chrome.alarms`**: Used instead of `setTimeout` so the extension survives service worker suspension and browser restarts.
- **Manual Activation**: Extension only takes over when you explicitly submit a command, giving you full control.
- **Text-based Detection**: Scans the DOM for specific text phrases rather than relying on brittle CSS selectors that break when React updates.
- **Human-like Delays**: Typing speeds and click delays include randomized jitter to mimic genuine user interaction.
- **Auto-Looping**: Once activated, if Claude hits *another* limit during the same continuation, FlowPilot automatically re-schedules using your same custom command.

---

## 🔒 Security & Safety

- 🌐 **Restricted Domain**: Only operates on `claude.ai`.
- 💾 **Local Storage Only**: Commands and timestamps are stored in `chrome.storage.local`.
- 🚫 **No Analytics**: Zero telemetry, no data collection, no external API calls.
- 🐢 **Bot-Safe**: Uses organic interaction delays to prevent flagging.

---

## 🌐 Browser Compatibility

| Browser | Support | Notes |
|---------|---------|-------|
| **Chrome** | ✅ Full | Load as unpacked extension. |
| **Edge / Brave** | ✅ Full | Chromium-based. Same installation. |
| **Firefox** | ✅ Compatible | Add `browser_specific_settings.gecko.id` to `manifest.json`. |

---

<div align="center">
<b>Built for power users who refuse to let message limits break their flow.</b>
</div>
