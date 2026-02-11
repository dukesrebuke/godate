// netlify/functions/generateDate.js

// ==============================
// In-memory recent suggestion store
// ==============================
const RECENT_SUGGESTIONS = new Map();
// key: normalized MapQuery or Title
// value: timestamp (ms)

const COOLDOWN_MS = 1000 * 60 * 60 * 24; // 24 hours
const MAX_EXCLUSIONS = 8;

// ==============================
// Helper functions
// ==============================
function normalizeKey(str) {
  return str.toLowerCase().replace(/\s+/g, " ").trim();
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
Do NOT suggest any of the following places (they were recently used):
- ${recent.join("\n- ")}
`.trim();
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

  // ==============================
  // System + user prompts
  // ==============================
  const systemPrompt = `
You are a Chicago local curator, not a tourist guide.

Generate ONE specific, real date idea in Chicago.
Prefer lesser-known but real venues.
Avoid tourist landmarks and clichés.

Forbidden examples:
Millennium Park
Navy Pier
Riverwalk
romantic stroll
cozy restaurant

Rules:
- Choose ONE specific Chicago neighborhood
- Be concrete and vivid
- No explanations
- Output JSON only
- No markdown
- No text outside the JSON

Exact schema:
{
  "Title": "",
  "Location": "",
  "Description": "",
  "Hours": "",
  "BestTime": "",
  "Occupancy": "Low | Medium | High",
  "MapQuery": ""
}
`.trim();

  const userQuery = `
Date type: ${dateType}
Time of day: ${timeOfDay}
Atmosphere: ${atmosphere}
Price range: ${price}
Respond in ${lang === "en" ? "English" : "Spanish"}.
`.trim();

  const exclusionPrompt = buildExclusionPrompt();

  const fullPrompt = [
    systemPrompt,
    exclusionPrompt,
    userQuery
  ].filter(Boolean).join("\n\n");

  // ==============================
  // Gemini request function
  // ==============================
  async function callGemini() {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash:generateContent?key=${GEMINI_API_KEY}`,
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
            temperature: 0.8,
            topP: 0.9,
            maxOutputTokens: 350,
            responseMimeType: "application/json"
          }
        })
      }
    );

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Gemini API error: ${text}`);
    }

    const data = await response.json();
    return data.candidates[0].content.parts[0].text;
  }

  // ==============================
  // Main execution
  // ==============================
  try {
    let rawText = await callGemini();
    let parsed;

    try {
      parsed = JSON.parse(rawText);
    } catch {
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

    // Retry once if recently suggested
    if (RECENT_SUGGESTIONS.has(key)) {
      try {
        rawText = await callGemini();
        parsed = JSON.parse(rawText);
      } catch {
        // If retry fails, fall back to original
      }
    }

    // Record suggestion
    RECENT_SUGGESTIONS.set(key, now);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(parsed)
    };

  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
}
