import { existsSync, writeFileSync, readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
const root = fileURLToPath(new URL("../", import.meta.url));
if (Number(process.versions.node.split(".")[0]) < 24)
  throw new Error("Install Node.js 24 LTS first.");
const target = resolve(root, "backend/.env");
if (!existsSync(target)) {
  const password = randomBytes(18).toString("base64url");
  let env = readFileSync(resolve(root, "backend/.env.example"), "utf8");
  env = env
    .replace("JWT_SECRET=", `JWT_SECRET=${randomBytes(48).toString("hex")}`)
    .replace("ADMIN_PASSWORD=", `ADMIN_PASSWORD=${password}`);
  writeFileSync(target, env, { mode: 0o600 });
  console.log(
    "Created backend/.env with a random JWT secret and admin password.",
  );
  console.log(
    "Admin: admin@civicflow.ai — find the password in backend/.env. Keep this file private.",
  );
} else console.log("Kept existing backend/.env.");
console.log(
  "Next: npm run install:all, then npm run dev. Android: npm run android:doctor.",
);
