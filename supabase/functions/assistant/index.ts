// Supabase Edge Function: `assistant`
// ============================================================================
// AI assistant for the flashcards app (Phase 2).
//
// - Verifies the caller's Supabase auth JWT (only logged-in users).
// - Loads the subject's knowledge base (RLS-scoped to the caller) from the
//   `records` store (store = 'knowledge') + the extracted text in Storage.
// - Asks Claude to answer PRIMARILY from those materials, with prompt caching
//   and citations, and streams the answer back to the browser as SSE.
//
// Secrets / env (set via `supabase secrets set` — never commit these):
//   ANTHROPIC_API_KEY   your Anthropic API key
// Auto-injected by Supabase:
//   SUPABASE_URL, SUPABASE_ANON_KEY
//
// Deploy:  supabase functions deploy assistant
// Secret:  supabase secrets set ANTHROPIC_API_KEY=sk-ant-...

import Anthropic from "npm:@anthropic-ai/sdk@0.65.0";
import { createClient } from "npm:@supabase/supabase-js@2";

const KNOWLEDGE_STORE = "knowledge";
const KNOWLEDGE_BUCKET = "knowledge";

// Model allow-list. Default = Sonnet (cheaper); Opus for hard questions.
const ALLOWED_MODELS = new Set(["claude-sonnet-4-6", "claude-opus-4-8"]);
const DEFAULT_MODEL = "claude-sonnet-4-6";

const BASE_SYSTEM = [
  "You are a helpful study assistant inside a flashcards app.",
  "Answer questions PRIMARILY from the user's provided lecture materials.",
  "When the materials cover the question, rely exclusively on them and cite the specific source passages.",
  "Only when the materials do not answer the question, add general subject knowledge and clearly mark it as not coming from the user's materials (in the same language as your answer).",
  "If no materials are provided at all, say so briefly and answer to the best of your knowledge with that same marker.",
  "Be clear, correct and concise.",
].join(" ");

// Output-language control. `auto` = language of the materials / the user's
// question (the default); `de`/`en` force a specific language.
const LANGUAGE_RULE: Record<string, string> = {
  auto:
    "Answer in the same language as the lecture materials and the user's question — match that language, do not translate.",
  de: "Answer in German (Deutsch), regardless of the language of the materials or question.",
  en: "Answer in English, regardless of the language of the materials or question.",
};
const ALLOWED_LANGUAGES = new Set(["auto", "de", "en"]);

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

/** Parse an `sb://knowledge/<path>` reference into its storage object path. */
function storagePathFromRef(ref: string): string | null {
  const prefix = `sb://${KNOWLEDGE_BUCKET}/`;
  const value = String(ref || "");
  return value.startsWith(prefix) ? value.slice(prefix.length) : null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }

  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!anthropicKey) {
    return json({ error: "server_misconfigured", detail: "ANTHROPIC_API_KEY missing" }, 500);
  }

  // ---- Auth: verify the caller's Supabase JWT and scope all reads by RLS ----
  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return json({ error: "unauthorized" }, 401);
  }
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });

  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData?.user) {
    return json({ error: "unauthorized" }, 401);
  }

  // ---- Request body ----
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const subjectId = String(body.subjectId || "").trim();
  const model = ALLOWED_MODELS.has(String(body.model)) ? String(body.model) : DEFAULT_MODEL;
  const language = ALLOWED_LANGUAGES.has(String(body.language)) ? String(body.language) : "auto";
  const rawMessages = Array.isArray(body.messages) ? body.messages : [];
  if (!subjectId) return json({ error: "missing_subject" }, 400);

  const systemText = `${BASE_SYSTEM} ${LANGUAGE_RULE[language]}`;

  // Only accept plain user/assistant text turns from the client.
  const conversation = rawMessages
    .map((m: any) => ({
      role: m?.role === "assistant" ? "assistant" : "user",
      content: String(m?.content ?? "").slice(0, 20000),
    }))
    .filter((m: any) => m.content.trim().length > 0)
    .slice(-20);
  if (!conversation.length) return json({ error: "empty_messages" }, 400);

  // ---- Load the subject's knowledge base (RLS-scoped to this user) ----
  const { data: rows, error: recErr } = await supabase
    .from("records")
    .select("record_key,payload")
    .eq("store", KNOWLEDGE_STORE)
    .eq("payload->>subjectId", subjectId);
  if (recErr) {
    return json({ error: "knowledge_read_failed", detail: recErr.message }, 500);
  }

  const documents: { title: string; text: string }[] = [];
  for (const row of rows || []) {
    const payload = (row as any)?.payload || {};
    let text = String(payload.text || "");
    if (!text && payload.textRef) {
      const path = storagePathFromRef(String(payload.textRef));
      if (path) {
        const dl = await supabase.storage.from(KNOWLEDGE_BUCKET).download(path);
        if (!dl.error && dl.data) text = await dl.data.text();
      }
    }
    if (text.trim()) {
      documents.push({ title: String(payload.filename || "Material"), text });
    }
  }

  // ---- Build the Claude request ----
  const anthropic = new Anthropic({ apiKey: anthropicKey });

  // Document blocks: cached prefix + citations. cache_control on the last block
  // caches system + all documents together (prefix match).
  const docBlocks = documents.map((doc, idx) => {
    const block: any = {
      type: "document",
      source: { type: "text", media_type: "text/plain", data: doc.text },
      title: doc.title,
      citations: { enabled: true },
    };
    if (idx === documents.length - 1) {
      block.cache_control = { type: "ephemeral" };
    }
    return block;
  });

  const groundingUser =
    documents.length > 0
      ? [
          ...docBlocks,
          {
            type: "text",
            text:
              "These are my lecture materials for this subject. Answer my following questions primarily from them and cite the sources.",
          },
        ]
      : [
          {
            type: "text",
            text: "No lecture materials have been added for this subject yet.",
          },
        ];

  const messages: any[] = [
    { role: "user", content: groundingUser },
    {
      role: "assistant",
      content:
        "Understood. I'll answer primarily from these materials and clearly mark any additions.",
    },
    ...conversation,
  ];

  const createParams: any = {
    model,
    max_tokens: 4096,
    system: [{ type: "text", text: systemText, cache_control: { type: "ephemeral" } }],
    messages,
  };
  if (model === "claude-opus-4-8") {
    createParams.thinking = { type: "adaptive" };
  }

  // ---- Stream the answer back as SSE ----
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };
      try {
        send({ type: "start", model, documentCount: documents.length });
        const mstream = anthropic.messages.stream(createParams);
        for await (const ev of mstream) {
          if (
            ev.type === "content_block_delta" &&
            (ev as any).delta?.type === "text_delta"
          ) {
            send({ type: "delta", text: (ev as any).delta.text });
          }
        }
        const final = await mstream.finalMessage();

        // Collect citations from the answer's text blocks.
        const citations: any[] = [];
        for (const block of final.content as any[]) {
          if (block.type === "text" && Array.isArray(block.citations)) {
            for (const c of block.citations) {
              citations.push({
                title: c.document_title ?? null,
                cited_text: c.cited_text ?? null,
              });
            }
          }
        }
        send({
          type: "done",
          stop_reason: final.stop_reason,
          usage: final.usage,
          citations,
        });
      } catch (err) {
        send({ type: "error", message: String((err as Error)?.message || err) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
});
