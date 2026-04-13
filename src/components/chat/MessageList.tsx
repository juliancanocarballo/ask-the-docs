"use client";

import { useEffect, useRef } from "react";

import { EmailCapture } from "./EmailCapture";
import { Message, type ChatMessage } from "./Message";
import { SuggestedQuestions } from "./SuggestedQuestions";

type Props = {
  messages: ChatMessage[];
  onRetry?: () => void;
  showEmailCaptureForm: boolean;
  onSubmitLead: () => void;
  onDismissCapture: () => void;
  conversationId: string | null;
  lastAssistantContent: string;
  showSuggestedQuestions: boolean;
  onSelectSuggestion: (q: string) => void;
};

export function MessageList({
  messages,
  onRetry,
  showEmailCaptureForm,
  onSubmitLead,
  onDismissCapture,
  conversationId,
  lastAssistantContent,
  showSuggestedQuestions,
  onSelectSuggestion,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const shouldStickRef = useRef(true);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    if (shouldStickRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, showEmailCaptureForm]);

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
        {showSuggestedQuestions && (
          <SuggestedQuestions onSelect={onSelectSuggestion} />
        )}
      </div>
    );
  }

  const last = messages[messages.length - 1];
  const retryEnabled = Boolean(onRetry && last?.isError);

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-4"
    >
      {messages.map((m, i) => {
        const isLast = i === messages.length - 1;
        const retryForThis = retryEnabled && isLast ? onRetry : undefined;
        return <Message key={m.id} message={m} onRetry={retryForThis} />;
      })}
      {showEmailCaptureForm && (
        <EmailCapture
          conversationId={conversationId}
          lastAssistantContent={lastAssistantContent}
          onSubmitted={onSubmitLead}
          onDismiss={onDismissCapture}
        />
      )}
    </div>
  );
}
