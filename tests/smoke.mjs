import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentFile = fileURLToPath(import.meta.url);
const testsDirectory = path.dirname(currentFile);
const root = path.resolve(testsDirectory, "..");

const mustExist = (relativePath) => {
  const absolutePath = path.join(root, relativePath);

  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Missing required file: ${relativePath}`);
  }

  return absolutePath;
};

const requiredFiles = [
  "package.json",
  "index.html",
  "tsconfig.json",
  "vite.config.ts",
  "src/App.tsx",
  "src/polza.ts",
  "src/tauri.ts",
  "src/types.ts",
  "src-tauri/Cargo.toml",
  "src-tauri/tauri.conf.json",
  "src-tauri/src/lib.rs",
];

for (const file of requiredFiles) {
  mustExist(file);
}

const packageJsonPath = mustExist("package.json");
const packageJson = JSON.parse(
  fs.readFileSync(packageJsonPath, "utf8")
);

if (!packageJson.name) {
  throw new Error("package.json does not contain a package name.");
}

if (!packageJson.scripts) {
  throw new Error("package.json does not contain scripts.");
}

const requiredScripts = [
  "dev",
  "build",
  "tauri",
  "typecheck",
  "test",
];

for (const script of requiredScripts) {
  if (!packageJson.scripts[script]) {
    throw new Error(
      `package.json is missing required script: ${script}`
    );
  }
}

const tauriConfigPath = mustExist("src-tauri/tauri.conf.json");
const tauriConfig = JSON.parse(
  fs.readFileSync(tauriConfigPath, "utf8")
);

if (!tauriConfig.productName) {
  throw new Error("Tauri configuration is missing productName.");
}

if (!tauriConfig.bundle) {
  throw new Error("Tauri configuration is missing bundle configuration.");
}

if (tauriConfig.bundle.active !== true) {
  throw new Error("Tauri bundle must be enabled.");
}

console.log("SMOKE PASS");
console.log(`Project root: ${root}`);
console.log(`Package: ${packageJson.name}`);
console.log(`Version: ${packageJson.version ?? "unknown"}`);
console.log("Required files: PASS");
console.log("Required npm scripts: PASS");
console.log("Tauri configuration: PASS");
