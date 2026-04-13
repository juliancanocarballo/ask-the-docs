-- ask-the-docs: Supabase schema
-- Run this in the Supabase SQL Editor on a fresh project.

create extension if not exists vector;

-- ---------------------------------------------------------------------------
-- documents: indexed doc chunks with embeddings
-- ---------------------------------------------------------------------------
create table if not exists documents (
  id            bigserial primary key,
  source_url    text        not null,
  source_title  text        not null,
  section       text,
  breadcrumb    text,
  content       text        not null,
  content_hash  text        not null,
  embedding     vector(1536),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists documents_embedding_ivfflat
  on documents using ivfflat (embedding vector_cosine_ops) with (lists = 100);

create index if not exists documents_source_url_idx on documents (source_url);

create unique index if not exists documents_content_hash_uniq
  on documents (content_hash);

-- ---------------------------------------------------------------------------
-- conversations: full chat log for analysis
-- ---------------------------------------------------------------------------
create table if not exists conversations (
  id          bigserial primary key,
  session_id  text        not null,
  ip_hash     text        not null,
  role        text        not null check (role in ('user', 'assistant')),
  content     text        not null,
  sources     jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists conversations_session_id_idx
  on conversations (session_id);

create index if not exists conversations_ip_hash_created_at_idx
  on conversations (ip_hash, created_at);

-- ---------------------------------------------------------------------------
-- leads: emails captured by the commercial-intent action
-- ---------------------------------------------------------------------------
create table if not exists leads (
  id          bigserial primary key,
  email       text        not null,
  session_id  text,
  context     text,
  created_at  timestamptz not null default now()
);

create index if not exists leads_email_idx on leads (email);

-- ---------------------------------------------------------------------------
-- match_documents: cosine similarity search used by /api/chat
-- ---------------------------------------------------------------------------
-- Drop any prior signature so re-running the schema always lands on the
-- canonical 3-arg version (CREATE OR REPLACE fails silently if args differ).
drop function if exists match_documents(vector, float);
drop function if exists match_documents(vector, double precision);
drop function if exists match_documents(vector(1536), float);
drop function if exists match_documents(vector(1536), double precision);
drop function if exists match_documents(vector, float, int);
drop function if exists match_documents(vector, double precision, integer);
drop function if exists match_documents(vector(1536), float, int);
drop function if exists match_documents(vector(1536), double precision, integer);

create function match_documents(
  query_embedding vector(1536),
  match_threshold float default 0.7,
  match_count     int   default 5
)
returns table (
  id           bigint,
  source_url   text,
  source_title text,
  section      text,
  breadcrumb   text,
  content      text,
  similarity   float
)
language sql stable
as $$
  select
    d.id,
    d.source_url,
    d.source_title,
    d.section,
    d.breadcrumb,
    d.content,
    1 - (d.embedding <=> query_embedding) as similarity
  from documents d
  where d.embedding is not null
    and 1 - (d.embedding <=> query_embedding) >= match_threshold
  order by d.embedding <=> query_embedding
  limit match_count;
$$;
