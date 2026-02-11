export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_API_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: "Gemini API key missing" }) };
  }

  let payload;
  try {
    payload = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON body" }) };
  }

  const { dateType, timeOfDay, atmosphere, price, lang } = payload;

  const systemPrompt = `
You are a Chicago local curator, not a tourist guide.

Generate ONE specific, real date idea in Chicago.
Prefer lesser-known but real venues.
Avoid tourist landmarks and clichés.

Forbidden examples:
Millennium Park, Navy Pier, Riverwalk, romantic stroll, cozy restaurant

Rules:
- Choose one specific Chicago neighborhood
- Be concrete and vivid
- No explanations
- Output JSON only

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

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: systemPrompt + "\n\n" + userQuery }] }],
          generationConfig: {
            temperature: 0.7,
            topP: 0.85,
            maxOutputTokens: 350,
            responseMimeType: "application/json"
          }
        })
      }
    );

    if (!response.ok) {
      return { statusCode: 500, body: JSON.stringify({ error: "Gemini API failed" }) };
    }

    const data = await response.json();
    const content = data.candidates[0].content.parts[0].text;

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      return { statusCode: 500, body: JSON.stringify({ error: "Invalid JSON from Gemini", raw: content }) };
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(parsed)
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
}
