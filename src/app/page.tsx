"use client";

import { Database, Link2, Mail, Zap } from "lucide-react";

import { ChatWidget } from "@/components/chat/ChatWidget";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const FIVERR_URL = "https://es.fiverr.com/jcanocarballo";
const GITHUB_URL = "https://github.com/juliancanocarballo/ask-the-docs";

function openChat() {
  window.dispatchEvent(new CustomEvent("open-chat-widget"));
}

export default function Home() {
  return (
    <>
      {/* Hero */}
      <section className="flex min-h-screen flex-col items-center justify-center px-6 md:px-8">
        <div className="flex max-w-3xl flex-col items-center text-center">
          <span className="text-xs uppercase tracking-widest text-muted-foreground">
            Demo
          </span>
          <h1 className="mt-4 text-balance text-5xl font-bold tracking-tight md:text-7xl">
            Ask anything about the Supabase docs.
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-muted-foreground md:text-xl">
            A RAG chatbot indexed over 500+ pages of official Supabase
            documentation. Streaming answers with inline source citations,
            powered by Claude Haiku 4.5.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={openChat}
              className={cn(
                buttonVariants({ variant: "default", size: "lg" }),
                "px-5"
              )}
            >
              Try the demo
            </button>
            <a
              href={FIVERR_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                buttonVariants({ variant: "outline", size: "lg" }),
                "px-5"
              )}
            >
              Get this on your docs →
            </a>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="border-t px-6 py-20 md:px-8">
        <div className="mx-auto max-w-5xl">
          <div className="flex flex-col items-center text-center">
            <h2 className="text-3xl font-semibold">How it works</h2>
            <p className="mt-4 max-w-2xl text-muted-foreground">
              Every answer is grounded in the actual documentation. No
              hallucinated APIs, no invented function names. If the docs
              don&apos;t cover it, the bot says so.
            </p>
          </div>
          <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-2">
            <FeatureCard
              icon={<Database className="h-5 w-5" />}
              title="1,823 indexed chunks"
              description="The full Supabase docs site, split into semantic chunks and embedded with OpenAI text-embedding-3-small."
            />
            <FeatureCard
              icon={<Zap className="h-5 w-5" />}
              title="Streaming responses"
              description="Claude Haiku writes the answer token by token. You see the response forming in real time, not after a long wait."
            />
            <FeatureCard
              icon={<Link2 className="h-5 w-5" />}
              title="Inline citations"
              description="Every claim points back to the specific Supabase doc page. Hallucinations are rejected by a relevance gate in the system prompt."
            />
            <FeatureCard
              icon={<Mail className="h-5 w-5" />}
              title="Commercial intent detection"
              description="When a visitor asks about implementation help, the bot offers a contact form. Captured leads go straight to the database."
            />
          </div>
        </div>
      </section>

      {/* Pitch for buyers */}
      <section className="border-t bg-muted/30 px-6 py-20 md:px-8">
        <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
          <h2 className="text-3xl font-semibold">
            Want this on your product&apos;s docs?
          </h2>
          <p className="mt-4 text-muted-foreground">
            I build this exact chatbot, indexed over your documentation,
            deployed to your domain, in 7 days. Widget embeds with one script
            tag. Lead capture included. Source available.
          </p>
          <ul className="mt-8 flex flex-col gap-6 text-sm md:flex-row md:gap-10">
            <li className="font-medium">Indexed over your docs</li>
            <li className="font-medium">Deployed with your branding</li>
            <li className="font-medium">Leads in your database</li>
          </ul>
          <a
            href={FIVERR_URL}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              buttonVariants({ variant: "default", size: "lg" }),
              "mt-8 px-5"
            )}
          >
            See the offer on Fiverr →
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t px-6 py-8 text-center text-sm text-muted-foreground md:px-8">
        <p>
          Built by Julian Cano ·{" "}
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 hover:text-foreground"
          >
            GitHub
          </a>{" "}
          ·{" "}
          <a
            href={FIVERR_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 hover:text-foreground"
          >
            Fiverr
          </a>
        </p>
      </footer>

      <ChatWidget />
    </>
  );
}

type FeatureCardProps = {
  icon: React.ReactNode;
  title: string;
  description: string;
};

function FeatureCard({ icon, title, description }: FeatureCardProps) {
  return (
    <div className="rounded-lg border bg-card p-6">
      <div className="text-primary">{icon}</div>
      <h3 className="mt-4 font-semibold">{title}</h3>
      <p className="mt-2 text-sm text-muted-foreground">{description}</p>
    </div>
  );
}
