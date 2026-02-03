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

  const systemPrompt = `You are a helpful Chicago local guide. Suggest one specific, real location/activity for a date in the Chicago area.
Respond ONLY in valid JSON format with this exact structure:
{"Title":"Name","Location":"Neighborhood","Description":"1-2 sentences","Hours":"Times","BestTime":"When to go","Occupancy":"Crowd level","MapQuery":"Search term"}

Do not include any text before or after the JSON object.`;

  const userQuery = `Type: ${dateType}, Time: ${timeOfDay}, Atmosphere: ${atmosphere}, Price: ${price}. Respond in ${lang === "en" ? "English" : "Spanish"}.`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
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
