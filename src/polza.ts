import { chat as nativeChat } from "./tauri";
import type { AgentPlan, Settings } from "./types";

export async function chat(
  s: Settings,
  messages: { role: "system" | "user" | "assistant"; content: string }[]
) {
  return nativeChat(s.baseUrl, s.model, messages);
}

export async function createPlan(s: Settings, request: string, workspace: string) {
  const system = `Ты планировщик безопасного coding-agent. Верни ТОЛЬКО JSON без markdown:
{"summary":"...","actions":[...]}
actions могут быть:
{"type":"write_file","path":"relative/path","content":"полное содержимое файла"}
{"type":"run_command","command":"команда"}
{"type":"read_file","path":"relative/path"}
{"type":"delete_file","path":"relative/path"}
Правила:
- Только относительные пути внутри workspace.
- Не используй .. и абсолютные пути.
- Не удаляй файлы без необходимости.
- Не создавай опасные команды (format, shutdown, diskpart, rm -rf, del /s /q, reg delete и подобные).
- Для изменения проекта сначала используй write_file, а команды запускай только когда они действительно нужны.
Workspace: ${workspace || "не выбран"}`;

  const raw = await chat(s, [
    { role: "system", content: system },
    { role: "user", content: request }
  ]);
  const clean = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const parsed: unknown = JSON.parse(clean);
  if (!parsed || typeof parsed !== "object") throw new Error("AI вернул некорректный план.");
  const plan = parsed as AgentPlan;
  if (typeof plan.summary !== "string" || !Array.isArray(plan.actions)) throw new Error("AI-план имеет неверную структуру.");
  return plan;
}
