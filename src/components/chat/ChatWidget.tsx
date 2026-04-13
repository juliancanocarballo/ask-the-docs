"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { ChatButton } from "./ChatButton";
import { ChatPanel } from "./ChatPanel";
import type { ChatMessage } from "./Message";
import { mockStreamResponse } from "./mockStream";

function makeId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);

  const fabRef = useRef<HTMLButtonElement>(null);
  const cancelStreamRef = useRef<(() => void) | null>(null);

  const close = useCallback(() => {
    setIsOpen(false);
    requestAnimationFrame(() => fabRef.current?.focus());
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, close]);

  useEffect(() => {
    return () => {
      cancelStreamRef.current?.();
    };
  }, []);

  function handleNewChat() {
    cancelStreamRef.current?.();
    cancelStreamRef.current = null;
    setMessages([]);
    setInputValue("");
    setIsStreaming(false);
  }

  function handleSend() {
    const text = inputValue.trim();
    if (!text || isStreaming) return;

    const userMsg: ChatMessage = {
      id: makeId(),
      role: "user",
      content: text,
    };
    const assistantId = makeId();
    const assistantMsg: ChatMessage = {
      id: assistantId,
      role: "assistant",
      content: "",
      isStreaming: true,
    };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setInputValue("");
    setIsStreaming(true);

    cancelStreamRef.current = mockStreamResponse(
      (chunk) => {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, content: m.content + chunk } : m
          )
        );
      },
      () => {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, isStreaming: false } : m
          )
        );
        setIsStreaming(false);
        cancelStreamRef.current = null;
      }
    );
  }

  return (
    <>
      {!isOpen && <ChatButton ref={fabRef} onClick={() => setIsOpen(true)} />}
      {isOpen && (
        <ChatPanel
          messages={messages}
          inputValue={inputValue}
          isStreaming={isStreaming}
          onInputChange={setInputValue}
          onSend={handleSend}
          onNewChat={handleNewChat}
          onClose={close}
        />
      )}
    </>
  );
}
