import { ChatWidget } from "@/components/chat/ChatWidget";

export default function Home() {
  return (
    <div className="flex flex-1 items-center justify-center px-6">
      <main className="flex flex-col items-center gap-4 text-center">
        <h1 className="text-3xl font-semibold tracking-tight">
          ask-the-docs demo
        </h1>
        <p className="max-w-md text-base text-muted-foreground">
          Chatbot RAG sobre documentación de Supabase. Pregunta lo que quieras.
        </p>
      </main>
      <ChatWidget />
    </div>
  );
}
