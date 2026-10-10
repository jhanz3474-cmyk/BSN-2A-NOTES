const ALLOWED_ORIGIN = "https://jhanz3474-cmyk.github.io";
const MODEL = "gpt-6-luna";
const MAX_INPUT_CHARS = 80000;

function corsHeaders(origin) {
  const allowed = origin === ALLOWED_ORIGIN;
  return {
    "Access-Control-Allow-Origin": allowed ? origin : ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, x-ai-proxy-token",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
}

function json(data, status, origin) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders(origin),
      "Content-Type": "application/json; charset=UTF-8",
      "Cache-Control": "no-store"
    }
  });
}

function stripFences(value) {
  return String(value || "").trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function buildInstructions(target) {
  const destination = target === "memorize" ? "School Notes" : "Nursing Notes";
  return [
    "You are the editorial AI for a BSN-2A nursing school notes website.",
    "Turn messy pasted material into a polished " + destination + " draft.",
    "",
    "CORE RULES:",
    "1. Preserve the source meaning. Never invent facts, patient information, clinical values, dates, drug doses, laboratory ranges, or citations.",
    "2. Correct obvious spelling, grammar, punctuation, spacing, duplicated lines, broken formatting, and clipboard artifacts.",
    "3. Carefully preserve every clinically meaningful number, unit, dosage, timing, formula, abbreviation, sequence, classification, and named structure.",
    "4. When text is unclear or contradictory, do not guess. Preserve useful source wording and flag it with [REVIEW].",
    "5. Remove greetings, conversational filler, Messenger artifacts, accidental indentation, and obvious duplicate content.",
    "6. Organize with clear headings, short explanations, bullet lists, numbered sequences, and simple tables when useful.",
    "7. Do not over-compress the source. Keep important details for studying.",
    "8. Do not fabricate patient scenarios or medical advice.",
    "9. Do not include scripts, CSS, links, images, or unsafe HTML.",
    "",
    "HTML ALLOWLIST:",
    "<p>, <br>, <strong>, <b>, <em>, <i>, <u>, <s>, <h2>, <h3>, <ul>, <ol>, <li>, <blockquote>, <table>, <thead>, <tbody>, <tr>, <th>, <td> only.",
    "",
    "OUTPUT:",
    "Return only valid JSON: {"title":"...","category":"...","html":"...","notes":["..."]}.",
    "html must contain only the allowlisted HTML tags.",
    "notes contains short editorial flags; return [] when no flags are needed.",
    destination === "memorize"
      ? "SCHOOL NOTES EMPHASIS: definitions, classifications, mechanisms, formulas, steps, comparisons, and must-memorize facts."
      : "NURSING NOTES EMPHASIS: concepts, procedure steps, precautions, measurements, terminology, normal/abnormal distinctions, and dosage/unit details."
  ].join("\n");
}

function extractJson(output) {
  const raw = stripFences(output);
  try {
    return JSON.parse(raw);
  } catch (error) {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(raw.slice(start, end + 1));
    throw new Error("The model returned invalid JSON.");
  }
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";

    if (request.method === "OPTIONS") {
      if (origin !== ALLOWED_ORIGIN) return new Response(null, { status: 403 });
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    if (origin && origin !== ALLOWED_ORIGIN) {
      return json({ error: "Origin not allowed." }, 403, origin);
    }

    const suppliedToken = request.headers.get("x-ai-proxy-token") || "";
    if (!env.AI_NOTES_PROXY_TOKEN || suppliedToken !== env.AI_NOTES_PROXY_TOKEN) {
      return json({ error: "Invalid AI proxy token." }, 401, origin);
    }

    if (request.method === "GET") {
      return json({
        ok: true,
        service: "BSN-2A Cloudflare AI Notes",
        model: MODEL,
        message: "AI backend is reachable."
      }, 200, origin);
    }

    if (request.method !== "POST") {
      return json({ error: "Only GET, POST and OPTIONS are supported." }, 405, origin);
    }

    let body;
    try { body = await request.json(); }
    catch (error) { return json({ error: "Invalid JSON request body." }, 400, origin); }

    const target = body?.target === "memorize" ? "memorize" : "notes";
    const sourceText = String(body?.source_text || "").replace(/\u0000/g, "").trim();
    const titleHint = String(body?.title_hint || "").trim().slice(0, 220);
    const categoryHint = String(body?.category_hint || "").trim().slice(0, 120);

    if (!sourceText) return json({ error: "source_text is required." }, 400, origin);
    if (sourceText.length > MAX_INPUT_CHARS) {
      return json({ error: "source_text is too large. Maximum is " + MAX_INPUT_CHARS + " characters." }, 413, origin);
    }
    if (!env.OPENAI_API_KEY) return json({ error: "OPENAI_API_KEY is not configured on the Worker." }, 500, origin);

    const userPrompt = [
      "Transform this source into the requested note draft.",
      titleHint ? "Preferred title hint: " + titleHint : "No title hint was supplied.",
      categoryHint ? "Preferred category hint: " + categoryHint : "No category hint was supplied.",
      "",
      "SOURCE TEXT START",
      sourceText,
      "SOURCE TEXT END"
    ].join("\n");

    try {
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          "Authorization": "Bearer " + env.OPENAI_API_KEY,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: MODEL,
          store: false,
          instructions: buildInstructions(target),
          input: [{
            role: "user",
            content: [{ type: "input_text", text: userPrompt }]
          }]
        })
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        return json({ error: payload?.error?.message || ("OpenAI returned HTTP " + response.status + ".") }, 502, origin);
      }

      const draft = extractJson(payload?.output_text || "");
      if (!draft || typeof draft !== "object") throw new Error("AI draft was empty.");

      const title = String(draft.title || titleHint || (target === "memorize" ? "School Note" : "Nursing Note")).trim();
      const category = String(draft.category || categoryHint || "").trim();
      const html = String(draft.html || "").trim();
      const notes = Array.isArray(draft.notes)
        ? draft.notes.map(value => String(value || "").trim()).filter(Boolean).slice(0, 12)
        : [];

      if (!html) throw new Error("AI returned no usable note HTML.");
      return json({ title, category, html, notes }, 200, origin);
    } catch (error) {
      console.error("AI Notes Worker error:", error);
      return json({ error: error?.message || "AI note generation failed." }, 500, origin);
    }
  }
};