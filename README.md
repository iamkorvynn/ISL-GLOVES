# Mitzy — Smart ISL Glove Companion 🧤✨

[![React Native](https://img.shields.io/badge/React%20Native-0.87.1-61DAFB?logo=react&logoColor=black)](https://reactnative.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9.3-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![BLE](https://img.shields.io/badge/Bluetooth-BLE%20ESP32-0082FC?logo=bluetooth&logoColor=white)](https://github.com/dotintent/react-native-ble-plx)
[![Platform](https://img.shields.io/badge/Platform-Android%20%7C%20iOS-A4C639?logo=android&logoColor=white)](https://android.com)

**Mitzy** is a smart Indian Sign Language (ISL) assistive mobile companion app. Designed to pair seamlessly with sensor-equipped smart gloves (ESP32-based), Mitzy translates complex sign language gestures into real-time text, dynamic visual subtitles, and natural spoken speech.

Whether in a quiet room or an active conversation, Mitzy bridges the gap between Deaf / Hard-of-Hearing individuals and non-signers with speed, accessibility, and calmness.

---

## 🌟 Key Features

- **⚡ Real-Time Gesture Recognition**
  - Instant decoding of flex-sensor and IMU orientation telemetry transmitted over Bluetooth Low Energy (BLE).
  - Intelligent token sanitization and debounce filtering (eliminates duplicate packet bursts from microcontroller loops).
  - Live confidence score indicators (High, Good, Check Gesture).

- **🗣️ Integrated Text-to-Speech (TTS)**
  - Automatically speaks recognized phrases aloud via `react-native-tts`.
  - Configurable speech rate (0.7x – 1.2x) and instant toggle for silent/conversation modes.

- **📱 Fullscreen Translation / Subtitle Mode**
  - High-contrast, large-font presentation mode for face-to-face conversations.
  - Keeps listener and signer aligned without visual clutter.

- **🎛️ 3-Step Sensor Calibration**
  - In-app interactive calibration flow:
    1. **Step 1:** Open Palm (Neutral 0.0V baseline)
    2. **Step 2:** Closed Fist (Maximum bend resistance)
    3. **Step 3:** Relaxed Rest Position

- **📋 Live Audit & Event Logging**
  - Timestamped chronological history for both recognized signs and system events (BLE connect/disconnect, battery alerts, calibrations).
  - Category filters (`All`, `Signs`, `System`) and verified event badges.

- **📊 Diagnostics & System Insights**
  - Live hardware monitoring, connection stability metrics, packet latency, and session analytics.

- **📳 Tactile Haptic Feedback**
  - Light and medium haptic responses via `react-native-haptic-feedback` on gesture detection and state changes.

- **🧪 Built-in Simulation Mode**
  - Test and demo full translation and voice pipelines without needing physical hardware connected.

---

## 🏗️ System Architecture & Hardware Specs

```
┌─────────────────────────┐          BLE GATT          ┌───────────────────────────┐
│       Smart Glove       │ ─────────────────────────> │     Mitzy Mobile App      │
│  • ESP32 Microcontroller│     Notifications (UTF-8)   │  • react-native-ble-plx   │
│  • 5x Flex Sensors      │                            │  • Gesture Debounce & TTS │
│  • MPU6050 6-DoF IMU    │                            │  • Audit Log & Subtitles  │
└─────────────────────────┘                            └───────────────────────────┘
```

### Bluetooth Low Energy (BLE) Contract

The app connects to any ESP32 device configured with the following GATT profile:

| Parameter | Value | Description |
| :--- | :--- | :--- |
| **Advertised Device Name** | `ISL_GLOVE` | Target peripheral name scanned by the app |
| **GATT Service UUID** | `12345678-1234-1234-1234-1234567890ab` | Main glove telemetry service |
| **Gesture Characteristic UUID** | `12345678-1234-1234-1234-1234567890cd` | Notifications enabled (`NOTIFY`) |
| **Data Format** | UTF-8 String (Base64 over BLE) | E.g., `"Hello"`, `"Thank you"`, `"Please"`, `"idle"` |

> **Note on Firmware**: UUIDs can be adjusted directly in [`src/services/ble.ts`](file:///c:/Users/nisth/Downloads/ISL-GLOVES/src/services/ble.ts) to match your custom firmware. Special tokens such as `idle`, `none`, or `rest` automatically reset the input debouncer.

---

## 📂 Repository Structure

```
ISL-GLOVES/
├── android/                   # Native Android project (Gradle, manifest, NDK configs)
├── ios/                       # Native iOS project workspace
├── patches/                   # Hotfixes applied via patch-package (e.g. react-native-tts namespace)
├── src/
│   ├── assets/                # Icons, logos, and UI imagery
│   ├── components/            # Reusable UI components & ErrorBoundary
│   │   ├── ErrorBoundary.tsx
│   │   ├── ErrorFallback.tsx
│   │   └── KeyboardAwareScrollViewCompat.tsx
│   ├── constants/             # Design tokens & color palettes
│   │   └── colors.ts
│   ├── hooks/                 # Custom React hooks
│   │   ├── useBLE.ts          # BLE connection lifecycle & permission handling
│   │   └── useColors.ts       # Theme & color resolution hook
│   ├── screens/
│   │   └── HomeScreen.tsx     # Main dashboard, Subtitles, Calibration & Audit views
│   └── services/              # Device & Native integrations
│       ├── ble.ts             # BLE manager, scanning, connection & packet decode
│       ├── haptics.ts         # Tactile feedback service
│       └── speech.ts          # Text-to-Speech synthesis service
├── App.tsx                    # Root application entry point
├── Mitzy.apk                  # Pre-compiled release APK for Android
├── package.json               # Dependencies and build scripts
└── tsconfig.json              # TypeScript configuration
```

---

## 🚀 Getting Started

### Prerequisites

Ensure you have installed:
- [Node.js](https://nodejs.org/) (Version `>= 22.11.0` recommended)
- [npm](https://www.npmjs.com/) or [pnpm](https://pnpm.io/)
- [Android Studio](https://developer.android.com/studio) with:
  - Android SDK Platform `34`
  - Android SDK Build-Tools `34.0.0`
  - JDK 17 (Java Development Kit)
- A physical Android device with Bluetooth turned on (BLE requires physical hardware for peripheral pairing)

---

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/iamkorvynn/ISL-GLOVES.git
   cd ISL-GLOVES
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```
   *(This will automatically execute `patch-package` to apply necessary fixes to native libraries).*

---

### Running the App

#### 1. Start the Metro Bundler
```bash
npm start
```

#### 2. Launch on Android
Connect your Android phone via USB with **USB Debugging** enabled:
```bash
npm run android
```

#### 3. Type Checking
To verify TypeScript types across the codebase:
```bash
npm run typecheck
```

---

### Building the Release APK

To create an installable standalone release APK:

```bash
npm run build:apk
```

The compiled APK will be output to:
```
android/app/build/outputs/apk/release/app-release.apk
```

*(A pre-compiled build is also provided in the repository root as [`Mitzy.apk`](file:///c:/Users/nisth/Downloads/ISL-GLOVES/Mitzy.apk)).*

---

## 🔒 Android Permissions

Mitzy handles runtime permissions seamlessly for both modern and legacy Android versions:

- **Android 12+ (API 31+)**:
  - `BLUETOOTH_SCAN` (`neverForLocation`)
  - `BLUETOOTH_CONNECT`
  - `ACCESS_FINE_LOCATION`
- **Android 6 to 11 (API 23–30)**:
  - `BLUETOOTH`
  - `BLUETOOTH_ADMIN`
  - `ACCESS_FINE_LOCATION` (Required for BLE discovery)
- **General**:
  - `VIBRATE` (Haptic feedback)
  - `INTERNET` (Network telemetry & updates)

Permissions are prompted dynamically on first connect inside [`src/hooks/useBLE.ts`](file:///c:/Users/nisth/Downloads/ISL-GLOVES/src/hooks/useBLE.ts).

---

## 🛠️ Tech Stack & Libraries

| Category | Library | Purpose |
| :--- | :--- | :--- |
| **Framework** | React Native `0.87.1` / React `19.2.3` | Cross-platform core |
| **Language** | TypeScript `5.9.3` | Type safety |
| **Bluetooth LE** | `react-native-ble-plx` `^3.5.1` | Native BLE scanning, GATT discovery & notifications |
| **Speech** | `react-native-tts` `^4.1.1` | Native Android Text-to-Speech |
| **Haptics** | `react-native-haptic-feedback` `^2.3.3` | Sensory feedback on recognition |
| **Storage** | `@react-native-async-storage/async-storage` | Persistence for user settings & preferences |
| **Icons** | `react-native-vector-icons` (Feather) | Modern clean iconography |
| **State & Query** | `@tanstack/react-query` `^5.90` | Async state management |

---

## 🤝 Contributing

Contributions are welcome! If you are integrating a new sensor array, refining ISL vocabulary models, or improving BLE transmission throughput:

1. Fork the Project.
2. Create your Feature Branch (`git checkout -b feature/NewGestureModel`).
3. Commit your Changes (`git commit -m "Add dynamic two-hand gesture support"`).
4. Push to the Branch (`git push origin feature/NewGestureModel`).
5. Open a Pull Request.

---

## 📄 License

This project is open-source. See the repository license or contact the maintainers for details.
