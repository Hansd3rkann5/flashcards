// Supabase Edge Function: `assistant`
// ============================================================================
// AI assistant for the flashcards app.
//
// Supports Claude (via Anthropic SDK) and Mistral (via OpenAI-compatible API).
// Routes based on the model prefix: "mistral-*" → Mistral, else → Claude.
//
// Secrets / env (set via `supabase secrets set` — never commit these):
//   ANTHROPIC_API_KEY   your Anthropic API key
//   MISTRAL_API_KEY     your Mistral API key
// Auto-injected by Supabase:
//   SUPABASE_URL, SUPABASE_ANON_KEY
//
// Deploy:  supabase functions deploy assistant

import Anthropic from "npm:@anthropic-ai/sdk@0.65.0";
import { createClient } from "npm:@supabase/supabase-js@2";

const KNOWLEDGE_STORE = "knowledge";
const KNOWLEDGE_BUCKET = "knowledge";

const ALLOWED_MODELS = new Set([
  "claude-haiku-4-5-20251001",
  "claude-sonnet-4-6",
  "claude-opus-4-8",
  "mistral-small-latest",
]);
const DEFAULT_MODEL = "claude-haiku-4-5-20251001";

const BASE_SYSTEM = [
  "You are a helpful study assistant inside a flashcards app.",
  "Answer questions PRIMARILY from the user's provided lecture materials.",
  "When the materials cover the question, rely exclusively on them and cite the specific source passages.",
  "Only when the materials do not answer the question, add general subject knowledge and clearly mark it as not coming from the user's materials (in the same language as your answer).",
  "If no materials are provided at all, say so briefly and answer to the best of your knowledge with that same marker.",
  "Be clear, correct and concise.",
  "When the user asks you to create, generate, make or write flashcards/cards/quiz questions, call the `create_flashcards` tool instead of answering in prose. Base the cards PRIMARILY on the provided materials. If the user does not say how many, create about 5-8. Use `qa` for open questions and `mcq` (with 3-4 plausible options, exactly the correct one(s) flagged) for multiple choice. Keep each prompt/answer focused on a single fact. Do NOT call the tool for normal questions.",
].join(" ");

// Structured-output tool for card creation (Anthropic format).
const CREATE_CARDS_TOOL_ANTHROPIC = {
  name: "create_flashcards",
  description:
    "Create flashcards for the user's subject, grounded primarily in the provided lecture materials. Call this only when the user asks to generate/make/create cards.",
  input_schema: {
    type: "object",
    properties: {
      cards: {
        type: "array",
        description: "The flashcards to create.",
        items: {
          type: "object",
          properties: {
            type: {
              type: "string",
              enum: ["qa", "mcq"],
              description: "`qa` = open question/answer; `mcq` = multiple choice or a sorting card.",
            },
            prompt: { type: "string", description: "The question / front of the card. May use markdown, $LaTeX$, tables." },
            answer: {
              type: "string",
              description:
                "For `qa`: the answer / back of the card. For `mcq`: the text of the (first) correct option.",
            },
            optionsRequireOrder: {
              type: "boolean",
              description:
                "For `mcq` only. false = normal multiple choice (flag correct options). true = a sorting card: the `order` field gives the correct sequence (1 = first) and every option counts as correct.",
            },
            options: {
              type: "array",
              description:
                "For `mcq` only: the answer options. Normal MCQ: 3-4 options including the correct one(s). Sorting card: all items to be ordered.",
              items: {
                type: "object",
                properties: {
                  text: { type: "string" },
                  correct: { type: "boolean", description: "Normal MCQ: whether this option is correct. Ignored for sorting cards (all correct)." },
                  order: { type: "number", description: "Sorting cards only: the correct position (1 = first)." },
                },
                required: ["text"],
              },
            },
            answerTextAlign: {
              type: "string",
              enum: ["center", "left"],
              description: "Use `left` when the answer is a markdown table or a multi-line structured list; otherwise `center`.",
            },
          },
          required: ["type", "prompt", "answer"],
        },
      },
    },
    required: ["cards"],
  },
} as const;

// OpenAI-compatible tool format for Mistral.
const CREATE_CARDS_TOOL_OPENAI = {
  type: "function",
  function: {
    name: CREATE_CARDS_TOOL_ANTHROPIC.name,
    description: CREATE_CARDS_TOOL_ANTHROPIC.description,
    parameters: CREATE_CARDS_TOOL_ANTHROPIC.input_schema,
  },
};

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

function storagePathFromRef(ref: string): string | null {
  const prefix = `sb://${KNOWLEDGE_BUCKET}/`;
  const value = String(ref || "");
  return value.startsWith(prefix) ? value.slice(prefix.length) : null;
}

