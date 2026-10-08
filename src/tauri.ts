import { invoke } from "@tauri-apps/api/core";

export type ShellResult = { code: number; stdout: string; stderr: string };
export type WorkspaceFile = { path: string; size: number };
export type AgentMessage = { role: "system" | "user" | "assistant"; content: string };

export const runShell = (command: string, cwd: string) => invoke<ShellResult>("run_shell", { command, cwd });
export const readTextFile = (workspace: string, path: string) => invoke<string>("read_text_file", { workspace, path });
export const writeTextFile = (workspace: string, path: string, content: string) => invoke<void>("write_text_file", { workspace, path, content });
export const deleteTextFile = (workspace: string, path: string) => invoke<void>("delete_text_file", { workspace, path });
export const listWorkspaceFiles = (workspace: string) => invoke<WorkspaceFile[]>("list_workspace_files", { workspace });
export const chooseWorkspace = () => invoke<string | null>("choose_workspace");
export const saveApiKey = (key: string) => invoke<void>("save_api_key", { key });
export const hasApiKey = () => invoke<boolean>("has_api_key");
export const chat = (baseUrl: string, model: string, messages: AgentMessage[]) =>
  invoke<string>("polza_chat", { baseUrl, model, messages });
