// netlify/functions/generateDate.js

// ==============================
// In-memory recent suggestion store
// ==============================
const RECENT_SUGGESTIONS = new Map();
const COOLDOWN_MS = 1000 * 60 * 60 * 24; // 24 hours
const MAX_EXCLUSIONS = 8;

// ==============================
// Helper functions
// ==============================
function normalizeKey(str) {
  return str?.toLowerCase().replace(/\s+/g, " ").trim();
}

function pruneOldSuggestions() {
  const now = Date.now();
  for (const [key, ts] of RECENT_SUGGESTIONS.entries()) {
    if (now - ts > COOLDOWN_MS) {
      RECENT_SUGGESTIONS.delete(key);
    }
  }
}

function buildExclusionPrompt() {
  pruneOldSuggestions();
  const recent = [...RECENT_SUGGESTIONS.keys()].slice(-MAX_EXCLUSIONS);

  if (!recent.length) return "";

  return `
Do NOT suggest any of the following places:
- ${recent.join("\n- ")}
`.trim();
}

// Extract first valid JSON object from text
function extractJSON(text) {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;

  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

// ==============================
// Netlify handler
// ==============================
export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

  if (!GEMINI_API_KEY) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Gemini API key missing on server" })
    };
  }

  let payload;
  try {
    payload = JSON.parse(event.body);
  } catch {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Invalid JSON body" })
    };
  }

  const { dateType, timeOfDay, atmosphere, price, lang } = payload;

  const systemPrompt = `
You are a Chicago local curator.

Return ONE specific real Chicago date idea.

You MUST return a COMPLETE valid JSON object.
Do NOT stop early.
Do NOT truncate.
Do NOT include markdown.
Do NOT include commentary.
Output JSON only.

The JSON MUST include ALL fields:

{
  "Title": "string",
  "Location": "string",
  "Description": "string",
  "Hours": "string",
  "BestTime": "string",
  "Occupancy": "Low | Medium | High",
  "MapQuery": "string"
}

Rules:
- Choose ONE real Chicago neighborhood
- Be vivid but concise
- Avoid tourist landmarks
- Ensure the JSON object is fully closed with }
`.trim();

  const userPrompt = `
Date type: ${dateType}
Time of day: ${timeOfDay}
Atmosphere: ${atmosphere}
Price range: ${price}
Respond in ${lang === "en" ? "English" : "Spanish"}.
`.trim();

  const exclusionPrompt = buildExclusionPrompt();

  const fullPrompt = [systemPrompt, exclusionPrompt, userPrompt]
    .filter(Boolean)
    .join("\n\n");

  async function callGemini() {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: fullPrompt }]
            }
          ],
          generationConfig: {
  temperature: 0.7,
  topP: 0.9,
  maxOutputTokens: 2048,
  stopSequences: []
}
        })
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini API error: ${errorText}`);
    }

    const data = await response.json();

    if (
      !data.candidates ||
      !data.candidates[0]?.content?.parts?.[0]?.text
    ) {
      throw new Error("Unexpected Gemini response structure");
    }

    return data.candidates[0].content.parts[0].text;
  }

  try {
    let rawText = await callGemini();
    let parsed = extractJSON(rawText);

    // Retry once if JSON invalid
    if (!parsed) {
      rawText = await callGemini();
      parsed = extractJSON(rawText);
    }

    if (!parsed) {
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: "Invalid JSON from Gemini",
          raw: rawText
        })
      };
    }

    const key = normalizeKey(parsed.MapQuery || parsed.Title);
    const now = Date.now();

    if (RECENT_SUGGESTIONS.has(key)) {
      rawText = await callGemini();
      parsed = extractJSON(rawText);
    }

    RECENT_SUGGESTIONS.set(key, now);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(parsed)
    };

  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: err.message
      })
    };
  }
}
