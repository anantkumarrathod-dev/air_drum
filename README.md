# 🥁 Air Drum • Visual Drum Stick Hand-Coordination Studio

A high-performance interactive drum training studio and air-drumming motion tracking application built with **React**, **TypeScript**, **Tailwind CSS**, and the **Web Audio API / Web MIDI API**.

![Air Drum Studio](https://img.shields.io/badge/Status-Production%20Ready-emerald)
![License](https://img.shields.io/badge/License-MIT-blue)

---

## 🌟 Key Features

- 📹 **Air Drumming Motion Tracking**: Real-time camera motion tracking with color-coded strike zones for drumsticks and index fingers.
  - **Left Zone (Cyan)**: Snare Drum, Hi-Hat, Cymbals, Rack Toms.
  - **Right Zone (Orange)**: Floor Tom, Bass Drum (Kick).
- 🥁 **Acoustic Drum Kit Visualizer**: Photorealistic 5-piece acoustic drum set cockpit with lowest center Bass Drum for single-handed finger drumming and dual-stick practice.
- 🛣️ **Rhythm Highway**: Guitar Hero-style vertical waterfall lane visualizer with real-time early/perfect/late hit feedback.
- 🔌 **Web MIDI E-Kit Support**: Plug & Play zero-latency support for USB electronic drum sets (Roland, Alesis, Yamaha, Behringer).
- 🎙️ **Acoustic Practice Pad Mic Detector**: Practice on real rubber practice pads or tabletops using microphone transient analysis.
- 🥋 **Gamified Drummer Belt Ladder**: 6 Belt Ranks (White Belt $\rightarrow$ Black Belt) with XP progression, streaks, and trophies.
- 🔀 **Polyrhythms & Limb Independence**: Drills for 3:2 Hemiolas, 4:3 Cross-Rhythms, and Ostinatos.
- 📱 **Zero-Scroll & Tablet Optimized**: Designed with strict `100dvh` responsive zero-scroll UI for tablets and desktops.

---

## 🚀 Quick Start

### 1. Installation
```bash
git clone https://github.com/anantkumarrathod-dev/air_drum.git
cd air_drum
npm install
```

### 2. Development Server
```bash
npm run dev
```

### 3. Build Single-File Production Bundle
```bash
npm run build
```

---

## 🎮 Keyboard Controls

| Hand / Function | Keys | Assigned Instruments |
| :--- | :--- | :--- |
| **Left Stick / Hand 2** | `D`, `F` | Snare Drum, Hi-Hat, Cymbals, Rack Toms |
| **Right Stick / Hand 1** | `J`, `K` | Floor Tom, Bass Drum (Kick) |
| **Start / Pause** | `Space` | Toggle Playback |
| **Restart** | `🔄 Button` | Rewind to Bar 1 / Step 0 |

---

## 🌐 GitHub Pages Deployment

This repository includes a GitHub Actions workflow that automatically builds and deploys the latest version to GitHub Pages on every push to the `main` branch.

To enable GitHub Pages:
1. Go to your repository **Settings** $\rightarrow$ **Pages**.
2. Under **Build and deployment** $\rightarrow$ **Source**, select **GitHub Actions**.
3. Your app will be live at:
   `https://anantkumarrathod-dev.github.io/air_drum/`

---

## 📄 License
MIT License. Built with ❤️ for drummers & musicians worldwide.
