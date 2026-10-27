# Android wrapper: install and build on another laptop

The native app packages the React frontend, supports Android back navigation, native file sharing, and safe-area padding, and connects to the Express API. It does not package Node.js or a database inside the APK.

## 1. Install prerequisites

- Git and Node.js **24 LTS**.
- Android Studio **2025.2.1 or newer**, with SDK Platform **Android 16 / API 36**, Build Tools **36.0.0**, Platform Tools, and command-line tools installed through **SDK Manager**.
- **JDK 21**. In Android Studio choose the included compatible JDK under Settings → Build, Execution, Deployment → Build Tools → Gradle → Gradle JDK. For terminal builds, set `JAVA_HOME` to your JDK 21 directory.
- An Android 7.0+ phone (API 24+) or emulator, with an updated Android System WebView.

The repository includes `gradlew`, `gradlew.bat`, and the Gradle wrapper JAR. **You do not need a global Gradle installation.** The first build downloads Gradle and Android dependencies and requires internet access.

### SDK paths

Find the exact SDK directory under Android Studio → SDK Manager, then set `ANDROID_HOME` to that directory.

PowerShell (adjust paths for your machine):

```powershell
$env:ANDROID_HOME="$env:LOCALAPPDATA\Android\Sdk"
$env:JAVA_HOME="C:\Program Files\Java\jdk-21"
```

macOS:

```sh
export ANDROID_HOME="$HOME/Library/Android/sdk"
export JAVA_HOME=$(/usr/libexec/java_home -v 21)
```

Linux (adjust the path if SDK Manager shows a different one):

```sh
export ANDROID_HOME="$HOME/Android/Sdk"
export JAVA_HOME=/path/to/jdk-21
```

These commands affect the current terminal. Use your operating system's environment settings or shell profile to persist them. Android Studio can also create `frontend/android/local.properties` with `sdk.dir=YOUR_SDK_PATH`. This file is machine-specific and must not be committed or copied from another laptop.

## 2. Clone and configure

```sh
git clone https://github.com/PraneethPW/CIVICFLOW.git
cd CIVICFLOW
npm run setup
npm run install:all
npm run android:doctor
```

Resolve any `MISSING` diagnostics before building. To open Android Studio after sync:

```sh
npm run android:sync
npm --prefix frontend run android:open
```

Sync generates the web assets and plugin configuration. Run it again after any frontend or plugin change.

## 3. Choose where the API runs

### Option A: Android emulator and backend on the same laptop

The default Android local mode uses `http://10.0.2.2:4500/api`. `10.0.2.2` is the Android emulator's alias for the host laptop. In a separate terminal:

```sh
npm run dev:backend
```

Then:

```sh
npm run android:build
```

### Option B: Physical phone and backend on this laptop

Connect both devices to the same Wi-Fi. Find the laptop's LAN IPv4 address with `ipconfig` on Windows, `ipconfig getifaddr en0` on macOS, or `hostname -I` on Linux. Create **`frontend/.env.android-local.local`** containing:

```dotenv
VITE_API_URL=http://YOUR_LAPTOP_LAN_IP:4500/api
```

For example, if this laptop is `192.168.1.100`, use `http://192.168.1.100:4500/api`. Start the backend, allow inbound TCP port 4500 through the laptop firewall on the private network, and open that health URL in the phone's browser to confirm reachability:

```text
http://YOUR_LAPTOP_LAN_IP:4500/api/health
```

Build again after changing the file:

```sh
npm run android:build
```

`localhost` on a phone points to the phone itself. Use the laptop LAN IP for a real phone. Guest Wi-Fi/client isolation or a VPN can block laptop access. If the IP changes after moving laptops/networks, rebuild or change **Server connection settings** on the app's sign-in screen. Saving a server address signs out of the previous server.

Local builds explicitly enable HTTP for development. Production builds use HTTPS and disable mixed content/cleartext. Keep local HTTP builds on trusted test networks.

### Option C: APK that works away from your laptop

Deploy the API to a reachable HTTPS address with persistent storage. Configure admin credentials, `JWT_SECRET`, and optionally Postgres and AI keys on that server. Create **`frontend/.env.android-production.local`**:

```dotenv
VITE_API_URL=https://YOUR_ACTUAL_API_HOST/api
```

Then run:

```sh
npm --prefix frontend run android:build:production
```

The build intentionally fails if the production API is blank, HTTP, localhost, or the example placeholder. A hosted APK does not require your laptop to remain online. All clients using that backend share the same records. An account from a different local server does not automatically exist on the hosted server.

