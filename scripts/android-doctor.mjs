import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
let failed = false;
function check(name, ok, help) {
  console.log(`${ok ? "OK" : "MISSING"} ${name}${ok ? "" : `: ${help}`}`);
  if (!ok) failed = true;
}
check(
  "Node.js 24+",
  Number(process.versions.node.split(".")[0]) >= 24,
  "Install Node.js 24 LTS",
);
const java = spawnSync("java", ["-version"], { encoding: "utf8" });
const javaText = java.stderr || java.stdout || "";
check(
  "Java 21+",
  /version "(2[1-9]|[3-9]\d)/.test(javaText),
  "Install JDK 21 and set JAVA_HOME (Android Studio includes a JDK)",
);
const local = resolve(root, "frontend/android/local.properties");
let sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
if (!sdk && existsSync(local))
  sdk = readFileSync(local, "utf8")
    .match(/^sdk.dir=(.+)$/m)?.[1]
    .replace(/\\:/g, ":")
    .replace(/\\\\/g, "\\");
check(
  "Android SDK path",
  !!sdk && existsSync(sdk),
  "Install Android Studio, then set ANDROID_HOME to your SDK directory",
);
if (sdk) {
  check(
    "Android platform 36",
    existsSync(resolve(sdk, "platforms/android-36")),
    "Install Android SDK Platform 36 in SDK Manager",
  );
  check(
    "Build Tools 36.0.0",
    existsSync(resolve(sdk, "build-tools/36.0.0")),
    "Install Build Tools 36.0.0 in SDK Manager",
  );
}
check(
  "Frontend dependencies",
  existsSync(resolve(root, "frontend/node_modules/@capacitor/android")),
  "Run npm run install:all",
);
check(
  "Gradle wrapper",
  existsSync(
    resolve(root, "frontend/android/gradle/wrapper/gradle-wrapper.jar"),
  ),
  "Restore the Gradle wrapper files from Git",
);
process.exitCode = failed ? 1 : 0;
