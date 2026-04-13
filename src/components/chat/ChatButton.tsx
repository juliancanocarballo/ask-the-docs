"use client";

import { MessageCircle } from "lucide-react";
import { forwardRef } from "react";

type Props = {
  onClick: () => void;
};

export const ChatButton = forwardRef<HTMLButtonElement, Props>(
  function ChatButton({ onClick }, ref) {
    return (
      <button
        ref={ref}
        type="button"
        onClick={onClick}
        aria-label="Open chat"
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform duration-200 hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <MessageCircle className="h-6 w-6" />
      </button>
    );
  }
);
