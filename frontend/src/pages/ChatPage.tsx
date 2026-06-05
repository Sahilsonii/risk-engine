import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { Sidebar } from '../components/Layout/Sidebar';
import { Send, Bot, User, Sparkles, RefreshCw, CornerDownLeft } from 'lucide-react';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  loading?: boolean;
}

const SUGGESTED_PROMPTS = [
  'What are the top flagged transactions this week?',
  'Summarize the rejection rate trend over the last 7 days.',
  'Which merchants have the highest risk scores?',
  'Are there any unusual transaction patterns I should review?',
  'What is the total volume of approved transactions today?',
];

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000';

export function ChatPage() {
  const { getToken } = useAuth();
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content:
        "Hello! I'm your **AI Risk Analyst**, powered by Gemma and trained on your transaction data. Ask me anything about your transactions, risk trends, or merchant analytics. I use RAG to retrieve real-time context from your data.",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isLoading) return;

      const userMsg: Message = {
        id: Date.now().toString(),
        role: 'user',
        content: trimmed,
        timestamp: new Date(),
      };

      const loadingMsg: Message = {
        id: 'loading-' + Date.now(),
        role: 'assistant',
        content: '',
        timestamp: new Date(),
        loading: true,
      };

      setMessages((prev) => [...prev, userMsg, loadingMsg]);
      setInput('');
      setIsLoading(true);

      try {
        const token = await getToken();
        if (!token) throw new Error('Not authenticated');

        const res = await fetch(`${API_BASE}/api/chat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            message: trimmed,
            history: messages
              .filter((m) => !m.loading)
              .slice(-10)
              .map((m) => ({ role: m.role, content: m.content })),
          }),
        });

        const data = await res.json();
        const replyText = data.reply || data.message || 'Sorry, I could not generate a response. Please try again.';

        setMessages((prev) =>
          prev.map((m) =>
            m.loading ? { ...m, content: replyText, loading: false } : m
          )
        );
      } catch (err: any) {
        setMessages((prev) =>
          prev.map((m) =>
            m.loading
              ? {
                  ...m,
                  content:
                    '⚠️ Failed to connect to the AI service. Please ensure the backend is running and the Gemma API key is configured.',
                  loading: false,
                }
              : m
          )
        );
      } finally {
        setIsLoading(false);
        inputRef.current?.focus();
      }
    },
    [getToken, isLoading, messages]
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const formatMessage = (text: string) => {
    return text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`(.*?)`/g, '<code class="bg-zinc-100 dark:bg-zinc-800 px-1 py-0.5 rounded text-[11px] font-mono">$1</code>')
      .replace(/\n/g, '<br/>');
  };

  return (
    <div
      className="flex bg-zinc-50 dark:bg-zinc-950 min-h-screen text-zinc-800 dark:text-zinc-100"
      style={{ fontFamily: 'Inter, sans-serif' }}
    >
      <Sidebar />

      <main className="ml-56 flex-1 flex flex-col h-screen overflow-hidden">
        {/* ── Frosted-glass Header ── */}
        <div className="sticky top-0 z-40 bg-zinc-50/90 dark:bg-zinc-950/90 backdrop-blur-md border-b border-zinc-200/60 dark:border-zinc-800/60 px-6 py-4 shadow-sm flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
              <Bot size={18} className="text-white" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-zinc-800 dark:text-zinc-100">AI Risk Analyst</h1>
              <p className="text-[10px] text-zinc-400 dark:text-zinc-500 font-mono">Powered by Gemma · RAG-enhanced · Live transaction context</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-[10px] font-semibold">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Online
            </div>
            <button
              onClick={() =>
                setMessages([
                  {
                    id: 'welcome-' + Date.now(),
                    role: 'assistant',
                    content: "Hello! I'm your **AI Risk Analyst**. How can I help you today?",
                    timestamp: new Date(),
                  },
                ])
              }
              className="p-2 rounded-md text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              title="Clear chat"
            >
              <RefreshCw size={14} />
            </button>
          </div>
        </div>

        {/* ── Messages Area ── */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-4">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex items-end gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
            >
              {/* Avatar */}
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 mb-1 ${
                  msg.role === 'user'
                    ? 'bg-blue-600 shadow-md shadow-blue-500/30'
                    : 'bg-gradient-to-br from-violet-500 to-blue-600 shadow-md shadow-violet-500/20'
                }`}
              >
                {msg.role === 'user' ? (
                  <User size={13} className="text-white" />
                ) : (
                  <Bot size={13} className="text-white" />
                )}
              </div>

              {/* Bubble */}
              <div
                className={`max-w-[72%] rounded-2xl px-4 py-3 text-sm leading-relaxed relative group transition-all ${
                  msg.role === 'user'
                    ? 'bg-gradient-to-br from-blue-600 to-blue-700 text-white rounded-br-sm shadow-lg shadow-blue-600/15'
                    : 'bg-white dark:bg-zinc-900/80 border border-zinc-200/80 dark:border-zinc-800/80 text-zinc-800 dark:text-zinc-100 rounded-bl-sm shadow-sm'
                }`}
              >
                {msg.loading ? (
                  <div className="flex items-center gap-1.5 py-1">
                    <div className="w-2 h-2 rounded-full bg-zinc-400 dark:bg-zinc-500 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-2 h-2 rounded-full bg-zinc-400 dark:bg-zinc-500 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-2 h-2 rounded-full bg-zinc-400 dark:bg-zinc-500 animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                ) : (
                  <div
                    dangerouslySetInnerHTML={{ __html: formatMessage(msg.content) }}
                  />
                )}

                {/* Timestamp */}
                <div
                  className={`text-[9px] mt-1.5 font-mono opacity-60 ${
                    msg.role === 'user' ? 'text-blue-100 text-right' : 'text-zinc-400'
                  }`}
                >
                  {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {/* ── Suggested Prompts ── */}
        {messages.length <= 1 && (
          <div className="px-6 pb-3">
            <p className="text-[10px] uppercase font-bold text-zinc-400 dark:text-zinc-500 tracking-wider mb-2 flex items-center gap-1">
              <Sparkles size={10} /> Suggested questions
            </p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTED_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => sendMessage(prompt)}
                  className="text-xs px-3 py-1.5 rounded-full border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 text-zinc-600 dark:text-zinc-300 hover:border-blue-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/20 transition-all"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Input Area ── */}
        <div className="px-6 pb-6 pt-2">
          <div className="flex items-end gap-3 bg-white dark:bg-zinc-900/80 border border-zinc-200/80 dark:border-zinc-800/80 rounded-2xl px-4 py-3 shadow-sm focus-within:border-blue-400 dark:focus-within:border-blue-600 transition-colors">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about your transactions, risk patterns, or merchant analytics..."
              rows={1}
              disabled={isLoading}
              className="flex-1 resize-none bg-transparent text-sm text-zinc-800 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-600 focus:outline-none leading-relaxed max-h-32 overflow-auto disabled:opacity-50"
              style={{ minHeight: '24px' }}
            />
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[10px] text-zinc-300 dark:text-zinc-700 font-mono hidden sm:block">
                <CornerDownLeft size={10} className="inline" /> to send
              </span>
              <button
                onClick={() => sendMessage(input)}
                disabled={!input.trim() || isLoading}
                className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 text-white flex items-center justify-center hover:from-blue-400 hover:to-blue-600 transition-all shadow-md shadow-blue-500/20 disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
              >
                {isLoading ? (
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <Send size={13} />
                )}
              </button>
            </div>
          </div>
          <p className="text-[10px] text-zinc-400 dark:text-zinc-600 text-center mt-2">
            AI responses are generated from your live transaction data via RAG. Verify critical decisions independently.
          </p>
        </div>
      </main>
    </div>
  );
}
