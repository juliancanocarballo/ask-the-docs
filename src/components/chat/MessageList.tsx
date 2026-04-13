"use client";

import { useEffect, useRef } from "react";

import { Message, type ChatMessage } from "./Message";

type Props = {
  messages: ChatMessage[];
};

export function MessageList({ messages }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const shouldStickRef = useRef(true);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    if (shouldStickRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  function handleScroll() {
    const el = containerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - (el.scrollTop + el.clientHeight);
    shouldStickRef.current = distanceFromBottom < 100;
  }

  if (messages.length === 0) {
    return (
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex flex-1 flex-col items-center justify-center overflow-y-auto px-6 text-center"
      >
        <p className="text-sm font-medium text-foreground">
          Ask me anything about Supabase docs
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Database, Auth, Storage, Edge Functions, Realtime.
        </p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-4"
    >
      {messages.map((m) => (
        <Message key={m.id} message={m} />
      ))}
    </div>
  );
}
