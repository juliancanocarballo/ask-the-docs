"use client";

import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
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
};

export function Message({ message }: Props) {
  const isUser = message.role === "user";
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
            {message.content}
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
