import { useEffect, useMemo, useState } from "react";
import Editor from "@monaco-editor/react";
import {
  Bot, ChevronRight, Code2, FolderOpen, Play, Plus, Send, Settings,
  ShieldCheck, Sparkles, Terminal, X, Check, RotateCcw, Loader2,
  FileCode2, MessageSquare, Wand2
} from "lucide-react";
import { DEFAULT_SETTINGS, type AgentAction, type ChatMessage, type Settings as AppSettings } from "./types";
import { chat, createPlan } from "./polza";
import { chooseWorkspace, deleteTextFile, runShell, writeTextFile, readTextFile, saveApiKey, hasApiKey, listWorkspaceFiles, type WorkspaceFile } from "./tauri";

const seedFiles: Record<string,string> = {
  "src/App.tsx": `import { useState } from "react";

export default function App() {
  const [count, setCount] = useState(0);
  return (
    <main>
      <h1>Моё приложение</h1>
      <p>Создано с Polza Agent.</p>
      <button onClick={() => setCount(count + 1)}>Нажатий: {count}</button>
    </main>
  );
}`,
  "package.json": `{"name":"my-app","private":true,"version":"1.0.0"}`,
  "README.md": "# Моё приложение\n\nСоздано с Polza Agent Studio."
};

function loadSettings(): AppSettings {
  try { const raw=JSON.parse(localStorage.getItem("polza-settings") || "{}"); return {...DEFAULT_SETTINGS, ...raw, apiKey:""}; }
  catch { return DEFAULT_SETTINGS; }
}

