export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: "Method Not Allowed"
    };
  }

  const GROQ_API_KEY = process.env.GROQ_API_KEY;

  if (!GROQ_API_KEY) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Groq API key missing on server" })
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
Respond ONLY in JSON format:
{"Title":"Name","Location":"Neighborhood","Description":"1-2 sentences","Hours":"Times","BestTime":"When to go","Occupancy":"Crowd level","MapQuery":"Search term"}`;

  const userQuery = `Type: ${dateType}, Time: ${timeOfDay}, Atmosphere: ${atmosphere}, Price: ${price}. Respond in ${lang === "en" ? "English" : "Spanish"}.`;

  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userQuery }
        ],
        response_format: { type: "json_object" },
        temperature: 0.7
      })
    });

    if (!response.ok) {
      const text = await response.text();
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "Groq API failed", details: text })
      };
    }

    const data = await response.json();
    const content = data.choices[0].message.content;

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
