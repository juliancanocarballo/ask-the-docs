"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { ChatButton } from "./ChatButton";
import { ChatPanel } from "./ChatPanel";
import { hasEmailCaptureMarker, stripMarkers } from "./markers";
import type { ChatMessage } from "./Message";
import {
  clearChat,
  loadConversationId,
  loadLeadSubmitted,
  loadMessages,
  saveConversationId,
  saveLeadSubmitted,
  saveMessages,
} from "./storage";
import { streamChat } from "./streamChat";

function makeId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

const NETWORK_ERROR_MSG = "Network error. Tap retry.";

export function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [showEmailCapture, setShowEmailCapture] = useState(false);
  const [leadSubmitted, setLeadSubmitted] = useState(false);

  const fabRef = useRef<HTMLButtonElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const hasHydratedRef = useRef(false);

  useEffect(() => {
    const stored = loadMessages();
    const storedId = loadConversationId();
    const storedLead = loadLeadSubmitted();
    const cleaned = stored.map((m) => ({ ...m, isStreaming: false }));
    if (cleaned.length > 0) setMessages(cleaned);
    if (storedId) setConversationId(storedId);
    if (storedLead) setLeadSubmitted(true);
    hasHydratedRef.current = true;
  }, []);

  useEffect(() => {
    if (!hasHydratedRef.current) return;
    saveMessages(messages);
  }, [messages]);

  useEffect(() => {
    const handler = () => setIsOpen(true);
    window.addEventListener("open-chat-widget", handler);
    return () => window.removeEventListener("open-chat-widget", handler);
  }, []);

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
      abortControllerRef.current?.abort();
    };
  }, []);

  const startStream = useCallback(
    (historyForApi: ChatMessage[], assistantId: string) => {
      setIsStreaming(true);
      const payload = historyForApi.map((m) => ({
        role: m.role,
        content: m.content,
      }));
      abortControllerRef.current = streamChat(payload, conversationId, {
        onConversationId: (id) => {
          setConversationId(id);
          saveConversationId(id);
        },
        onChunk: (chunk) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, content: m.content + chunk }
                : m
            )
          );
        },
        onDone: (fullText) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, isStreaming: false } : m
            )
          );
          setIsStreaming(false);
          abortControllerRef.current = null;
          if (hasEmailCaptureMarker(fullText)) setShowEmailCapture(true);
        },
        onError: (err) => {
          console.error("[chat] stream error:", err);
          const errorContent = err.message.startsWith("Rate limit")
            ? err.message
            : NETWORK_ERROR_MSG;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? {
                    ...m,
                    content: errorContent,
                    isStreaming: false,
                    isError: true,
                  }
                : m
            )
          );
          setIsStreaming(false);
          abortControllerRef.current = null;
        },
      });
    },
    [conversationId]
  );

  function handleNewChat() {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setMessages([]);
    setInputValue("");
    setIsStreaming(false);
    setConversationId(null);
    setShowEmailCapture(false);
    setLeadSubmitted(false);
    saveLeadSubmitted(false);
    clearChat();
  }

  function handleSend(textOverride?: string) {
    const text = (textOverride ?? inputValue).trim();
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

    const historyForApi = [...messages, userMsg];
    setMessages([...historyForApi, assistantMsg]);
    if (!textOverride) setInputValue("");

    startStream(historyForApi, assistantId);
  }

  function handleRetry() {
    if (isStreaming) return;
    const lastAssistantIdx = messages.length - 1;
    const last = messages[lastAssistantIdx];
    if (!last || !last.isError || last.role !== "assistant") return;

    let userIdx = -1;
    for (let i = lastAssistantIdx - 1; i >= 0; i--) {
      if (messages[i].role === "user") {
        userIdx = i;
        break;
      }
    }
    if (userIdx === -1) return;

    const trimmed = messages.slice(0, lastAssistantIdx);
    const newAssistantId = makeId();
    const assistantMsg: ChatMessage = {
      id: newAssistantId,
      role: "assistant",
      content: "",
      isStreaming: true,
    };
    setMessages([...trimmed, assistantMsg]);
    startStream(trimmed, newAssistantId);
  }

  function handleSubmitLead() {
    setLeadSubmitted(true);
    saveLeadSubmitted(true);
  }

  function handleDismissCapture() {
    setShowEmailCapture(false);
  }

  const last = messages[messages.length - 1];
  const lastIsAssistant = last?.role === "assistant" && !last.isError;
  const lastAssistantContent = lastIsAssistant ? stripMarkers(last.content) : "";

  const showEmailCaptureForm =
    showEmailCapture &&
    !leadSubmitted &&
    !isStreaming &&
    messages.length > 0 &&
    lastIsAssistant;

  const showSuggestedQuestions = messages.length === 0 && !isStreaming;

  return (
    <>
      {!isOpen && <ChatButton ref={fabRef} onClick={() => setIsOpen(true)} />}
      {isOpen && (
        <ChatPanel
          messages={messages}
          inputValue={inputValue}
          isStreaming={isStreaming}
          onInputChange={setInputValue}
          onSend={() => handleSend()}
          onNewChat={handleNewChat}
          onClose={close}
          onRetry={handleRetry}
          showEmailCaptureForm={showEmailCaptureForm}
          onSubmitLead={handleSubmitLead}
          onDismissCapture={handleDismissCapture}
          conversationId={conversationId}
          lastAssistantContent={lastAssistantContent}
          showSuggestedQuestions={showSuggestedQuestions}
          onSelectSuggestion={(q) => handleSend(q)}
        />
      )}
    </>
  );
}