export default function App() {
  const [settings,setSettings] = useState(loadSettings);
  const [workspace,setWorkspace] = useState<string>("");
  const [files,setFiles] = useState(seedFiles);
  const [workspaceFiles,setWorkspaceFiles] = useState<WorkspaceFile[]>([]);
  const [apiConfigured,setApiConfigured] = useState(false);
  const [active,setActive] = useState("src/App.tsx");
  const [code,setCode] = useState(seedFiles["src/App.tsx"]);
  const [messages,setMessages] = useState<ChatMessage[]>([
    {id:"welcome",role:"assistant",content:"Я готов работать как coding-agent. Выбери папку проекта или начни с описания задачи."}
  ]);
  const [input,setInput] = useState("");
  const [busy,setBusy] = useState(false);
  const [settingsOpen,setSettingsOpen] = useState(false);
  const [terminal,setTerminal] = useState("$ Polza Agent Studio\nWorkspace не выбран.");
  const [plan,setPlan] = useState<{summary:string;actions:AgentAction[]}|null>(null);
  const [pendingDiff,setPendingDiff] = useState<Record<string,string>>({});
  const [pendingCommands,setPendingCommands] = useState<string[]>([]);

  const model = useMemo(()=>settings.model.split("/").pop(),[settings.model]);

  function saveSettings(s:AppSettings) {
    setSettings({...s, apiKey:""});
    localStorage.setItem("polza-settings",JSON.stringify({...s, apiKey:""}));
    if (s.apiKey.trim()) saveApiKey(s.apiKey).then(()=>setApiConfigured(true)).catch(()=>setApiConfigured(false));
    setSettingsOpen(false);
  }

  async function initKey() {
    try { setApiConfigured(await hasApiKey()); } catch { setApiConfigured(false); }
  }

  useEffect(() => { void initKey(); }, []);

  async function openWorkspace() {
    try {
      const dir = await chooseWorkspace();
      if (!dir) return;
      const listing = await listWorkspaceFiles(dir);
      setWorkspace(dir);
      setWorkspaceFiles(listing);
      const nextFiles: Record<string,string> = {};
      for (const f of listing.filter(f => /\.(tsx?|jsx?|json|md|css|html|toml|ya?ml|rs|py|go|java|cs)$/i.test(f.path)).slice(0, 80)) {
        try { nextFiles[f.path] = await readTextFile(dir, f.path); } catch { /* binary/unreadable */ }
      }
      if (Object.keys(nextFiles).length) {
        setFiles(nextFiles);
        const preferred = nextFiles["src/App.tsx"] ? "src/App.tsx" : Object.keys(nextFiles)[0];
        setActive(preferred);
        setCode(nextFiles[preferred]);
      }
      setTerminal(`$ workspace\n${dir}\n${listing.length} файлов найдено.`);
    } catch (e) {
      setTerminal(t => `${t}\nERROR: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async function selectFile(path:string) {
    setActive(path);
    if (files[path] !== undefined) { setCode(files[path]); return; }
    if (!workspace) { setCode(""); return; }
    try {
      const content = await readTextFile(workspace, path);
      setFiles(f => ({...f, [path]: content}));
      setCode(content);
    } catch (e) {
      setCode("");
      setTerminal(t => `${t}\nERROR: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async function saveCurrent() {
    setFiles(f=>({...f,[active]:code}));
    if (workspace) {
      try { await writeTextFile(workspace,active,code); setTerminal(t=>t+`\n$ saved ${active}`); }
      catch(e) { setTerminal(t=>t+`\nERROR: ${String(e)}`); }
    }
  }

  async function makePlan() {
    if (!input.trim() || busy) return;
    const request=input.trim();
    setInput("");
    setMessages(m=>[...m,{id:crypto.randomUUID(),role:"user",content:request}]);
    setBusy(true);
    try {
      const context=Object.entries(files).slice(0, 60).map(([p,c])=>`\n--- ${p}\n${c.slice(0, 20000)}`).join("\n");
      const p=await createPlan(settings,request,context);
      setPlan(p);
    } catch(e) {
      setMessages(m=>[...m,{id:crypto.randomUUID(),role:"assistant",content:`Ошибка агента: ${e instanceof Error?e.message:String(e)}`}]);
    } finally { setBusy(false); }
  }

  async function executePlan() {
    if (!plan) return;
    setBusy(true);
    try {
      const staged={...files};
      const commands:string[]=[];
      for (const a of plan.actions) {
        if (a.type==="write_file") {
          staged[a.path]=a.content;
          setPendingDiff(d=>({...d,[a.path]:a.content}));
        }
        if (a.type==="delete_file") {
          delete staged[a.path];
          setPendingDiff(d=>({...d,[a.path]:"__DELETE__"}));
        }
        if (a.type==="run_command") commands.push(a.command);
        if (a.type==="read_file") {
          if (!workspace) throw new Error("Для read_file сначала выбери workspace.");
          const content = await readTextFile(workspace, a.path);
          setMessages(m=>[...m,{id:crypto.randomUUID(),role:"assistant",content:`Прочитан ${a.path} (${content.length} символов).` }]);
        }
      }
      setPendingCommands(commands);
      setMessages(m=>[...m,{id:crypto.randomUUID(),role:"assistant",content:`План подготовлен: ${plan.summary}\n\nИзменения и команды ждут твоего подтверждения.`}]);
      setPlan(null);
    } catch(e) {
      setMessages(m=>[...m,{id:crypto.randomUUID(),role:"assistant",content:`Агент остановлен: ${String(e)}`}]);
    } finally { setBusy(false); }
  }

  async function acceptChanges() {
    if (!workspace) { setPendingDiff({}); setPendingCommands([]); return; }
    for (const [path,content] of Object.entries(pendingDiff)) {
      if (content==="__DELETE__") await deleteTextFile(workspace,path);
      else await writeTextFile(workspace,path,content);
    }
    for (const command of pendingCommands) {
      const r=await runShell(command,workspace);
      setTerminal(t=>`${t}\n$ ${command}\n${r.stdout}${r.stderr}`);
    }
    const next={...files};
    for (const [path,content] of Object.entries(pendingDiff)) { if (content==="__DELETE__") delete next[path]; else next[path]=content; }
    setFiles(next);
    if (next[active] !== undefined) setCode(next[active]);
    setPendingDiff({}); setPendingCommands([]);
    setTerminal(t=>t+"\n✓ Изменения применены в workspace.");
  }

  async function rejectChanges() {
    setPendingDiff({});
    setPendingCommands([]);
    if (files[active]) setCode(files[active]);
  }

  async function freeChat() {
    if (!input.trim() || busy) return;
    const q=input.trim(); setInput(""); setBusy(true);
    setMessages(m=>[...m,{id:crypto.randomUUID(),role:"user",content:q}]);
    try {
      const answer=await chat(settings,[
        {role:"system",content:"Ты AI coding assistant в Polza Agent Studio. Отвечай по-русски. Будь конкретным."},
        ...messages.map(m=>({role:m.role,content:m.content})),
        {role:"user",content:q}
      ]);
      setMessages(m=>[...m,{id:crypto.randomUUID(),role:"assistant",content:answer}]);
    } catch(e) {
      setMessages(m=>[...m,{id:crypto.randomUUID(),role:"assistant",content:String(e)}]);
    } finally { setBusy(false); }
  }

  return <div className="app">
    <header className="top">
      <div className="brand"><span className="logo"><Sparkles size={15}/></span><b>Polza Agent</b><small>STUDIO</small></div>
      <button className="workspace-btn" onClick={openWorkspace}><FolderOpen size={15}/>{workspace||"Выбрать workspace"}</button>
      <div className="top-right">
        <span className="model"><Bot size={13}/> {model}</span>
        <button className="run" onClick={async()=>{
          if (!workspace) { setTerminal(t=>t+"\nERROR: Сначала выберите workspace."); return; }
          try { const r=await runShell("npm run dev",workspace); setTerminal(t=>`${t}\n$ npm run dev\n${r.stdout}${r.stderr}\n[exit ${r.code}]`); }
          catch(e) { setTerminal(t=>`${t}\nERROR: ${e instanceof Error?e.message:String(e)}`); }
        }}><Play size={14}/> Run</button>
        <button className="icon" onClick={()=>setSettingsOpen(true)}><Settings size={17}/></button>
      </div>
    </header>

    <div className="layout">
      <aside className="files">
        <div className="section-head"><span>EXPLORER</span><Plus size={14}/></div>
        {(workspaceFiles.length ? workspaceFiles.map(f=>f.path) : Object.keys(files)).map(p=><button key={p} className={active===p?"file active":"file"} onClick={()=>void selectFile(p)}>
          <FileCode2 size={14}/>{p}
        </button>)}
        <div className="files-bottom"><ShieldCheck size={13}/> AI actions require approval · {workspaceFiles.length || Object.keys(files).length} files</div>
      </aside>

      <main className="main">
        <div className="tabs"><div className="tab active"><Code2 size={14}/>{active}</div><button onClick={()=>setTerminal(t=>t+"\n$ terminal opened")}><Terminal size={14}/></button></div>
        <div className="editor">
          <Editor theme="vs-dark" language={active.endsWith(".json")?"json":active.endsWith(".md")?"markdown":"typescript"} value={code}
            onChange={v=>setCode(v||"")} options={{fontSize:13,minimap:{enabled:false},padding:{top:12},automaticLayout:true}} />
        </div>
        <div className="bottom">
          <div className="terminal-head"><Terminal size={13}/> TERMINAL <button onClick={()=>setTerminal("")}><X size={13}/></button></div>
          <pre>{terminal}</pre>
        </div>
      </main>

      <aside className="agent">
        <div className="agent-header">
          <div><b><Wand2 size={15}/> AI Agent</b><small>Polza.AI · {model}</small></div>
          <span className="status">{apiConfigured ? "READY" : "KEY REQUIRED"}</span>
        </div>

        <div className="chat">
          {messages.map(m=><div className={`msg ${m.role}`} key={m.id}>
            <div className="msg-role">{m.role==="assistant"?<><Bot size={12}/> AGENT</>:<>YOU</>}</div>
            <div className="msg-content">{m.content}</div>
          </div>)}
          {busy&&<div className="loading"><Loader2 size={14}/> Agent работает…</div>}
        </div>

        {plan && <div className="plan">
          <div className="plan-title"><Sparkles size={14}/> План агента</div>
          <p>{plan.summary}</p>
          <div className="actions">{plan.actions.map((a,i)=><div key={i} className="action"><ChevronRight size={12}/><span>{a.type}: {"path" in a?a.path:"command" in a?a.command:""}</span></div>)}</div>
          <div className="plan-buttons">
            <button className="approve" onClick={executePlan}><Check size={13}/> Выполнить</button>
            <button onClick={()=>setPlan(null)}><RotateCcw size={13}/> Отменить</button>
          </div>
        </div>}

        {(Object.keys(pendingDiff).length>0 || pendingCommands.length>0) && <div className="approval">
          <b>Изменения готовы</b>
          <span>{Object.keys(pendingDiff).length} файл(ов) · {pendingCommands.length} команд</span>
          <div><button className="approve" onClick={acceptChanges}><Check size={13}/> Применить</button><button onClick={rejectChanges}>Отклонить</button></div>
        </div>}

        <div className="quick">
          <button onClick={()=>setInput("Создай полноценный Telegram-бот с /start, /help и обработчиком ошибок")}>Telegram Bot</button>
          <button onClick={()=>setInput("Создай REST API с CRUD для сущности users")}>REST API</button>
          <button onClick={()=>setInput("Проанализируй проект и исправь очевидные ошибки")}>Fix project</button>
        </div>
        <div className="composer">
          <textarea value={input} onChange={e=>setInput(e.target.value)} placeholder="Опиши задачу агенту…" onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();makePlan()}}}/>
          <div><span><MessageSquare size={12}/> Shift+Enter — новая строка</span><button disabled={!input.trim()||busy} onClick={makePlan}><Send size={14}/></button></div>
        </div>
      </aside>
    </div>

    <div className="statusbar"><span>● {apiConfigured?"Agent ready":"AI key required"}</span><span>{workspace?"Workspace connected":"No workspace"}</span><button onClick={()=>void saveCurrent()}>Save {active}</button></div>

    {settingsOpen&&<SettingsModal settings={settings} save={saveSettings} close={()=>setSettingsOpen(false)}/>}
  </div>
}

function SettingsModal({settings,save,close}:{settings:AppSettings;save:(s:AppSettings)=>void;close:()=>void}) {
  const [s,setS]=useState(settings); const [show,setShow]=useState(false);
  return <div className="overlay"><div className="modal">
    <div className="modal-title"><div><h2>AI Settings</h2><p>Polza.AI connection</p></div><button className="icon" onClick={close}><X/></button></div>
    <label>API Key</label><div className="key"><input type={show?"text":"password"} value={s.apiKey} onChange={e=>setS({...s,apiKey:e.target.value})} placeholder="Оставьте пустым, чтобы сохранить текущий ключ"/><button onClick={()=>setShow(!show)}>{show?"Скрыть":"Показать"}</button></div>
    <label>Base URL</label><input value={s.baseUrl} onChange={e=>setS({...s,baseUrl:e.target.value})}/>
    <label>Model</label><input value={s.model} onChange={e=>setS({...s,model:e.target.value})}/>
    <div className="note"><ShieldCheck size={14}/> API-ключ хранится через системное хранилище учётных данных ОС и не записывается в localStorage.</div>
    <div className="modal-actions"><button onClick={close}>Cancel</button><button className="approve" onClick={()=>save(s)}>Save</button></div>
  </div></div>
}
