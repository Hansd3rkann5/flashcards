# `assistant` Edge Function

AI assistant backend for the flashcards app. Verifies the Supabase auth JWT,
loads the subject's knowledge base (RLS-scoped), and streams a Claude answer
(grounded in the materials, with prompt caching + citations) back as SSE.

## One-time setup

```bash
# 1) Store the Anthropic API key as an encrypted function secret
#    (never in git, never in the browser)
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...

# 2) Deploy the function
supabase functions deploy assistant
```

`SUPABASE_URL` and `SUPABASE_ANON_KEY` are injected automatically — do not set them.

## Redeploy after code changes

```bash
supabase functions deploy assistant
```

## Request contract

`POST {SUPABASE_URL}/functions/v1/assistant`

Headers: `Authorization: Bearer <user access token>`, `apikey: <anon key>`,
`Content-Type: application/json`

Body:

```json
{
  "subjectId": "<subject id>",
  "model": "claude-sonnet-4-6",         // or "claude-opus-4-8" (optional)
  "language": "auto",                    // "auto" (default) | "de" | "en"
  "messages": [{ "role": "user", "content": "Erklär mir Thema X" }]
}
```

`language`: `auto` answers in the language of the materials / the user's
question (the default the app should use); `de`/`en` force a language.

Response: `text/event-stream` with `data: {...}` events:

- `{ "type": "start", "model", "documentCount" }`
- `{ "type": "delta", "text": "…" }`   ← stream these into the UI
- `{ "type": "done", "usage", "citations", "stop_reason" }`
- `{ "type": "error", "message" }`

## Quick test from the browser console (while logged into the app)

```js
const { data: { session } } = await supabaseClient.auth.getSession();
const res = await fetch(`${window.__SUPABASE_URL__}/functions/v1/assistant`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${session.access_token}`,
    apikey: window.__SUPABASE_ANON_KEY__,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    subjectId: '<PASTE_A_SUBJECT_ID>',
    model: 'claude-sonnet-4-6',
    messages: [{ role: 'user', content: 'Fasse meine Materialien in 3 Punkten zusammen.' }],
  }),
});
const reader = res.body.getReader();
const dec = new TextDecoder();
for (;;) {
  const { value, done } = await reader.read();
  if (done) break;
  console.log(dec.decode(value));
}
```
