export function mockStreamResponse(
  onChunk: (chunk: string) => void,
  onDone: () => void
): () => void {
  const response =
    "This is a **mock response** for day 5. In day 6, this will be replaced by the real `/api/chat` streaming.\n\nHere's a code example:\n\n```ts\nconst supabase = createClient(url, key)\nconst { data } = await supabase.from('posts').select()\n```\n\n[Source: Day 5 mock - https://example.com]";
  const tokens = response.split(/(\s+)/);
  let i = 0;
  const id = setInterval(() => {
    if (i >= tokens.length) {
      clearInterval(id);
      onDone();
      return;
    }
    onChunk(tokens[i]);
    i++;
  }, 35);
  return () => clearInterval(id);
}
