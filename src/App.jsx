import React, { useEffect, useRef, useState } from "react";
import { Bot, Send, User, Trash2, Copy, Square, Play, Moon, Sun, CheckCircle2, Loader2, CircleAlert } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const WELCOME = "안녕하세요! KFC 챗봇입니다. 무엇을 도와드릴까요?";

function classNames(...xs) {
  return xs.filter(Boolean).join(" ");
}

export default function ChatbotFrontend() {
  const [messages, setMessages] = useState([
    { id: crypto.randomUUID(), role: "assistant", content: WELCOME, ts: Date.now() },
  ]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [dark, setDark] = useState(() =>
    typeof window !== "undefined" ? document.documentElement.classList.contains("dark") : false
  );

  const listRef = useRef(null);
  const controllerRef = useRef(null);
  
  const asstIdRef = useRef(null);  // 첫 델타로 만든 assistant 메시지 id 저장
  const reqIdRef  = useRef(0);     // 요청 번호(가드)
  const activeUserIdRef = useRef(null); // 진행표시를 붙일 "사용자 메시지" id

  const PROGRESS_STEPS = [
  { id: "is_our_service"},
  { id: "chatbot"},
  { id: "get_goal"},
  { id: "load_profile"},
  { id: "hitl_confirm_input"},
  ];
  const [progressVisible, setProgressVisible] = useState(false);
  const [steps, setSteps] = useState(PROGRESS_STEPS.map(s => ({ ...s, state: "idle" })));

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, isStreaming]);

  useEffect(() => {
    if (dark) document.documentElement.classList.add("dark");
    else document.documentElement.classList.remove("dark");
  }, [dark]);

  async function handleSend() {
    const text = input.trim();
    if (!text) return;

    const myReqId = ++reqIdRef.current;     // 이번 요청 번호
    asstIdRef.current = null;                // 이전 요청 잔재 제거

    const userMsg = { id: crypto.randomUUID(), role: "user", content: text, ts: Date.now() };
    activeUserIdRef.current = userMsg.id;
    setMessages((m) => [...m, userMsg]);
    setInput("");
    setIsStreaming(true);   // 무조건 켬

    setProgressVisible(true);                 // 진행표시 ON
    setSteps(PROGRESS_STEPS.map(s => ({...s, state:"idle"})));

    const history = [...messages, userMsg].map((x) => ({ role: x.role, content: x.content }));

    try {
      controllerRef.current = new AbortController();

      await callBackend({
        history,
        signal: controllerRef.current.signal,

        onProgress: ({ id, status, label }) => {
          setSteps(prev =>
            prev.map(s => s.id === id ? { ...s, state: status, label: label ?? s.label } : s)
          );
        },

        // ⬇️ 최종 답변 시작 신호 → 진행표시 끄기 (말풍선은 유지)
        onDone: () => {
          setProgressVisible(false); // 진행 오버레이 끄기
        },

        onInterrupt: (intr) => {
          setMessages((msgs) => [
            ...msgs,
            {
              id: crypto.randomUUID(),
              role: "assistant",
              type: "interrupt",    // 구분용
              content: intr.value,  // { message, proposed, fields } 구조 그대로 저장
              ts: Date.now(),
            },
          ]);
          setIsStreaming(false);
        },
        
        onDelta: (delta) => {
          if (!delta) return;
          if (myReqId !== reqIdRef.current) return; // 이전/취소된 요청 델타 무시

          setMessages((m) => {
            // 이번 요청의 고유 id 준비
            let id = asstIdRef.current;
            if (!id) {
              id = crypto.randomUUID();
              asstIdRef.current = id;
            }

            // 🔑 핵심: 실제 배열(m)에 그 id가 있는지 확인해서 분기
            const exists = m.some((msg) => msg.id === id);
            if (!exists) {
              setIsStreaming(false);
              return [...m, { id, role: "assistant", content: delta, ts: Date.now() }];
            }
            // 이후 델타 → 말풍선 "수정"
            return m.map((msg) =>
              msg.id === id ? { ...msg, content: msg.content + delta } : msg
            );
          });
        }
      });
    } finally {
      setIsStreaming(false); // 스트림 끝난 뒤에만 끄기
    }
  }

  async function handleHitlSubmit(values, interruptId) {
    setIsStreaming(true);

    // 1) 메시지 교체: interrupt → 확정 메시지
    setMessages((msgs) =>
      msgs.map((msg) =>
        msg.id === interruptId
          ? {
              ...msg,
              type: "assistant",
              content: `목표 금액: ${values.target_amount}\n기간: ${values.target_months}\n투자 가능 금액: ${values.investable_amount}`,
            }
          : msg
      )
    );

    try {
      controllerRef.current = new AbortController();
      await callBackend({
        history: [],
        resume: values,
        signal: controllerRef.current.signal,

        onProgress: ({ id, status, label }) => {
          setSteps((prev) =>
            prev.map((s) =>
              s.id === id ? { ...s, state: status, label: label ?? s.label } : s
            )
          );
        },

        onDelta: (delta) => {
          setMessages((m) => {
            let id = asstIdRef.current;
            if (!id) {
              id = crypto.randomUUID();
              asstIdRef.current = id;
            }
            const exists = m.some((msg) => msg.id === id);
            if (!exists) {
              setIsStreaming(false);
              return [
                ...m,
                { id, role: "assistant", content: delta, ts: Date.now() },
              ];
            }
            return m.map((msg) =>
              msg.id === id ? { ...msg, content: msg.content + delta } : msg
            );
          });
        },

        onInterrupt: (intr) => {
          setMessages((msgs) => [
            ...msgs,
            {
              id: crypto.randomUUID(),
              role: "assistant",
              type: "interrupt",
              content: intr.value,
              ts: Date.now(),
            },
          ]);
          setIsStreaming(false);
        },

        onDone: () => {
          setProgressVisible(false);
        },
      });
    } finally {
      setIsStreaming(false);
    }
  }

  function stopStreaming() {
    try { controllerRef.current?.abort(); } catch {}
    reqIdRef.current++;
    setIsStreaming(false);
    setProgressVisible(false);
    const id = asstIdRef.current;
    if (id) {
      setMessages(m => m.map(msg =>
        msg.id === id ? { ...msg, pending:false, content: msg.content || "(중단됨)" } : msg
      ));
    }
  }

  function clearChat() {
    if (isStreaming) stopStreaming();
    setMessages([{ id: crypto.randomUUID(), role: "assistant", content: WELCOME, ts: Date.now() }]);
  }

  function onKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900 dark:bg-neutral-900 dark:text-neutral-100">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-neutral-200/60 dark:border-neutral-800/60 backdrop-blur bg-white/70 dark:bg-neutral-900/60">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-500 text-white shadow">
              <Bot size={18} />
            </div>
            <h1 className="font-semibold">KFC Chatbot</h1>
          </div>
          <div className="flex items-center gap-2">
            {isStreaming ? (
              <button
                onClick={stopStreaming}
                className="inline-flex items-center gap-1 rounded-xl px-3 py-2 text-sm border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800"
              >
                <Square size={14} /> 중지
              </button>
            ) : (
              <button
                onClick={handleSend}
                className="inline-flex items-center gap-1 rounded-xl px-3 py-2 text-sm border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800"
              >
                <Play size={14} /> 전송
              </button>
            )}
            <button
              onClick={clearChat}
              className="inline-flex items-center gap-1 rounded-xl px-3 py-2 text-sm border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800"
            >
              <Trash2 size={14} /> 지우기
            </button>
            <button
              onClick={() => setDark((d) => !d)}
              className="inline-flex items-center gap-1 rounded-xl px-3 py-2 text-sm border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800"
              title="테마 전환"
            >
              {dark ? <Sun size={14} /> : <Moon size={14} />}<span className="sr-only">테마</span>
            </button>
          </div>
        </div>
      </header>

      {/* Messages */}
      <main className="max-w-3xl mx-auto px-4">
        <div ref={listRef} className="relative h-[calc(100vh-210px)] overflow-y-auto py-6">
          <AnimatePresence initial={false}>
            {messages.map((m) => (
              <React.Fragment key={m.id}>
                {m.type === "interrupt" ? (
                  <ConfirmInputInline
                    id={m.id}
                    data={m.content}
                    onSubmit={handleHitlSubmit}
                  />
                ) : (
                  <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.15 }}
                    className={classNames(
                      "flex w-full gap-3",
                      m.role === "user" ? "justify-end" : "justify-start"
                    )}
                  >
                    {m.role !== "user" && (
                      <div className="shrink-0 mt-1 p-2 rounded-xl bg-neutral-200 dark:bg-neutral-800">
                        <Bot size={16} />
                      </div>
                    )}

                    <div
                      className={
                        m.role === "user"
                          ? "max-w-[80%] rounded-2xl px-4 py-3 bg-indigo-600 text-white shadow"
                          : "max-w-[80%] rounded-2xl px-4 py-3 bg-white dark:bg-neutral-800 border border-neutral-200/60 dark:border-neutral-700/60 shadow"
                      }
                    >
                      <p className="whitespace-pre-wrap leading-relaxed text-[15px]">{m.content}</p>
                      <div className="mt-2 flex items-center justify-between text-[11px] opacity-70 select-none">
                        <time>{formatTime(m.ts)}</time>
                        <button
                          className="inline-flex items-center gap-1 hover:opacity-100"
                          onClick={() => navigator.clipboard.writeText(m.content || "")}
                          title="복사"
                        >
                          <Copy size={12} /> 복사
                        </button>
                      </div>
                    </div>

                    {m.role === "user" && (
                      <div className="shrink-0 mt-1 p-2 rounded-xl bg-indigo-600 text-white">
                        <User size={16} />
                      </div>
                    )}
                  </motion.div>
                )}

                {progressVisible && m.id === activeUserIdRef.current && (
                  <div className="flex w-full gap-3 justify-start pl-10">
                    <BackgroundProgressInline steps={steps} />
                  </div>
                )}
              </React.Fragment>
            ))}
          </AnimatePresence>
        </div>
      </main>

      {/* Composer */}
      <footer className="sticky bottom-0 border-t border-neutral-200/60 dark:border-neutral-800/60 bg-white/80 dark:bg-neutral-900/60 backdrop-blur">
        <div className="max-w-3xl mx-auto px-4 py-3">
          <div className="rounded-2xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-inner">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="메시지를 입력하세요..."
              rows={3}
              className="w-full resize-none bg-transparent focus:outline-none p-4 text-[15px]"
            />
            <div className="flex items-center justify-between px-3 pb-3">
              <div className="text-xs text-neutral-500">
                Enter: 보내기 · Shift+Enter: 줄바꿈
              </div>
              <button
                onClick={handleSend}
                disabled={!input.trim() || isStreaming}
                className="inline-flex items-center gap-2 rounded-xl px-4 py-2 bg-indigo-600 text-white disabled:opacity-50 hover:bg-indigo-700 shadow"
              >
                <Send size={16} /> 보내기
              </button>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

