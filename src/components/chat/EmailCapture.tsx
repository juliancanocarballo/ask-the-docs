"use client";

import { X } from "lucide-react";
import { useRef, useState, type FormEvent } from "react";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Props = {
  conversationId: string | null;
  lastAssistantContent: string;
  onSubmitted: () => void;
  onDismiss: () => void;
};

type Status = "idle" | "submitting" | "success" | "error";

export function EmailCapture({
  conversationId,
  lastAssistantContent,
  onSubmitted,
  onDismiss,
}: Props) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const submittedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (status === "submitting" || status === "success") return;

    const trimmed = email.trim().toLowerCase();
    if (!EMAIL_RE.test(trimmed)) {
      setErrorMsg("Please enter a valid email");
      setStatus("error");
      return;
    }

    setStatus("submitting");
    setErrorMsg(null);

    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: trimmed,
          name: name.trim() || undefined,
          conversationId,
          context: lastAssistantContent.slice(0, 500),
        }),
      });

      if (!res.ok) {
        setStatus("error");
        setErrorMsg("Something went wrong. Please try again.");
        return;
      }

      setStatus("success");
      submittedTimerRef.current = setTimeout(() => {
        onSubmitted();
      }, 1500);
    } catch {
      setStatus("error");
      setErrorMsg("Network error. Please try again.");
    }
  }

  if (status === "success") {
    return (
      <div className="rounded-lg border bg-muted p-4 text-sm">
        <p className="font-medium">Thanks! We&apos;ll be in touch.</p>
      </div>
    );
  }

  const isSubmitting = status === "submitting";

  return (
    <div className="relative rounded-lg border bg-muted p-4">
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="absolute right-2 top-2 inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X className="h-3.5 w-3.5" />
      </button>
      <p className="text-sm font-medium">Want the team to contact you?</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Leave your email and we&apos;ll reach out with implementation help.
      </p>
      <form onSubmit={handleSubmit} className="mt-3 flex flex-col gap-2">
        <input
          type="text"
          inputMode="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          disabled={isSubmitting}
          className="w-full rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        />
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name (optional)"
          disabled={isSubmitting}
          maxLength={100}
          className="w-full rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        />
        {errorMsg && (
          <p className="text-xs text-destructive">{errorMsg}</p>
        )}
        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {isSubmitting ? "Sending..." : "Send"}
        </button>
      </form>
    </div>
  );
}
