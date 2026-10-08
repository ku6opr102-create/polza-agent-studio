export type Settings = {
  apiKey: string;
  baseUrl: string;
  model: string;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

export type AgentAction =
  | { type: "write_file"; path: string; content: string }
  | { type: "run_command"; command: string }
  | { type: "read_file"; path: string }
  | { type: "delete_file"; path: string };

export type AgentPlan = {
  summary: string;
  actions: AgentAction[];
};

export const DEFAULT_SETTINGS: Settings = {
  apiKey: "",
  baseUrl: "https://polza.ai/api/v1",
  model: "openai/gpt-6-luna"
};
