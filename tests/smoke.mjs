import { readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const read = (p) => readFileSync(join(root, p), 'utf8');
const mustExist = (p) => { if (!existsSync(join(root, p))) throw new Error(`Missing required file: ${p}`); };

for (const p of ['package.json','tsconfig.json','vite.config.ts','index.html','README.md','src/App.tsx','src/polza.ts','src/tauri.ts','src/types.ts','src-tauri/Cargo.toml','src-tauri/src/lib.rs','src-tauri/tauri.conf.json']) mustExist(p);
const pkg = JSON.parse(read('package.json'));
if (!pkg.scripts?.build || !pkg.scripts?.typecheck || !pkg.scripts?.tauri) throw new Error('Required npm scripts are missing.');
const cargo = read('src-tauri/Cargo.toml');
if (!cargo.includes('reqwest') || !cargo.includes('keyring')) throw new Error('Native AI/keyring dependencies are missing.');
const rust = read('src-tauri/src/lib.rs');
for (const token of ['safe_path','safe_command','list_workspace_files','polza_chat','save_api_key']) if (!rust.includes(token)) throw new Error(`Expected native capability missing: ${token}`);
const app = read('src/App.tsx');
for (const token of ['listWorkspaceFiles','pendingDiff','acceptChanges','createPlan']) if (!app.includes(token)) throw new Error(`Expected UI capability missing: ${token}`);
for (const p of ['src/App.tsx','src/polza.ts','src/tauri.ts','src-tauri/src/lib.rs']) {
  const s = read(p);
  if (/\b(TODO|FIXME)\b/.test(s)) throw new Error(`Production TODO/FIXME found in ${p}`);
}
console.log('SMOKE PASS: project structure, configuration and critical integration markers are present.');
