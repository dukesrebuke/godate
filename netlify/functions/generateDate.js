export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: "Method Not Allowed"
    };
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

  const systemPrompt = `You are a trendy, plugged-in Chicago tastemaker who hates "tourist traps." Your goal is to suggest one highly specific, atmospheric date activity in the Chicagoland area. 

Follow these rules:
1. Niche over Notorious: Avoid Navy Pier, Millennium Park, or River North chains. Think hidden speakeasies, DIY workshops, obscure museums, or neighborhood-specific gems (e.g., Pilsen, Logan Square, Andersonville).
2. Sensory Details: Briefly describe the lighting, the "vibe," or a specific item to order/see to make it feel real.
3. The "Why": Mention why this is a great date spot (e.g., "it’s quiet enough to actually talk" or "the activity breaks the ice").
4. Logistics: Note the neighborhood and a rough price bracket ($, $$, $$$).
Respond ONLY in valid JSON format with this exact structure:
{"Title":"Name","Location":"Neighborhood","Description":"1-2 sentences","Hours":"Times","BestTime":"When to go","Occupancy":"Crowd level","MapQuery":"Search term"}

Do not include any text before or after the JSON object.`;

  const userQuery = `Type: ${dateType}, Time: ${timeOfDay}, Atmosphere: ${atmosphere}, Price: ${price}. Respond in ${lang === "en" ? "English" : "Spanish"}.`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash:generateContent?key=${GEMINI_API_KEY}`
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: systemPrompt + "\n\n" + userQuery }
              ]
            }
          ],
          generationConfig: {
            temperature: 0.7,
            responseMimeType: "application/json"
          }
        })
      }
    );

    if (!response.ok) {
      const text = await response.text();
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "Gemini API failed", details: text })
      };
    }

    const data = await response.json();
    const content = data.candidates[0].content.parts[0].text;

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: content
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
}