"use client";

import { ChatHeader } from "./ChatHeader";
import { MessageInput } from "./MessageInput";
import { MessageList } from "./MessageList";
import type { ChatMessage } from "./Message";

type Props = {
  messages: ChatMessage[];
  inputValue: string;
  isStreaming: boolean;
  onInputChange: (v: string) => void;
  onSend: () => void;
  onNewChat: () => void;
  onClose: () => void;
};

export function ChatPanel({
  messages,
  inputValue,
  isStreaming,
  onInputChange,
  onSend,
  onNewChat,
  onClose,
}: Props) {
  return (
    <div
      role="dialog"
      aria-label="Chat with Supabase assistant"
      className="fixed inset-0 z-50 flex h-full w-full flex-col overflow-hidden bg-card md:inset-auto md:bottom-6 md:right-6 md:h-[600px] md:w-[400px] md:rounded-lg md:border md:shadow-2xl"
      style={{
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
        paddingLeft: "env(safe-area-inset-left)",
        paddingRight: "env(safe-area-inset-right)",
      }}
    >
      <ChatHeader onNewChat={onNewChat} onClose={onClose} />
      <MessageList messages={messages} />
      <MessageInput
        value={inputValue}
        onChange={onInputChange}
        onSend={onSend}
        disabled={isStreaming}
      />
    </div>
  );
}