function formatTime(ts) {
  const d = new Date(ts);
  const hh = `${d.getHours()}`.padStart(2, "0");
  const mm = `${d.getMinutes()}`.padStart(2, "0");
  return `${hh}:${mm}`;
}

async function callBackend({ history, onDelta, onProgress, onDone, onInterrupt, signal, resume }) {
    const endpoint = "/api/chat/stream";
    const payload  = resume ? { resume } : { messages: history };

    const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  });

  if (!res.ok || !res.body) {
    const txt = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} ${res.statusText} ${txt}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let skippedHandshake = false; // ⬅️ 첫 공백(핸드셰이크)만 패스

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
    let sep;
    while ((sep = buffer.indexOf("\n\n")) >= 0) {
      const event = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);

      for (const line of event.split("\n")) {
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (payload === "[DONE]") return;

        let obj;
        try { obj = JSON.parse(payload); } catch { obj = { delta: payload }; }
        // 🔹 진행 이벤트
        if (obj.kind === "progress") { onProgress?.(obj); continue; }
        // 🔹 결과 시작/완료 시 패널 닫기
        if (obj.kind === "done")     { onDone?.();     continue; }

        if (obj.kind === "interrupt" || obj.__interrupt__ || obj.interrupt) {
          let intr = null;
          if (obj.kind === "interrupt" && obj.payload) {
            intr = obj.payload;
          } else if (obj.interrupt) {
            intr = obj.interrupt;
          } else if (obj.__interrupt__) {
            const raw = Array.isArray(obj.__interrupt__) ? obj.__interrupt__[0] : obj.__interrupt__;
            intr = raw?.value ? raw : { value: raw };
          }
          if (intr?.value) { onInterrupt?.(intr); }
          continue;
        }

        // ✅ 첫 공백(핸드셰이크)만 무시
        let text = obj?.delta ?? "";
        if (text === " " && !skippedHandshake) {
          skippedHandshake = true;
          continue;
        }
        // ✅ 실제 띄어쓰기 토큰은 NBSP로 변환해서 눈에 보이게
        if (text === " ") text = "\u00A0";

        if (text !== "") onDelta(text);
      }
    }
  }
}

