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

  /* ---------- LANGUAGE-AWARE PROMPTS ---------- */

  const systemPromptEn = `
You are a knowledgeable Chicago local guide.
Suggest ONE specific, real location or activity for a date in Chicago.
Avoid tourist clichés. Favor authentic, well-liked local spots.
Focus on safety, cleanliness, and quality.

Respond ONLY in valid JSON using this exact schema:
{
  "Title": "Name",
  "Location": "Neighborhood",
  "Description": "1-2 sentences",
  "Hours": "Times",
  "BestTime": "When to go",
  "Occupancy": "Crowd level",
  "MapQuery": "Search term"
}
`.trim();

  const systemPromptEs = `
Eres un guía local experto de Chicago.
Sugiere UN solo lugar o actividad real para una cita en Chicago.
Evita clichés turísticos. Prioriza lugares auténticos y bien valorados.
Enfócate en seguridad, limpieza y calidad.

Responde ÚNICAMENTE en JSON válido usando este esquema exacto:
{
  "Title": "Nombre",
  "Location": "Barrio",
  "Description": "1-2 oraciones",
  "Hours": "Horario",
  "BestTime": "Mejor momento",
  "Occupancy": "Nivel de gente",
  "MapQuery": "Término de búsqueda"
}
`.trim();

  const userPromptEn = `
Date type: ${dateType}
Time of day: ${timeOfDay}
Atmosphere: ${atmosphere}
Price range: ${price}
Language: English
`.trim();

  const userPromptEs = `
Tipo de cita: ${dateType}
Hora del día: ${timeOfDay}
Ambiente: ${atmosphere}
Rango de precio: ${price}
Idioma: Español
`.trim();

  const systemPrompt = lang === "es" ? systemPromptEs : systemPromptEn;
  const userPrompt = lang === "es" ? userPromptEs : userPromptEn;

  /* ---------- GROQ REQUEST ---------- */

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
        temperature: 0.65
      })
    });

    if (!response.ok) {
      throw new Error("Groq API request failed");
    }

    const data = await response.json();
    const content = data.choices[0].message.content;

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: content
    };

  } catch {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "AI request failed" })
    };
  }
}
