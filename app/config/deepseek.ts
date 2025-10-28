export const deepseek = async (prompt: string): Promise<string> => {
  try {
    if (!process.env.DEEPSEEK_API_KEY) {
      console.warn("⚠️ Missing DeepSeek API key in environment variables.");
      return "⚠️ DeepSeek API key not configured. Please add it in your environment settings.";
    }

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.DEEPSEEK_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "deepseek/deepseek-chat",
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error("❌ DeepSeek API Error Response:", JSON.stringify(errorData, null, 2));
      throw new Error(
        `API request failed with status ${response.status}: ${errorData.error?.message || response.statusText}`
      );
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;

    return content?.trim() || "⚠️ Received an empty or invalid response from the API.";
  } catch (error: any) {
    console.error("❌ DeepSeek API Error:", error);
    return "⚠️ Unable to connect to DeepSeek API or process your request.";
  }
};
