import React, { useEffect, useRef, useState } from "react";
import { Bot, Send, User, Trash2, Copy, Square, Play, Moon, Sun } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

/**
 * Minimal, pretty chat UI (React + Tailwind) — no backend required.
 * - Enter to send (Shift+Enter for newline)
 * - Typing indicator
 * - Copy message
 * - Clear chat
 * - Light/Dark toggle
 * - Mock streaming; swap to real API easily (see callBackend)
 */

const WELCOME = "안녕하세요! KFC 챗봇입니다. 무엇을 도와드릴까요?";

const USE_MOCK = false; // <- 실제 API 연결 시 false 로 바꾸고 callBackend 의 fetch 경로 주석 해제

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
  const [showIntro, setShowIntro] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(false);

  const listRef = useRef(null);
  const controllerRef = useRef(null);
  
  const asstIdRef = useRef(null);  // 첫 델타로 만든 assistant 메시지 id 저장
  const reqIdRef  = useRef(0);     // 요청 번호(가드)

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, isStreaming]);

  useEffect(() => {
    if (dark) document.documentElement.classList.add("dark");
    else document.documentElement.classList.remove("dark");
  }, [dark]);

  useEffect(() => {
    const hide = typeof window !== "undefined" && localStorage.getItem("hideIntro") === "1";
    setShowIntro(!hide);
  }, []);

  async function handleSend() {
    const text = input.trim();
    if (!text) return;

    const myReqId = ++reqIdRef.current;     // 이번 요청 번호
    asstIdRef.current = null;                // 이전 요청 잔재 제거

    const userMsg = { id: crypto.randomUUID(), role: "user", content: text, ts: Date.now() };
    setMessages((m) => [...m, userMsg]);
    setInput("");
    setIsStreaming(true);   // 무조건 켬

    const history = [...messages, userMsg].map((x) => ({ role: x.role, content: x.content }));

    try {
      controllerRef.current = new AbortController();

      await callBackend({
        history,
        signal: controllerRef.current.signal,
        onDelta: (delta) => {
          if (!delta) return;
          if (myReqId !== reqIdRef.current) return; // 이전/취소된 요청 델타 무시

          let created = false;
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
              created = true; // 첫 델타 → 말풍선 "추가"
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

  function stopStreaming() {
    try { controllerRef.current?.abort(); } catch {}
    reqIdRef.current++;         // 이후 늦게 도착할 델타는 모두 무시
    setIsStreaming(false);
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
      <IntroModal
        open={showIntro}
        dontShowAgain={dontShowAgain}
        setDontShowAgain={setDontShowAgain}
        onConfirm={() => {
          if (dontShowAgain) localStorage.setItem("hideIntro", "1");
          setShowIntro(false);
        }}
      />
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
        <div ref={listRef} className="h-[calc(100vh-210px)] overflow-y-auto py-6 space-y-4">
          <AnimatePresence initial={false}>
            {messages.map((m) => (
              <motion.div
                key={m.id}
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
                  <p className="whitespace-pre leading-relaxed text-[15px]">{m.content}</p>
                  <div className="mt-2 flex items-center justify-between text-[11px] opacity-70 select-none">
                    <time>{formatTime(m.ts)}</time>
                    <button
                      className="inline-flex items-center gap-1 hover:opacity-100"
                      onClick={() => navigator.clipboard.writeText(m.content)}
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
            ))}

            {isStreaming && (
              <motion.div
                key="typing"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex items-center gap-2 text-sm text-neutral-500"
              >
                <div className="p-2 rounded-xl bg-neutral-200 dark:bg-neutral-800">
                  <Bot size={16} />
                </div>
                <span className="inline-flex gap-1 items-center">
                  응답 생성 중
                  <span className="inline-flex">
                    <Dot />
                    <Dot delay={0.12} />
                    <Dot delay={0.24} />
                  </span>
                </span>
              </motion.div>
            )}
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

function Dot({ delay = 0 }) {
  return (
    <span
      className="w-1.5 h-1.5 rounded-full bg-current animate-bounce"
      style={{ animationDelay: `${delay}s` }}
    />
  );
}

function formatTime(ts) {
  const d = new Date(ts);
  const hh = `${d.getHours()}`.padStart(2, "0");
  const mm = `${d.getMinutes()}`.padStart(2, "0");
  return `${hh}:${mm}`;
}

/**
 * Replace this with your real API. Two modes:
 *  - MOCK streaming: emits tokens with delays (default)
 *  - REAL fetch: Example of JSON or SSE hookup provided in comments
 */

async function callBackend({ history, onDelta, signal }) {
  const res = await fetch("/api/chat/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages: history }),
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

        let text = "";
        try {
          const obj = JSON.parse(payload); // {"delta":"..."} 형태 우선
          text = obj?.delta ?? "";
        } catch {
          text = payload; // raw 문자열도 허용
        }

        // ✅ 첫 공백(핸드셰이크)만 무시
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

  // ------- REAL REST (non-streaming) example -------
  // const res = await fetch("/api/chat", {
  //   method: "POST",
  //   headers: { "Content-Type": "application/json" },
  //   body: JSON.stringify({ messages: history }),
  //   signal,
  // });
  // if (!res.ok) throw new Error("API error");
  // const data = await res.json(); // { content: string }
  // onDelta(data.content);

  // ------- REAL SSE (streaming) example -------
  // const res = await fetch("/api/chat/stream", {
  //   method: "POST",
  //   headers: { "Content-Type": "application/json" },
  //   body: JSON.stringify({ messages: history }),
  //   signal,
  // });
  // const reader = res.body.getReader();
  // const decoder = new TextDecoder();
  // while (true) {
  //   const { value, done } = await reader.read();
  //   if (done) break;
  //   const chunk = decoder.decode(value, { stream: true });
  //   // Expecting lines like: "data: {\"delta\":\"...\"}\n\n"
  //   for (const line of chunk.split("\n")) {
  //     if (!line.startsWith("data:")) continue;
  //     const payload = line.slice(5).trim();
  //     if (payload === "[DONE]") break;
  //     try {
  //       const { delta } = JSON.parse(payload);
  //       if (delta) onDelta(delta);
  //     } catch {}
  //   }
  // }

function mockResponse(prompt) {
  const base = `질문: ${prompt}\n\n이건 모의 응답입니다. 실제 모델/API와 연결하면 여기에 답변이 도착합니다. 연결 방법은 상단 코드의 callBackend() 주석을 참고하세요.`;
  return tokenize(base);
}

function tokenize(text) {
  // super-naive tokenization for demo streaming
  const parts = [];
  for (let i = 0; i < text.length; i += Math.max(1, Math.floor(Math.random() * 3))) {
    parts.push(text.slice(i, i + 1));
  }
  return parts;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function IntroModal({ open, onConfirm, dontShowAgain, setDontShowAgain }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
        >
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <motion.div
            initial={{ y: 40, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 20, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="relative w-full sm:max-w-md mx-2 sm:mx-0 rounded-3xl bg-white dark:bg-neutral-900 shadow-2xl border border-neutral-200/60 dark:border-neutral-800/60"
            role="dialog" aria-modal="true"
          >
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 text-white grid place-items-center shadow">
                  <Bot size={18} />
                </div>
                <h2 className="text-lg font-semibold">AI가 알려주는 미국식 투자</h2>
              </div>

              <p className="text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
                미국 현지 투자정보와 차별화된 인사이트를 바탕으로 투자 판단을 돕고 질문까지 가능한 AI 에이전트입니다.
              </p>

              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                ※ 본 자료는 참고용이며 정확성/완전성을 보장하지 않습니다. 투자 결과는 투자자 본인에게 귀속됩니다.
              </p>

              <label className="flex items-center gap-2 text-sm select-none">
                <input
                  type="checkbox"
                  className="size-4 rounded border-neutral-300 dark:border-neutral-700"
                  checked={dontShowAgain}
                  onChange={(e) => setDontShowAgain(e.target.checked)}
                />
                더 이상 보지 않기
              </label>

              <div className="pt-2">
                <button
                  onClick={onConfirm}
                  className="w-full rounded-2xl px-4 py-3 bg-green-500 text-white hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-green-400"
                >
                  확인
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
