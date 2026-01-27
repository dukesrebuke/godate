export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: "Method not allowed" })
    };
  }

  const GROQ_API_KEY = process.env.GROQ_API_KEY;

  if (!GROQ_API_KEY) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Groq API key missing" })
    };
  }

  let payload;
  try {
    payload = JSON.parse(event.body);
  } catch {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Invalid request body" })
    };
  }

  const { dateType, timeOfDay, atmosphere, price, lang } = payload;

  const systemPrompt = lang === "es"
    ? `
Eres un guía local experto de Chicago.
Sugiere UN solo lugar o actividad real para una cita.
Evita clichés turísticos.

IMPORTANTE:
Las claves del JSON deben permanecer en INGLÉS.
Solo los valores deben estar en español.

Responde solo con JSON válido usando este esquema exacto:
{
  "Title": "Nombre",
  "Location": "Barrio",
  "Description": "Descripción",
  "Hours": "Horario",
  "BestTime": "Mejor momento",
  "Occupancy": "Nivel de gente",
  "MapQuery": "Búsqueda"
}
`.trim()
    : `
You are a knowledgeable Chicago local guide.
Suggest ONE real date location or activity.
Avoid tourist clichés.

Respond only with valid JSON using this exact schema:
{
  "Title": "Name",
  "Location": "Neighborhood",
  "Description": "Description",
  "Hours": "Hours",
  "BestTime": "Best time",
  "Occupancy": "Crowd level",
  "MapQuery": "Search query"
}
`.trim();

  const userPrompt = lang === "es"
    ? `Tipo: ${dateType}, Hora: ${timeOfDay}, Ambiente: ${atmosphere}, Precio: ${price}.`
    : `Type: ${dateType}, Time: ${timeOfDay}, Atmosphere: ${atmosphere}, Price: ${price}.`;

  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        response_format: { type: "json_object" },
        temperature: 1.1
      })
    });

    if (!response.ok) {
      throw new Error("AI request failed");
    }

    const data = await response.json();
    let result = JSON.parse(data.choices[0].message.content);

    // SAFE FALLBACKS (language-aware)
    const defaults = lang === "es"
      ? {
          Hours: "Horario variable",
          BestTime: "Mejor por la tarde o noche",
          Occupancy: "Nivel moderado de gente"
        }
      : {
          Hours: "Hours vary",
          BestTime: "Best in the afternoon or evening",
          Occupancy: "Moderate crowd"
        };

    result.Hours = result.Hours?.trim() || defaults.Hours;
    result.BestTime = result.BestTime?.trim() || defaults.BestTime;
    result.Occupancy = result.Occupancy?.trim() || defaults.Occupancy;

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(result)
    };

  } catch {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Failed to generate date idea" })
    };
  }
}
