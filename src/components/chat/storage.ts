const STORAGE_KEY_MESSAGES = "ask-the-docs:messages";
const STORAGE_KEY_CONV_ID = "ask-the-docs:conversationId";
const STORAGE_KEY_LEAD_SUBMITTED = "ask-the-docs:leadSubmitted";
const MAX_MESSAGES = 50;

export type StoredMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  isError?: boolean;
};

export function loadMessages(): StoredMessage[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY_MESSAGES);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as StoredMessage[]) : [];
  } catch {
    return [];
  }
}

export function saveMessages(messages: StoredMessage[]): void {
  if (typeof window === "undefined") return;
  try {
    const trimmed = messages.slice(-MAX_MESSAGES);
    localStorage.setItem(STORAGE_KEY_MESSAGES, JSON.stringify(trimmed));
  } catch {
    // Quota exceeded or other; silently ignore.
  }
}

export function loadConversationId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(STORAGE_KEY_CONV_ID);
  } catch {
    return null;
  }
}

export function saveConversationId(id: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (id) localStorage.setItem(STORAGE_KEY_CONV_ID, id);
    else localStorage.removeItem(STORAGE_KEY_CONV_ID);
  } catch {
    // ignore
  }
}

export function loadLeadSubmitted(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = localStorage.getItem(STORAGE_KEY_LEAD_SUBMITTED);
    return raw === "true";
  } catch {
    return false;
  }
}

export function saveLeadSubmitted(v: boolean): void {
  if (typeof window === "undefined") return;
  try {
    if (v) localStorage.setItem(STORAGE_KEY_LEAD_SUBMITTED, "true");
    else localStorage.removeItem(STORAGE_KEY_LEAD_SUBMITTED);
  } catch {
    // ignore
  }
}

export function clearChat(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(STORAGE_KEY_MESSAGES);
    localStorage.removeItem(STORAGE_KEY_CONV_ID);
    localStorage.removeItem(STORAGE_KEY_LEAD_SUBMITTED);
  } catch {
    // ignore
  }
}
