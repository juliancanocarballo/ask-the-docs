"use client";

import { RotateCcw } from "lucide-react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

import { stripMarkers } from "./markers";

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
  isError?: boolean;
};

const markdownComponents: Components = {
  code({ className, children, ...props }) {
    const isInline = !className;
    if (isInline) {
      return (
        <code
          className="rounded bg-muted px-1 py-0.5 font-mono text-sm"
          {...props}
        >
          {children}
        </code>
      );
    }
    return (
      <code
        className={`block w-full overflow-x-auto rounded-md bg-muted p-3 font-mono text-sm ${className ?? ""}`}
        {...props}
      >
        {children}
      </code>
    );
  },
  pre({ children }) {
    return <pre className="my-2 w-full">{children}</pre>;
  },
  a({ children, ...props }) {
    return (
      <a
        className="text-primary underline underline-offset-2 hover:opacity-80"
        target="_blank"
        rel="noopener noreferrer"
        {...props}
      >
        {children}
      </a>
    );
  },
  ul({ children }) {
    return <ul className="my-2 list-disc pl-5">{children}</ul>;
  },
  ol({ children }) {
    return <ol className="my-2 list-decimal pl-5">{children}</ol>;
  },
  p({ children }) {
    return <p className="my-1 leading-relaxed">{children}</p>;
  },
};

type Props = {
  message: ChatMessage;
  onRetry?: () => void;
};

export function Message({ message, onRetry }: Props) {
  const isUser = message.role === "user";

  if (message.isError) {
    return (
      <div className="flex w-full justify-start">
        <div className="max-w-[90%] rounded-2xl rounded-tl-sm border border-destructive/50 bg-destructive/5 px-3 py-2 text-sm">
          <p className="text-destructive">{message.content}</p>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="mt-2 inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-destructive transition-colors hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <RotateCcw className="h-3 w-3" />
              Retry
            </button>
          )}
        </div>
      </div>
    );
  }

  const content = stripMarkers(message.content);

  return (
    <div className={`flex w-full ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={
          isUser
            ? "max-w-[80%] rounded-2xl rounded-tr-sm bg-muted px-3 py-2 text-sm"
            : "max-w-[90%] rounded-2xl rounded-tl-sm border bg-card px-3 py-2 text-sm"
        }
      >
        <div className="break-words">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
            {content}
          </ReactMarkdown>
          {message.isStreaming && (
            <span
              aria-hidden="true"
              className="animate-blink ml-0.5 inline-block align-baseline font-mono"
            >
              ▋
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
