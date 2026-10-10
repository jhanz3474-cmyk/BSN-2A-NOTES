const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const OpenAI = require("openai");

const OPENAI_API_KEY = defineSecret("OPENAI_API_KEY");
const AI_NOTES_PROXY_TOKEN = defineSecret("AI_NOTES_PROXY_TOKEN");

const ALLOWED_ORIGIN = "https://jhanz3474-cmyk.github.io";
const MODEL = "gpt-6-luna";
const MAX_INPUT_CHARS = 80000;

function sendCors(res) {
  res.set("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type, x-ai-proxy-token");
  res.set("Vary", "Origin");
}

function fail(res, status, message) {
  return res.status(status).json({ error: message });
}

function stripMarkdownFences(value) {
  return String(value || "")
    .trim()
    .replace(/^\`\`\`json\s*/i, "")
    .replace(/^\`\`\`\s*/i, "")
    .replace(/\s*\`\`\`$/i, "")
    .trim();
}

function validateDraft(draft, target) {
  if (!draft || typeof draft !== "object") {
    throw new Error("The model returned an invalid draft.");
  }

  const title = String(draft.title || "").trim();
  const category = String(draft.category || "").trim();
  const html = String(draft.html || "").trim();

  if (!title) throw new Error("The AI did not return a title.");
  if (!html) throw new Error("The AI did not return usable note content.");

  // The browser performs a second allow-list sanitization pass before preview/editor insertion.
  return {
    title: title.slice(0, 220),
    category: category.slice(0, 120),
    html,
    notes: Array.isArray(draft.notes)
      ? draft.notes.map(x => String(x || "").trim()).filter(Boolean).slice(0, 12)
      : [],
    target
  };
}

function buildInstructions(target) {
  const destination = target === "memorize" ? "School Notes" : "Nursing Notes";

  return [
    "You are the editorial AI for a BSN-2A nursing school notes website.",
    `Your job is to turn messy pasted source material into a polished ${destination} draft.`,
    "",
    "CORE RULES:",
    "1. Preserve the source meaning. Do not invent facts, clinical values, patient details, dates, drug doses, laboratory ranges, or citations that are not present in the source.",
    "2. Correct obvious spelling, grammar, punctuation, spacing, OCR-like noise, duplicated lines, and broken formatting.",
    "3. Carefully preserve every clinically meaningful number, unit, dosage, timing, formula, abbreviation, sequence, classification, and named structure.",
    "4. If a phrase appears uncertain, incomplete, or contradictory, keep the useful source wording and clearly mark the uncertainty in a brief [REVIEW] note instead of guessing.",
    "5. Remove conversational filler, greetings, Messenger artifacts, repeated headings, accidental indentation, and obvious clipboard junk.",
    "6. Prefer a clean hierarchy: concise heading(s), short explanation paragraphs, bullet lists for grouped facts, numbered lists for sequences/procedures, and simple tables only when they materially improve comparison.",
    "7. Make the result easy to scan and study, but do not aggressively shorten away details.",
    "8. Do not add a references section unless the source itself contains references/links.",
    "9. Never fabricate a patient or clinical scenario. This tool is for educational/shared notes, not a patient medical record.",
    "10. Do not include HTML attributes, CSS, JavaScript, scripts, links, images, or unsafe markup.",
    "",
    "HTML ALLOWLIST FOR THE OUTPUT:",
    "Use only: <p>, <br>, <strong>, <b>, <em>, <i>, <u>, <s>, <h2>, <h3>, <ul>, <ol>, <li>, <blockquote>, <table>, <thead>, <tbody>, <tr>, <th>, <td>.",
    "Do not use inline styles or classes.",
    "",
    "OUTPUT CONTRACT:",
    'Return ONLY valid JSON with this exact top-level shape: {"title":"...","category":"...","html":"...","notes":["..."]}.',
    "The html field must be valid HTML using only the allowlisted tags.",
    "The notes array should contain at most 12 short editorial flags such as a missing/unclear source phrase; use an empty array when none are needed.",
    "",
    destination === "memorize"
      ? "SCHOOL-NOTES EMPHASIS: Organize for studying and memorization. Keep definitions, classifications, mechanisms, formulas, steps, comparisons, and must-memorize facts clear."
      : "NURSING-NOTES EMPHASIS: Organize nursing/clinical concepts clearly. Preserve procedure steps, precautions, measurements, terminology, normal/abnormal distinctions, and dosage/unit details exactly as sourced."
  ].join("\n");
}

exports.aiNotes = onRequest(
  {
    region: "asia-southeast1",
    timeoutSeconds: 120,
    memory: "512MiB",
    secrets: [OPENAI_API_KEY, AI_NOTES_PROXY_TOKEN]
  },
  async (req, res) => {
    sendCors(res);

    if (req.method === "OPTIONS") {
      return res.status(204).send("");
    }

    if (req.method !== "POST") {
      return fail(res, 405, "Only POST requests are supported.");
    }

    const expectedToken = AI_NOTES_PROXY_TOKEN.value();
    const receivedToken = String(req.get("x-ai-proxy-token") || "");

    if (!expectedToken || receivedToken !== expectedToken) {
      return fail(res, 401, "Invalid AI proxy token.");
    }

    const body = req.body || {};
    const target = body.target === "memorize" ? "memorize" : "notes";
    const sourceText = String(body.source_text || "").replace(/\u0000/g, "").trim();
    const titleHint = String(body.title_hint || "").trim().slice(0, 220);
    const categoryHint = String(body.category_hint || "").trim().slice(0, 120);

    if (!sourceText) {
      return fail(res, 400, "source_text is required.");
    }

    if (sourceText.length > MAX_INPUT_CHARS) {
      return fail(res, 413, `source_text is too large. Maximum is ${MAX_INPUT_CHARS} characters.`);
    }

    try {
      const client = new OpenAI({ apiKey: OPENAI_API_KEY.value() });

      const userPrompt = [
        "Transform this source into the requested note draft.",
        titleHint ? `Preferred title hint: ${titleHint}` : "No title hint was supplied.",
        categoryHint ? `Preferred category hint: ${categoryHint}` : "No category hint was supplied.",
        "",
        "SOURCE TEXT START",
        sourceText,
        "SOURCE TEXT END"
      ].join("\n");

      const response = await client.responses.create({
        model: MODEL,
        store: false,
        instructions: buildInstructions(target),
        input: [
          {
            role: "user",
            content: [{ type: "input_text", text: userPrompt }]
          }
        ]
      });

      const raw = stripMarkdownFences(response.output_text || "");
      let parsed;

      try {
        parsed = JSON.parse(raw);
      } catch (error) {
        // One repair pass if the model returned almost-JSON.
        const repair = await client.responses.create({
          model: MODEL,
          store: false,
          instructions: "Return only valid JSON. Repair the following text into the exact requested schema without changing its substantive content: {title:string,category:string,html:string,notes:string[]}.",
          input: [{ role: "user", content: [{ type: "input_text", text: raw.slice(0, 120000) }] }]
        });
        parsed = JSON.parse(stripMarkdownFences(repair.output_text || ""));
      }

      const result = validateDraft(parsed, target);
      return res.status(200).json(result);
    } catch (error) {
      console.error("aiNotes failed:", error);
      return fail(res, 500, "The AI note generation failed. Check the function logs for the underlying error.");
    }
  }
);