function BackgroundProgressInline({ steps }) {
  // idle 제외 → 진행될수록 한 줄씩 늘어남
  const shown = (steps || []).filter((s) => s.state !== "idle");

  return (
    <div className="mt-2 max-w-[80%]">
      <ul className="space-y-1 text-xs sm:text-sm text-neutral-500">
        {shown.map((s) => (
          <li key={s.id} className="flex items-center gap-2">
            {s.state === "running" && (
              <span className="w-2 h-2 rounded-full bg-neutral-400 animate-pulse" />
            )}
            {s.state === "done" && (
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
            )}
            <span className={s.state === "done" ? "opacity-60" : ""}>
              {s.label}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ConfirmInputInline({ id, data, onSubmit }) {
  const [values, setValues] = React.useState(data.proposed);

  const handleChange = (e) => {
    setValues({ ...values, [e.target.name]: e.target.value });
  };

  return (
    <div className="bg-gray-100 dark:bg-neutral-800 rounded-xl p-4 my-2 max-w-[80%] shadow">
      <p className="font-medium mb-3">{data.message}</p>

      <div className="space-y-3">
        {data.fields.map((field) => (
          <div key={field.name}>
            <label className="block text-sm mb-1">{field.label}</label>
            <input
              type={field.type}
              name={field.name}
              value={values[field.name]}
              onChange={handleChange}
              className="w-full border rounded p-2"
            />
          </div>
        ))}
      </div>

      <div className="mt-3 flex justify-end">
        <button
          onClick={() => onSubmit(values, id)}
          className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700"
        >
          확인
        </button>
      </div>
    </div>
  );
}