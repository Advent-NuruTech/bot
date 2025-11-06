let gpt5Failed = false; // remember if GPT-5 failed before

export const openrouter = async (prompt: string): Promise<string> => {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.warn("⚠️ Missing OpenRouter API key in .env");
    return "⚠️ Please set OPENROUTER_API_KEY in your environment file.";
  }

  // ✅ Models (GPT-5 main, DeepSeek fallback)
  const models = gpt5Failed
    ? ["deepseek/deepseek-chat-v3.1:free"]
    : ["openai/gpt-5-pro", "deepseek/deepseek-chat-v3.1:free"];

  for (const model of models) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000); // faster timeout (12s)

    try {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "HTTP-Referer": process.env.REFERER_URL || "https://openrouter.ai/",
          "X-Title": process.env.APP_TITLE || "byronassistant",
          "Content-Type": "application/json",
        },
        signal: controller.signal,
        body: JSON.stringify({
          model,
          messages: [
            {
              role: "system",
              content:
                "You are Byron’s intelligent WhatsApp assistant — helpful, concise, and professional. Clean responses; never include symbols like <｜begin▁of▁sentence｜> or irrelevant metadata.",
            },
            { role: "user", content: prompt },
          ],
        }),
      });

      clearTimeout(timeout);

      if (!response.ok) throw new Error(`HTTP ${response.status} (${model})`);
      const data = await response.json();
      let content = data?.choices?.[0]?.message?.content || "";

      // 🧹 Clean unwanted junk
      content = content
        .replace(/<\|.*?\|>/g, "") // remove <|...|> artifacts
        .replace(/<.*?begin.*?sentence.*?>/gi, "")
        .replace(/\n{3,}/g, "\n\n")
        .trim();

      if (content) {
        console.log(`✅ Responded using: ${model}`);
        if (model.includes("gpt-5")) gpt5Failed = false;
        return content;
      }
    } catch (err: any) {
      clearTimeout(timeout);
      console.warn(`⚠️ ${model} failed: ${err.message}`);
      if (model.includes("gpt-5")) gpt5Failed = true; // skip next time
    }
  }

  return "⚠️ Sorry, all models are currently unavailable. Please try again later.";
};
