import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
const command = process.platform === "win32" ? "npm.cmd" : "npm";
const children = ["backend", "frontend"].map((folder) =>
  spawn(command, ["--prefix", folder, "run", "dev"], {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
  }),
);
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill();
  process.exitCode = code;
}
for (const child of children) {
  child.on("error", (error) => {
    console.error(error);
    stop(1);
  });
  child.on("exit", (code) => stop(code || 0));
}
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