## 4. Install the APK

A successful debug build produces:

```text
frontend/android/app/build/outputs/apk/debug/app-debug.apk
```

Copy it to an Android phone and open it to install, allowing installation from that source when Android asks. Or enable Developer Options and USB debugging, connect the device, authorize the laptop on the phone, and use Platform Tools:

macOS/Linux:

```sh
"$ANDROID_HOME/platform-tools/adb" devices
"$ANDROID_HOME/platform-tools/adb" install -r frontend/android/app/build/outputs/apk/debug/app-debug.apk
```

PowerShell:

```powershell
& "$env:ANDROID_HOME\platform-tools\adb.exe" devices
& "$env:ANDROID_HOME\platform-tools\adb.exe" install -r frontend/android/app/build/outputs/apk/debug/app-debug.apk
```

Debug APKs are for testing. Different laptops generate different debug signing keys. If Android says `INSTALL_FAILED_UPDATE_INCOMPATIBLE`, uninstall the old debug app first (this clears the phone's cached session/settings) or use the same private signing key. Backend records remain on the server.

For distribution create a signed release in Android Studio → Build → Generate Signed App Bundle / APK. Keep your keystore and passwords outside Git and reuse the same signing key for updates. To generate an unsigned production bundle from terminal after configuring HTTPS:

```sh
npm --prefix frontend run android:bundle:production
```

The output is `frontend/android/app/build/outputs/bundle/release/app-release.aab`. Sign it with your own release key before distributing through Play. No signing credentials are included in this repository.

## 5. Verify the complete flow

1. Register a citizen on the phone. Create an application in Services.
2. In Tracking, upload each document. A PDF is stored for manual review; a JPEG/PNG also runs English OCR. The first image scan downloads a language model on the API server.
3. Sign in as the configured admin on the laptop's web app, pointed at the same API, and open Officer.
4. Review the files and click Verify for each required document. Approve the application after all checks pass.
5. The phone's status and notifications should update without manually refreshing.
6. Submit a complaint on the phone. Publish a response in Officer and confirm it appears on the phone.
7. Restart the backend, sign in again, and check that records and uploads remain.
8. Briefly disconnect/reconnect Wi-Fi; the app should show reconnecting/offline and refresh current data after the connection returns.

Live updates work while the app is open. Background Android push notifications and fully offline workflows are not included. Voice input depends on browser capabilities; on Android use the keyboard microphone if Web Speech is unavailable.

## Troubleshooting

| Problem | Fix |
| --- | --- |
| `gradlew` not recognized on macOS/Linux | Use the npm Android commands; they choose `gradlew` or `gradlew.bat` for your OS. |
| Permission denied on `gradlew` | The build script fixes permissions automatically; for manual builds run `chmod +x frontend/android/gradlew`. |
| SDK location not found | Set `ANDROID_HOME` or open the project in Android Studio and let it create local.properties. |
| Java/class version error | Use JDK 21 for both the terminal and Android Studio Gradle settings. |
| Platform 36 / Build Tools missing | Install them in SDK Manager, accept SDK licenses, rerun doctor. |
| API unreachable on phone | Test `/api/health` in the phone browser. Check LAN IP, backend process, firewall, VPN, and Wi-Fi isolation. |
| HTTP cleartext blocked | Use `android:build:local` for LAN testing. Use HTTPS and `android:build:production` for hosted builds. |
| Wrong server after moving laptops | Change Server connection settings at sign-in, or rebuild using the new `.local` configuration. |
| CORS in desktop browser | Set `FRONTEND_URL` or `CORS_ORIGINS` on the API to the exact browser origin. Restart the API. |
| UI changes missing from APK | Run the npm Android build again; it compiles and syncs before Gradle. |
| Updates arrive only every 30 seconds | Check that your proxy allows `/api/events` streaming and disables buffering/compression. |
| Data disappears on hosting | Persist the SQLite/upload directories, or use Postgres plus persistent/shared uploads. |
| OCR cannot download model | Allow API-server access to the Tesseract language download; retry, or upload a PDF for manual review. |
| Admin login fails | Read `ADMIN_PASSWORD` from your private backend/.env. Setup does not reset existing users. |
| English OCR confidence is low | Use a sharp, uncropped English document image. Officer review remains required for all files. |

References: [Capacitor environment setup](https://capacitorjs.com/docs/getting-started/environment-setup), [Capacitor Android troubleshooting](https://capacitorjs.com/docs/android/troubleshooting), [Android SDK Manager](https://developer.android.com/tools/sdkmanager).