const TEMPLATE_SUBJECT_NAME = "template";
const TEMPLATE_MAX_CARDS = 60;
const TEMPLATE_MAX_CHARS = 12000;

async function loadTemplateSystem(supabase: any): Promise<string> {
  try {
    const { data: subs } = await supabase
      .from("records")
      .select("record_key,payload")
      .eq("store", "subjects");
    const tplSubject = (subs || []).find(
      (r: any) => String(r?.payload?.name || "").trim().toLowerCase() === TEMPLATE_SUBJECT_NAME,
    );
    if (!tplSubject) return "";
    const templateSubjectId = String(tplSubject?.payload?.id || tplSubject?.record_key || "").trim();
    if (!templateSubjectId) return "";

    const { data: topics } = await supabase
      .from("records")
      .select("payload")
      .eq("store", "topics")
      .eq("payload->>subjectId", templateSubjectId);
    const topicIds = [
      ...new Set((topics || []).map((t: any) => String(t?.payload?.id || "").trim()).filter(Boolean)),
    ];
    if (!topicIds.length) return "";

    const orFilter = topicIds.map((id) => `payload->>topicId.eq.${id}`).join(",");
    const { data: cardRows } = await supabase
      .from("records")
      .select("payload")
      .eq("store", "cards")
      .or(orFilter)
      .limit(TEMPLATE_MAX_CARDS);

    const examples: any[] = [];
    for (const row of cardRows || []) {
      const p = (row as any)?.payload || {};
      const prompt = String(p.prompt || "").trim();
      if (!prompt) continue;
      const ex: any = { type: p.type === "mcq" ? "mcq" : "qa", prompt, answer: String(p.answer || "") };
      if (p.type === "mcq" && Array.isArray(p.options) && p.options.length) {
        const requireOrder = !!p.optionsRequireOrder;
        ex.optionsRequireOrder = requireOrder;
        ex.options = p.options.map((o: any) =>
          requireOrder
            ? { text: String(o?.text || ""), order: Number(o?.order) || 0 }
            : { text: String(o?.text || ""), correct: !!o?.correct },
        );
      }
      if (p.answerTextAlign === "left") ex.answerTextAlign = "left";
      examples.push(ex);
    }
    if (!examples.length) return "";

    let payload = JSON.stringify(examples);
    if (payload.length > TEMPLATE_MAX_CHARS) {
      while (examples.length > 1 && JSON.stringify(examples).length > TEMPLATE_MAX_CHARS) {
        examples.pop();
      }
      payload = JSON.stringify(examples);
    }

    return [
      "The user maintains a set of example flashcards that define their preferred card style (a subject named \"Template\").",
      "When you call `create_flashcards`, imitate these examples closely: their card types (qa / mcq / sorting mcq), wording, and formatting —",
      "markdown, **bold** key terms, **__underlined labels__**, *italic* cloze deletions with ---1--- blanks, markdown tables with answerTextAlign 'left', inline $LaTeX$ for formulas, and --> / -> arrows.",
      "These are STYLE EXAMPLES ONLY — never reuse their content; create cards about the topic the user actually asked for.",
      "\n--- USER CARD STYLE EXAMPLES (JSON) ---\n" + payload,
    ].join(" ");
  } catch {
    return "";
  }
}

// ---- Mistral streaming call (OpenAI-compatible endpoint) ----
const MISTRAL_MAX_DOC_CHARS = 40000;

async function streamMistral(params: {
  apiKey: string;
  model: string;
  systemText: string;
  templateSystem: string;
  documents: { title: string; text: string }[];
  conversation: { role: string; content: string }[];
  send: (event: unknown) => void;
}): Promise<void> {
  const { apiKey, model, systemText, templateSystem, documents, conversation, send } = params;

  let docsText = "";
  if (documents.length > 0) {
    const raw = documents.map((d) => `=== ${d.title} ===\n${d.text}`).join("\n\n");
    docsText = "\n\nUser's lecture materials:\n\n" + (raw.length > MISTRAL_MAX_DOC_CHARS ? raw.slice(0, MISTRAL_MAX_DOC_CHARS) + "\n[…truncated]" : raw);
  } else {
    docsText = "\n\nNo lecture materials have been added for this subject yet.";
  }

  const systemContent = [systemText, templateSystem || null, docsText].filter(Boolean).join("\n\n");

  const messages = [
    { role: "system", content: systemContent },
    ...conversation,
  ];

  const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      tools: [CREATE_CARDS_TOOL_OPENAI],
      tool_choice: "auto",
      max_tokens: 4096,
      stream: true,
    }),
  });

  if (!res.ok || !res.body) {
    const errText = await res.text().catch(() => "");
    send({ type: "error", message: `Mistral error ${res.status}: ${errText}` });
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let toolCallArgs = "";
  let toolCallName = "";

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6).trim();
      if (data === "[DONE]") continue;
      try {
        const chunk = JSON.parse(data);
        const delta = chunk.choices?.[0]?.delta;
        if (delta?.content) {
          send({ type: "delta", text: delta.content });
        }
        if (Array.isArray(delta?.tool_calls)) {
          for (const tc of delta.tool_calls) {
            if (tc.function?.name) toolCallName = tc.function.name;
            if (tc.function?.arguments) toolCallArgs += tc.function.arguments;
          }
        }
      } catch {
        // ignore malformed chunk
      }
    }
  }

  if (toolCallName === "create_flashcards" && toolCallArgs) {
    try {
      const parsed = JSON.parse(toolCallArgs);
      const cards = parsed?.cards;
      if (Array.isArray(cards) && cards.length) {
        send({ type: "cards", cards });
      }
    } catch {
      // ignore parse error
    }
  }

  send({ type: "done", stop_reason: "end_turn", usage: {}, citations: [] });
}

