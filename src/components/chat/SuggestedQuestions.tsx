"use client";

const QUESTIONS = [
  "What's the difference between anon key and service role key?",
  "How do I sign in with Google using Supabase Auth?",
  "How do I upload files to Storage?",
  "How do Edge Functions handle secrets?",
];

type Props = {
  onSelect: (question: string) => void;
};

export function SuggestedQuestions({ onSelect }: Props) {
  return (
    <div className="mt-4 flex flex-wrap justify-center gap-2">
      {QUESTIONS.map((q) => (
        <button
          key={q}
          type="button"
          onClick={() => onSelect(q)}
          className="rounded-full border bg-background px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {q}
        </button>
      ))}
    </div>
  );
}
