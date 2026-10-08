# Polza Agent Studio

Windows desktop coding-agent studio built with Tauri 2, React, TypeScript and Monaco.

## What is implemented

- Workspace picker and recursive project explorer
- Monaco editor with lazy file loading
- AI chat through the native Tauri backend (API key never enters renderer JavaScript)
- Polza-compatible OpenAI chat-completions endpoint
- Structured coding-agent plans
- Explicit user approval before file changes and commands are applied
- Safe workspace-relative file operations
- Command execution with a destructive-command deny-list and bounded output
- OS credential-store API-key storage through `keyring`
- Integrated terminal output
- Persistent UI settings without storing the API key in localStorage

## Development

```bash
npm install
npm run tauri dev
```

## Checks

```bash
npm run typecheck
npm run build
```

## Windows release

The repository contains a Tauri NSIS configuration. A Windows release must be built on Windows (or a correctly configured Windows cross-build environment) with the Tauri/Rust prerequisites installed:

```powershell
npm install
npm run tauri build
```

The current source does not ship a prebuilt `.exe`; the build must be performed in a Windows-capable environment.

## AI configuration

Open **Settings**, enter the Polza.AI API key, choose the base URL and model, then save. The key is stored by the native backend in the OS credential store and is not written to localStorage, project files, or logs.
