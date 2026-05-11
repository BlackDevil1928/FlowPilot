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
- [Module Deep Dive](#-module-deep-dive)
- [State Machine](#-state-machine)
- [Installation](#-installation)
- [Usage](#-usage)
- [Button States](#-button-states)
- [Technical Details](#-technical-details)
- [Reliability](#-reliability--edge-cases)
- [Security & Safety](#-security--safety)
- [Browser Compatibility](#-browser-compatibility)
- [Future Roadmap](#-future-roadmap-v20)
- [Contributing](#-contributing)

---

## 😤 The Problem

You're deep into a long Claude conversation. Claude is generating a complex, multi-part response. Then suddenly:

> **"You are out of free messages until 2:50 AM"**

Claude stops mid-generation. Your response is incomplete. You have two bad options:

1. **Stay up until 2:50 AM** — manually return, click continue, hope it finishes
2. **Give up** — lose the incomplete response and restart tomorrow

Both suck. Especially when the limit might hit *again* during the continuation.

---

## 💡 The Solution

**FlowPilot** is a Chrome Extension that automates the entire retry cycle:

1. **Detect** the limit message automatically
2. **Extract** the retry time (2:50 AM)
3. **Schedule** a Chrome alarm to fire at that time
4. **Reopen** your chat and click "Continue generating"
5. **Repeat** if the limit hits again
6. **Stop** only when the response is fully complete

**You click one button. Then go to sleep.** FlowPilot handles everything.

---

## 🔄 How It Works

```
┌─────────────────────────────────────────────────────────┐
│                    YOU ARE CHATTING                      │
│                                                         │
│   You: "Explain quantum computing in detail..."         │
│                                                         │
│   Claude: "Quantum computing is a paradigm that..."     │
│           "... the qubit can exist in superposition..."  │
│           "... using Hadamard gates to—"                 │
│                                                         │
│   ╔═══════════════════════════════════════════════════╗  │
│   ║ ⚠ You are out of free messages until 2:50 AM     ║  │
│   ╚═══════════════════════════════════════════════════╝  │
│                                                         │
│                    ┌──────────┐                          │
│                    │ 🔥 ICON  │ ← You click this ONCE   │
│                    └──────────┘                          │
│                         │                               │
│                    YOU GO TO SLEEP 😴                    │
│                                                         │
│   ┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐  │
│   │  FlowPilot works silently in the background...  │  │
│   │                                                  │  │
│   │  2:51 AM → reopens chat                         │  │
│   │  2:51 AM → clicks "Continue generating"         │  │
│   │  2:52 AM → Claude resumes writing...            │  │
│   │  2:55 AM → limit hits again? → re-schedules     │  │
│   │  3:51 AM → reopens, continues again             │  │
│   │  4:10 AM → response fully complete ✅            │  │
│   └ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘  │
│                                                         │
│   YOU WAKE UP → FULL RESPONSE WAITING FOR YOU 🎉       │
└─────────────────────────────────────────────────────────┘
```

---

## 🎯 Core Flow

```
Claude generating response
        │
        ▼
Limit message appears:
"You are out of free messages until 2:50 AM"
        │
        ▼
User clicks extension icon ONCE
        │
        ▼
Extension extracts time: 2:50 AM
        │
        ▼
Converts to future timestamp
(handles AM/PM, next-day rollover)
        │
        ▼
Creates Chrome alarm (survives browser restart)
        │
        ▼
Shows countdown ring on icon: 47:23... 47:22...
        │
        ▼
At 2:51 AM (+ 90s safety buffer):
  ├── Reopen stored Claude chat URL
  ├── Wait for page to fully load
  ├── Find "Continue generating" button
  │     ├── Found? → Click it
  │     └── Not found? → Type "continue" + Enter
  └── Monitor generation...
        │
        ├── ✅ Generation completes
        │     └── DONE! Green check badge appears.
        │
        └── ⏰ Limit appears AGAIN
              └── Extract new time → Schedule new alarm
                  └── REPEAT automatically (no user action needed)
```

---

## 🏗 Architecture

### High-Level Overview

```
┌──────────────────────────────────────────────────────────────┐
│                     CHROME BROWSER                           │
│                                                              │
│  ┌─────────────────────┐     ┌────────────────────────────┐  │
│  │  BACKGROUND LAYER   │     │      CONTENT LAYER          │  │
│  │  (Service Worker)   │     │      (claude.ai page)       │  │
│  │                     │     │                              │  │
│  │  ┌───────────────┐  │     │  ┌────────────────────────┐ │  │
│  │  │ Alarm Manager │  │◄────┤  │   FlowPilot Controller │ │  │
│  │  │               │  │     │  │   (content.js)          │ │  │
│  │  │ • create alarm│  │────►│  │                          │ │  │
│  │  │ • fire alarm  │  │     │  │  ┌──────────────────┐   │ │  │
│  │  │ • open tabs   │  │     │  │  │ Limit Detector   │   │ │  │
│  │  │ • recover on  │  │     │  │  │ (MutationObserver)│   │ │  │
│  │  │   restart     │  │     │  │  └──────────────────┘   │ │  │
│  │  └───────────────┘  │     │  │  ┌──────────────────┐   │ │  │
│  │                     │     │  │  │ Resume Engine     │   │ │  │
│  │  ┌───────────────┐  │     │  │  │ (click/type)     │   │ │  │
│  │  │ chrome.storage│◄─┼─────┤  │  └──────────────────┘   │ │  │
│  │  │   .local      │  │     │  │  ┌──────────────────┐   │ │  │
│  │  │               │──┼─────►  │  │ Completion       │   │ │  │
│  │  │ Shared state  │  │     │  │  │ Detector         │   │ │  │
│  │  └───────────────┘  │     │  │  └──────────────────┘   │ │  │
│  └─────────────────────┘     │  │  ┌──────────────────┐   │ │  │
│                              │  │  │ Button Injector  │   │ │  │
│  ┌─────────────────────┐     │  │  │ (floating icon)  │   │ │  │
│  │    POPUP LAYER      │     │  │  └──────────────────┘   │ │  │
│  │                     │     │  └────────────────────────┘ │  │
│  │  Status dashboard   │     │                              │  │
│  │  Cancel / Reset     │     │  ┌────────────────────────┐ │  │
│  │  Retry count        │     │  │ Time Parser  │ Helpers  │ │  │
│  └─────────────────────┘     │  └────────────────────────┘ │  │
│                              └────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

### Communication Flow

```
┌─────────────┐  chrome.runtime   ┌──────────────┐
│   Content    │  .sendMessage()   │  Background   │
│   Script     │ ───────────────►  │  Service      │
│              │                   │  Worker       │
│  "Schedule   │                   │               │
│   alarm for  │                   │  Creates      │
│   2:50 AM"   │                   │  chrome.alarm │
│              │                   │               │
│              │  chrome.tabs      │  Alarm fires  │
│   Receives   │  .sendMessage()   │  at 2:51 AM   │
│  "TRIGGER    │ ◄───────────────  │               │
│   RESUME"    │                   │  Opens/focuses│
│              │                   │  chat tab     │
└─────────────┘                   └──────────────┘
        │                                │
        └────── chrome.storage.local ────┘
                 (shared state)
```

---

## 📁 File Structure

```
Claude_resume/
│
├── manifest.json                    # Extension configuration (Manifest V3)
│
├── icons/
│   ├── icon.png                     # Original high-res icon
│   └── icon128.png                  # Extension icon (toolbar + floating button)
│
├── src/
│   ├── background/
│   │   └── service-worker.js        # ⏰ Alarm scheduling, tab management
│   │                                #    Fires at retry time, opens chat tab
│   │                                #    Recovers state on browser restart
│   │
│   ├── content/
│   │   ├── content.js               # 🎯 Main orchestrator
│   │   │                            #    Wires all modules, manages lifecycle
│   │   │                            #    Event-driven state transitions
│   │   │
│   │   ├── limit-detector.js        # 👁 MutationObserver-based scanner
│   │   │                            #    Watches for limit messages in DOM
│   │   │                            #    Text-based (no fragile selectors)
│   │   │
│   │   ├── completion-detector.js   # ✅ Multi-heuristic completion check
│   │   │                            #    Spinner detection, button scanning
│   │   │                            #    30-second DOM stability threshold
│   │   │
│   │   └── resume-engine.js         # 🔄 Automation engine
│   │                                #    Strategy: click button → fallback: type
│   │                                #    Human-like delays with random jitter
│   │
│   ├── storage/
│   │   └── state-manager.js         # 💾 Persistent state (chrome.storage.local)
│   │                                #    Survives restarts, SW suspension
│   │
│   ├── ui/
│   │   └── button-injector.js       # 🔘 Floating icon button
│   │                                #    Icon-only, countdown ring, state badges
│   │                                #    Self-heals on React re-renders
│   │
│   ├── utils/
│   │   ├── time-parser.js           # 🕐 Regex time extraction
│   │   │                            #    AM/PM handling, next-day rollover
│   │   │                            #    90-second safety buffer
│   │   │
│   │   └── helpers.js               # 🛠 DOM utilities
│   │                                #    Sleep with jitter, element polling
│   │                                #    Human-like typing simulation
│   │
│   └── styles/
│       └── floating-button.css      # 🎨 Icon button styles
│                                    #    Glassmorphism, state glows
│                                    #    SVG countdown ring, badges
│
├── popup/
│   ├── popup.html                   # 📊 Status dashboard markup
│   ├── popup.js                     # 📊 Dashboard state display + controls
│   └── popup.css                    # 📊 Premium dark theme styles
│
└── README.md                        # 📖 This file
```

---

## 🔬 Module Deep Dive

### 1. Limit Detector (`limit-detector.js`)

**How it finds the limit message without fragile CSS selectors:**

```
MutationObserver (watches document.body)
        │
        ▼
Debounced scan (300ms) ← prevents thrashing on rapid React updates
        │
        ▼
Scan document.body.innerText for known phrases:
  • "out of free messages until"
  • "you've reached your free message limit"
  • "usage limit reached"
  • "limit resets at"
  • "try again at"
        │
        ▼
Found match? → Extract surrounding 200 chars for context
        │
        ▼
Pass to TimeParser → callback to Controller
```

### 2. Time Parser (`time-parser.js`)

```
Input:  "You are out of free messages until 2:50 AM"
                                            │
                                            ▼
Regex:  /(\d{1,2}:\d{2}\s*[APap][Mm])/  →  "2:50 AM"
                                            │
                                            ▼
Convert:  2:50 AM  →  hours=2, minutes=50, AM
                                            │
                                            ▼
Build Date:  today at 02:50:00
                                            │
          ┌─────────────────────────────────┤
          ▼                                 ▼
   Time is future?               Time already passed?
   Use as-is                     Add 1 day (next-day rollover)
          │                                 │
          └─────────────┬───────────────────┘
                        ▼
              Add 90-second buffer
              (don't fire too early)
                        │
                        ▼
Output: { timeStr: "2:50 AM", timestamp: 1736834490000 }
```

### 3. Resume Engine (`resume-engine.js`)

```
RESUME SEQUENCE
        │
        ▼
Wait 3-5 seconds (random) ← let React hydrate
        │
        ▼
Strategy 1: Find button by visible text
  Search: "continue generating" → "continue" → "resume" → "try again"
        │
  ┌─────┴──────┐
  ▼            ▼
Found?       Not found?
Click it     │
  │          ▼
  │     Strategy 2: Type fallback
  │       Find textarea (ProseMirror / contenteditable)
  │       Type "continue" (using execCommand for React compat)
  │       Click send button or press Enter
  │          │
  └────┬─────┘
       ▼
  Monitor with CompletionDetector...
```

### 4. Completion Detector (`completion-detector.js`)

```
Polling every 2 seconds:
        │
        ├── Is limit banner visible?
        │     YES → return false (limit hit again)
        │
        ├── Is stop button / spinner visible?
        │     YES → still generating, reset stability timer
        │
        ├── Is "Continue generating" button visible?
        │     YES → not done yet, reset stability timer
        │
        └── Has text content changed since last check?
              YES → still streaming, reset stability timer
              NO  → increment stable duration
                    │
                    └── Stable for 30+ seconds?
                          YES → return true (COMPLETE! ✅)
```

### 5. Service Worker (`service-worker.js`)

```
ALARM LIFECYCLE
        │
        ├── Content script sends SCHEDULE_ALARM
        │     └── chrome.alarms.create("flowpilot-resume", { when: timestamp })
        │
        ├── Alarm fires
        │     ├── Set state → RESUMING
        │     ├── Find existing Claude tab OR create new one
        │     ├── Wait for tab to load (+ 3s React buffer)
        │     └── Send TRIGGER_RESUME to content script
        │
        ├── Browser restart?
        │     └── onStartup listener → recover pending alarm from storage
        │
        └── Extension update?
              └── onInstalled listener → recover pending alarm from storage
```

---

## 🔄 State Machine

```
                  ┌────────────────┐
                  │                │
                  │     IDLE       │ ← Initial state / after reset
                  │  (icon only)   │
                  │                │
                  └───────┬────────┘
                          │
              Limit message detected
                          │
                          ▼
                  ┌────────────────┐
                  │                │
                  │ LIMIT_DETECTED │ ← Amber glow + alert dot
                  │                │   User sees the icon pulsing
                  │                │
                  └───────┬────────┘
                          │
                User clicks icon
                          │
                          ▼
                  ┌────────────────┐
                  │                │
                  │   SCHEDULED    │ ← Green countdown ring
                  │                │   mm:ss badge ticking down
                  │  (alarm set)   │   User can go to sleep
                  │                │
                  └───────┬────────┘
                          │
              Alarm fires at retry time
                          │
                          ▼
                  ┌────────────────┐
                  │                │
                  │   RESUMING     │ ← Blue glow + spinning icon
                  │                │   Clicking continue / typing
                  │                │
                  └───────┬────────┘
                          │
              ┌───────────┼───────────┐
              │           │           │
              ▼           ▼           ▼
         ┌────────┐ ┌──────────┐ ┌────────┐
         │  DONE  │ │  LIMIT   │ │ ERROR  │
         │   ✅   │ │  AGAIN   │ │  ❌    │
         │        │ │   ⏰     │ │        │
         └───┬────┘ └────┬─────┘ └───┬────┘
             │           │           │
             ▼           ▼           ▼
          ┌──────┐   Back to      Retry in
          │ IDLE │   LIMIT_       60 seconds
          └──────┘   DETECTED
                     (auto-
                      schedules)
```

### State Persistence

All state is stored in `chrome.storage.local`:

| Key | Type | Description |
|-----|------|-------------|
| `car_state` | string | Current state (idle/limit_detected/scheduled/resuming/completed) |
| `car_autoMode` | boolean | True after first click — enables automatic re-scheduling |
| `car_retryTime` | number | Timestamp (ms) when alarm should fire |
| `car_retryTimeDisplay` | string | Human-readable time ("2:50 AM") |
| `car_chatUrl` | string | Full URL of the Claude chat to reopen |
| `car_retryCount` | number | How many retries have been performed |

---

## 🚀 Installation

### Step 1: Download

```bash
git clone https://github.com/yourusername/flowpilot-claude-auto-resume.git
```

Or download as ZIP and extract.

### Step 2: Open Chrome Extensions

1. Open Chrome
2. Navigate to `chrome://extensions/`
3. Enable **Developer mode** (toggle in top-right corner)

### Step 3: Load the Extension

1. Click **"Load unpacked"**
2. Select the `Claude_resume` folder (the one containing `manifest.json`)
3. FlowPilot appears in your extensions bar

### Step 4: Visit Claude

1. Go to [claude.ai](https://claude.ai)
2. You'll see the FlowPilot icon floating near the bottom-right
3. That's it — it's ready and watching

---

## 🎮 Usage

| Step | What Happens |
|------|-------------|
| **1** | Chat with Claude normally |
| **2** | Claude hits the free message limit mid-generation |
| **3** | FlowPilot detects the limit → icon starts **pulsing amber** |
| **4** | **Click the icon once** |
| **5** | Countdown ring appears → shows `mm:ss` until retry |
| **6** | **Go to sleep / do other things** |
| **7** | FlowPilot automatically reopens chat and resumes at retry time |
| **8** | If limit hits again → automatically re-schedules (no action needed) |
| **9** | When generation fully completes → green ✓ badge appears |

### Popup Dashboard

Click the FlowPilot icon in Chrome's toolbar to see:

- 📊 Current status (Idle / Scheduled / Resuming / Done)
- ⏰ Scheduled retry time
- 🔢 Total retry count
- 🔗 Link to active chat
- 🛑 Cancel / Reset buttons

---

## 🔘 Button States

| State | Visual | Meaning |
|-------|--------|---------|
| **Idle** | Icon only, subtle border | Ready and watching. No limit detected yet. |
| **Limit Detected** | Amber glow + pulsing dot | Limit found! Click to activate auto-resume. |
| **Scheduled** | Green countdown ring + `mm:ss` badge | Alarm set. Counting down to retry time. |
| **Resuming** | Blue glow + spinning icon | Actively resuming the conversation. |
| **Completed** | Green ✓ badge | All done! Response fully generated. |

---

## 🔧 Technical Details

### Why These Design Choices?

| Decision | Why |
|----------|-----|
| **`chrome.alarms`** instead of `setTimeout` | Survives service worker suspension and browser restarts. `setTimeout` dies when the SW sleeps. |
| **`chrome.storage.local`** instead of variables | Persists across page refreshes, tab closures, and browser restarts. |
| **MutationObserver** instead of polling DOM | Event-driven, efficient. Fires only when DOM changes. |
| **Text scanning** instead of CSS selectors | React re-renders change class names and DOM structure. Text content is stable. |
| **90-second buffer** after limit reset | Claude's servers may not be instantly ready at the exact reset time. Buffer ensures success. |
| **Human-like delays** (base + random jitter) | Avoids detection as automated behavior. Each action has 200-500ms of natural variation. |
| **Namespace pattern** (`window.CAR`) | All content script modules share execution context. No bundler needed. Zero build step. |
| **Button self-healing** (MutationObserver) | React's virtual DOM can remove injected elements. Observer re-injects if the button disappears. |

### Manifest V3 Compliance

```json
{
  "manifest_version": 3,
  "permissions": ["alarms", "storage", "tabs", "activeTab"],
  "host_permissions": ["https://claude.ai/*"],
  "background": { "service_worker": "..." },
  "web_accessible_resources": [{ "resources": ["icons/*"], "matches": ["https://claude.ai/*"] }]
}
```

- ✅ Service worker (not persistent background page)
- ✅ Declarative permissions (minimal required set)
- ✅ Web-accessible resources for content script icon access
- ✅ No remote code execution

---

## 🛡 Reliability & Edge Cases

| Scenario | How FlowPilot Handles It |
|----------|-------------------------|
| **Browser restart** | `onStartup` listener recovers pending alarm from storage |
| **Extension update** | `onInstalled` listener recovers pending alarm |
| **Service worker sleeps** | `chrome.alarms` wakes it up — no `setTimeout` dependency |
| **React re-renders remove button** | MutationObserver on `document.body` re-injects the button |
| **Tab closed before alarm fires** | Background creates a new tab with stored chat URL |
| **"Continue generating" button missing** | Falls back to typing "continue" in the textarea |
| **Textarea is ProseMirror (contenteditable)** | Uses `document.execCommand('insertText')` for React compatibility |
| **Limit hits again after resume** | Auto-mode stays enabled → automatically re-schedules |
| **Time is "2:50 AM" but it's already 3 AM** | Next-day rollover: schedules for 2:50 AM tomorrow |
| **Page not fully loaded** | Waits 3-5s for React hydration before attempting actions |
| **Multiple Claude tabs open** | Finds and reuses existing tab with matching URL |
| **Resume fails completely** | Schedules a retry in 60 seconds |

---

## 🔒 Security & Safety

- 🌐 **Only operates on `claude.ai`** — host_permissions are locked to this domain
- 🐢 **Human-like delays** — all interactions include randomized timing (not robotic)
- 🚫 **No data collection** — zero telemetry, no analytics, no external requests
- 💾 **No conversation data stored** — only stores: state, retry time, chat URL
- ⚡ **Lightweight** — no background polling, event-driven architecture
- 🔐 **No remote code** — all logic runs locally, no `eval()`, no dynamic imports

---

## 🌐 Browser Compatibility

| Browser | Support | Notes |
|---------|---------|-------|
| **Chrome** | ✅ Full | Primary target. Load as unpacked extension. |
| **Edge** | ✅ Full | Chromium-based. Same installation method. |
| **Brave** | ✅ Full | Chromium-based. Same installation method. |
| **Firefox** | ✅ Compatible | Add `browser_specific_settings.gecko.id` to manifest. Submit to AMO. |
| **Safari** | ❌ No | Different extension format. Would need separate build. |

---

## 🔮 Future Roadmap (v2.0)

| Feature | Description |
|---------|-------------|
| 📊 **Retry Analytics** | Track success rates, average wait times, total sessions |
| 💬 **Multi-Chat Support** | Monitor and resume across multiple conversations |
| 📋 **Export Logs** | Download resume history as JSON/CSV |
| 🧠 **Smart Continuation** | Context-aware prompts instead of generic "continue" |
| 📜 **Resume History** | Browsable log of past auto-resume sessions |
| 🔔 **Notifications** | Desktop alerts on completion ("Your response is ready!") |
| ⚙️ **Settings Panel** | Customize buffer time, delays, retry behavior |
| 📱 **Firefox Add-on** | Publish on Firefox Add-ons Marketplace |
| 🎨 **Themes** | Customizable button appearance and position |
| 🧪 **Health Check** | Self-diagnostic to verify extension is working correctly |

---

## 🤝 Contributing

Contributions welcome! Areas that could use help:

1. **Testing on different Claude plan types** — behavior may vary
2. **Localization** — Claude may show limit messages in other languages
3. **Accessibility** — screen reader support for button states
4. **Firefox testing** — verify compatibility on Firefox 109+

---

## 📄 License

MIT — free for personal and commercial use.

---

<div align="center">

**Built with ❤️ for everyone who's ever been interrupted by a message limit.**

*FlowPilot is not affiliated with Anthropic or Claude.*

</div>
