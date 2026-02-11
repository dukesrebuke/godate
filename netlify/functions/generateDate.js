const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

exports.handler = async (event) => {
  const { dateType, timeOfDay, atmosphere, price, lang } = JSON.parse(event.body);
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

  const systemPrompt = `You are a trendy, plugged-in Chicago tastemaker who hates "tourist traps." 
  Your goal is to suggest one highly specific, atmospheric date activity in the Chicagoland area.
  
  Rules:
  - Niche over Notorious: Avoid Navy Pier, Millennium Park, or River North chains. 
  - Price Range: Map the user's price selection to: $ (Budget), $$ (Mid), $$$ (Upscale), $$$$ (Luxury).
  
  Respond ONLY in valid JSON format:
  {"Title":"Name","Location":"Neighborhood","Description":"1-2 sentences with sensory details","Hours":"Times","BestTime":"When to go","Occupancy":"Crowd level","PriceRange":"$ to $$$$","MapQuery":"Search term"}`;

  const userQuery = `Type: ${dateType}, Time: ${timeOfDay}, Atmosphere: ${atmosphere}, Price: ${price}. Respond in ${lang === "en" ? "English" : "Spanish"}.`;

  try {
    const result = await model.generateContent([systemPrompt, userQuery]);
    const response = await result.response;
    let text = response.text().replace(/```json|```/g, "").trim();

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: text
    };
  } catch (error) {
    return { statusCode: 500, body: JSON.stringify({ error: "Local guide is busy. Try again!" }) };
  }
};