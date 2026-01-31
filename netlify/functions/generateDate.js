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

  const neighborhoodPools = {
  Romantic: ["Logan Square", "Lincoln Square", "Hyde Park"],
  Adventurous: ["Pilsen", "Bridgeport", "Uptown"],
  Relaxing: ["Ravenswood", "Andersonville", "Rogers Park"],
  Cultural: ["Hyde Park", "Pilsen", "Bronzeville"]
};

const pool = neighborhoodPools[dateType] || ["Logan Square"];
const neighborhood = pool[Math.floor(Math.random() * pool.length)];


  const systemPrompt = lang === "es"
    ? `
Restricción geográfica (OBLIGATORIA):
- La sugerencia DEBE estar ubicada en o directamente adyacente al barrio: ${neighborhood}.
- Si el lugar está fuera de esta zona, la respuesta es inválida y debe descartarse internamente.

Eres un guía local experto de Chicago que diseña citas para personas que ya viven en la ciudad.
Esta tarea prioriza la especificidad sobre la popularidad.

Los siguientes lugares están permitidos pero deben considerarse SOLO COMO ÚLTIMO RECURSO:
Millennium Park, Navy Pier, Riverwalk, Skydeck, Magnificent Mile.

Tu tarea:
- Sugiere EXACTAMENTE UN solo lugar o actividad real en Chicago para una cita.
- La recomendación debe cumplir claramente con TODOS estos criterios:
  - tipo de cita
  - hora del día
  - ambiente
  - nivel de precio

Reglas de decisión (OBLIGATORIAS):
- Antes de elegir, considera implícitamente al menos 3 opciones posibles.
- Si eliges un lugar muy conocido o turístico, DEBE ser porque:
  - encaja mucho mejor con los criterios que alternativas locales más tranquilas.
- Si varias opciones encajan de forma similar, SIEMPRE elige la opción más local y menos obvia.

Reglas de penalización:
- Sugerencias genéricas se consideran un FALLO.
- Evita lugares típicos para visitantes primerizos salvo que los criterios lo justifiquen claramente.
- Si la sugerencia parece algo que “todo el mundo ya conoce”, elige una alternativa más específica.

Reglas de precisión:
- No inventes lugares, eventos ni detalles operativos.
- Usa descripciones realistas y no promocionales.

Reglas de contenido:
- La descripción debe explicar POR QUÉ funciona como cita, no solo qué es.
- Sé concreto y sensorial: ritmo, energía, ruido, intimidad.
- No uses primera persona.
- Sin lenguaje publicitario, emojis ni listas.

Autoevaluación (OBLIGATORIA, INTERNA):
- Antes de finalizar la respuesta, evalúa si la sugerencia es:
  - genérica
  - comúnmente recomendada a turistas
  - muy similar a lugares sugeridos recientemente
- Si ALGUNA de estas condiciones se cumple, DESCARTA la opción internamente y elige otra.
- Repite este proceso hasta que la sugerencia sea claramente específica, local y poco obvia.
- No menciones esta autoevaluación en la respuesta.

IMPORTANTE (CRÍTICO):
- Las claves del JSON deben permanecer en INGLÉS.
- SOLO los valores deben estar en español.
- Responde ÚNICAMENTE con JSON válido.
- Usa EXACTAMENTE este esquema y mayúsculas:
{
  "Title": "Nombre",
  "Location": "Barrio",
  "Description": "Descripción",
  "Hours": "Horario",
  "BestTime": "Mejor momento",
  "Occupancy": "Nivel de gente",
  "MapQuery": "Búsqueda"
}
- No agregues claves.
- No incluyas texto fuera del JSON.

`.trim()
    : `
Geographic constraint (MANDATORY):
- The suggestion MUST be located in or directly adjacent to the neighborhood: ${neighborhood}.
- If the location is outside this area, the answer is invalid and must be regenerated internally.

You are an expert Chicago local who curates date ideas for people who already live in the city.
This task prioritizes specificity over popularity.

The following locations are allowed but should be considered LAST unless they uniquely fit the criteria:
Millennium Park, Navy Pier, Riverwalk, Skydeck, Magnificent Mile.

Your task:
- Suggest EXACTLY ONE real, specific place or activity in Chicago for a date.
- The suggestion must clearly and directly satisfy ALL of the following:
  - date type
  - time of day
  - atmosphere
  - price level

Decision rules (MANDATORY):
- Before choosing, implicitly consider at least 3 possible options.
- If a well-known or tourist-heavy location is chosen, it MUST be because:
  - it fits the user’s criteria significantly better than quieter, local alternatives.
- If multiple options fit similarly well, ALWAYS choose the more local, less obvious option.

Penalty rules:
- Generic or default suggestions are considered FAILURE.
- Avoid places commonly suggested to first-time visitors unless explicitly justified by the criteria.
- If the result feels like something “everyone already knows,” choose a more specific alternative.

Accuracy rules:
- Do NOT invent places, events, or operating details.
- Use realistic, non-promotional descriptions.

Content rules:
- The description must explain WHY this works as a date, not just what it is.
- Be concrete and sensory: pacing, energy level, noise, intimacy.
- No first-person voice.
- No marketing language, emojis, hashtags, or lists.

Self-check (MANDATORY, INTERNAL):
- Before finalizing the answer, evaluate whether the suggestion is:
  - generic
  - commonly suggested to tourists
  - very similar to recently suggested locations
- If ANY of the above are true, DISCARD the choice internally and select a different option.
- Repeat this process until the suggestion is clearly specific, local, and non-obvious.
- Do NOT mention this self-check in the output.

Formatting rules (CRITICAL):
- Respond ONLY with valid JSON.
- Use this EXACT schema and key casing:
{
  "Title": "Name",
  "Location": "Neighborhood",
  "Description": "Description",
  "Hours": "Hours",
  "BestTime": "Best time",
  "Occupancy": "Crowd level",
  "MapQuery": "Search query"
}
- Do NOT add keys.
- Do NOT include text outside the JSON.

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
  temperature: 0.85,
  top_p: 0.9
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