// ---- Main handler ----
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }

  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
  const mistralKey = Deno.env.get("MISTRAL_API_KEY");

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

  const isMistral = model.startsWith("mistral-");
  if (isMistral && !mistralKey) {
    return json({ error: "server_misconfigured", detail: "MISTRAL_API_KEY missing" }, 500);
  }
  if (!isMistral && !anthropicKey) {
    return json({ error: "server_misconfigured", detail: "ANTHROPIC_API_KEY missing" }, 500);
  }

  const systemText = `${BASE_SYSTEM} ${LANGUAGE_RULE[language]}`;
  const templateSystem = await loadTemplateSystem(supabase);

  const conversation = rawMessages
    .map((m: any) => ({
      role: m?.role === "assistant" ? "assistant" : "user",
      content: String(m?.content ?? "").slice(0, 20000),
    }))
    .filter((m: any) => m.content.trim().length > 0)
    .slice(-20);
  if (!conversation.length) return json({ error: "empty_messages" }, 400);

  // Load knowledge base (empty subjectId = review session = no materials, which is fine).
  const documents: { title: string; text: string }[] = [];
  if (subjectId) {
    const { data: rows, error: recErr } = await supabase
      .from("records")
      .select("record_key,payload")
      .eq("store", KNOWLEDGE_STORE)
      .eq("payload->>subjectId", subjectId);
    if (recErr) {
      return json({ error: "knowledge_read_failed", detail: recErr.message }, 500);
    }
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
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };
      try {
        send({ type: "start", model, documentCount: documents.length });

        if (isMistral) {
          await streamMistral({
            apiKey: mistralKey!,
            model,
            systemText,
            templateSystem,
            documents,
            conversation,
            send,
          });
        } else {
          // ---- Claude path ----
          const anthropic = new Anthropic({ apiKey: anthropicKey });

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
                    text: "These are my lecture materials for this subject. Answer my following questions primarily from them and cite the sources.",
                  },
                ]
              : [{ type: "text", text: "No lecture materials have been added for this subject yet." }];

          const messages: any[] = [
            { role: "user", content: groundingUser },
            { role: "assistant", content: "Understood. I'll answer primarily from these materials and clearly mark any additions." },
            ...conversation,
          ];

          const systemBlocks: any[] = [
            { type: "text", text: systemText, cache_control: { type: "ephemeral" } },
          ];
          if (templateSystem) {
            systemBlocks.push({ type: "text", text: templateSystem, cache_control: { type: "ephemeral" } });
          }

          const createParams: any = {
            model,
            max_tokens: 4096,
            system: systemBlocks,
            tools: [CREATE_CARDS_TOOL_ANTHROPIC],
            messages,
          };
          if (model === "claude-opus-4-8") {
            createParams.thinking = { type: "adaptive" };
          }

          const mstream = anthropic.messages.stream(createParams);
          for await (const ev of mstream) {
            if (ev.type === "content_block_delta" && (ev as any).delta?.type === "text_delta") {
              send({ type: "delta", text: (ev as any).delta.text });
            }
          }
          const final = await mstream.finalMessage();

          const citations: any[] = [];
          let generatedCards: any[] | null = null;
          for (const block of final.content as any[]) {
            if (block.type === "text" && Array.isArray(block.citations)) {
              for (const c of block.citations) {
                citations.push({ title: c.document_title ?? null, cited_text: c.cited_text ?? null });
              }
            } else if (block.type === "tool_use" && block.name === "create_flashcards") {
              const cards = (block.input as any)?.cards;
              if (Array.isArray(cards)) generatedCards = cards;
            }
          }
          if (generatedCards && generatedCards.length) {
            send({ type: "cards", cards: generatedCards });
          }
          send({ type: "done", stop_reason: final.stop_reason, usage: final.usage, citations });
        }
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
