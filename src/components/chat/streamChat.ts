export type StreamChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type SourcePayload = {
  title: string;
  url: string;
  section: string | null;
  similarity: number;
};

export type StreamCallbacks = {
  onConversationId: (id: string) => void;
  onSources?: (sources: SourcePayload[]) => void;
  onChunk: (chunk: string) => void;
  onDone: (fullText: string) => void;
  onError: (err: Error) => void;
};

export function streamChat(
  messages: StreamChatMessage[],
  conversationId: string | null,
  callbacks: StreamCallbacks
): AbortController {
  const controller = new AbortController();

  (async () => {
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages, conversationId }),
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const headerConvId = res.headers.get("X-Conversation-Id");
      if (headerConvId) callbacks.onConversationId(headerConvId);

      if (!res.body) throw new Error("No response body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";
      let fullText = "";
      let done = false;

      const flushEvent = (eventName: string, dataLines: string[]): boolean => {
        const raw = dataLines.join("\n");
        if (eventName === "done") return true;
        if (eventName === "sources") {
          try {
            const parsed = JSON.parse(raw) as SourcePayload[];
            callbacks.onSources?.(parsed);
          } catch {
            // ignore malformed
          }
          return false;
        }
        // Default "message" event: data is a JSON-encoded string chunk.
        try {
          const delta = JSON.parse(raw);
          if (typeof delta === "string" && delta.length > 0) {
            fullText += delta;
            callbacks.onChunk(delta);
          }
        } catch {
          // ignore malformed frames
        }
        return false;
      };

      const parseBuffer = (): boolean => {
        let sepIdx = buffer.indexOf("\n\n");
        while (sepIdx !== -1) {
          const frame = buffer.slice(0, sepIdx);
          buffer = buffer.slice(sepIdx + 2);
          const lines = frame.split(/\r?\n/);
          let eventName = "message";
          const dataLines: string[] = [];
          for (const line of lines) {
            if (line.startsWith("event:")) {
              eventName = line.slice(6).trim();
            } else if (line.startsWith("data:")) {
              dataLines.push(line.slice(5).replace(/^ /, ""));
            }
          }
          if (flushEvent(eventName, dataLines)) return true;
          sepIdx = buffer.indexOf("\n\n");
        }
        return false;
      };

      while (!done) {
        const { done: readerDone, value } = await reader.read();
        if (readerDone) break;
        buffer += decoder.decode(value, { stream: true });
        if (parseBuffer()) {
          done = true;
          break;
        }
      }

      buffer += decoder.decode();
      if (!done) parseBuffer();

      callbacks.onDone(fullText);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      callbacks.onError(err instanceof Error ? err : new Error(String(err)));
    }
  })();

  return controller;
}
