import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { openrouter } from "../config/openrouter";
import { WAMessage, WASocket } from "@whiskeysockets/baileys";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 🧠 Directory for per-user/group memory
const memoryDir = path.resolve(__dirname, "../../data/memory");
await fs.mkdir(memoryDir, { recursive: true });

// 💾 Memory interface
interface MessageMemory {
  history: { role: "user" | "assistant"; content: string }[];
  lastInteraction: number;
  contextType?: string; // tracks current conversation topic
}

// --- MEMORY FUNCTIONS ---
const loadUserMemory = async (chatId: string): Promise<MessageMemory> => {
  const filePath = path.join(memoryDir, `${chatId}.json`);
  try {
    const data = await fs.readFile(filePath, "utf8");
    return JSON.parse(data);
  } catch {
    return { history: [], lastInteraction: 0, contextType: "general" };
  }
};

const saveUserMemory = async (chatId: string, memory: MessageMemory): Promise<void> => {
  const filePath = path.join(memoryDir, `${chatId}.json`);
  await fs.writeFile(filePath, JSON.stringify(memory, null, 2), "utf8");
};

// --- KNOWLEDGE BASE LOADER (cache for performance) ---
const knowledgeDir = path.resolve("C:/Users/ADVENT/Desktop/waab/app/data/knowledge");
let knowledgeCache: Record<string, string> | null = null;

const loadKnowledgeBases = async (): Promise<Record<string, string>> => {
  if (knowledgeCache) return knowledgeCache; // ✅ use cache
  const knowledge: Record<string, string> = {};
  const files = await fs.readdir(knowledgeDir);
  for (const file of files) {
    if (file.endsWith(".json")) {
      const content = await fs.readFile(path.join(knowledgeDir, file), "utf8");
      const key = path.basename(file, ".json");
      knowledge[key] = content;
    }
  }
  knowledgeCache = knowledge;
  console.log("✅ Knowledge bases cached:", Object.keys(knowledge));
  return knowledge;
};

// --- HELPERS ---
const isGreeting = (text: string) => /\b(hi|hello|hey|good morning|good afternoon|good evening)\b/i.test(text);
const isQuestion = (text: string) =>
  text.trim().endsWith("?") || /\b(what|how|where|price|buy|cost|available)\b/i.test(text);

const detectIntent = (text: string): string => {
  const lower = text.toLowerCase();
  if (lower.includes("price") || lower.includes("shop") || lower.includes("buy") || lower.includes("product"))
    return "shop";
  if (lower.includes("nurutech") || lower.includes("website") || lower.includes("app") || lower.includes("automation"))
    return "business";
  if (lower.includes("health") || lower.includes("remedy") || lower.includes("natural") || lower.includes("disease"))
    return "health";
  return "general";
};

// --- MAIN MESSAGE HANDLER ---
export const handleMessage = async (message: WAMessage, sock: WASocket): Promise<void> => {
  try {
    const sender = message.key.remoteJid;
    if (!sender) return;

    const text =
      message.message?.conversation ||
      message.message?.extendedTextMessage?.text ||
      "";
    const cleanedText = text.trim();
    if (!cleanedText || message.key.fromMe || sender === "status@broadcast") return;

    const chatMemory = await loadUserMemory(sender);

    // Prevent duplicates
    const lastUserMsg = chatMemory.history.filter(m => m.role === "user").pop()?.content;
    if (lastUserMsg === cleanedText) return;

    // Check for greeting / question / continuation
    const isFollowUp =
      Date.now() - chatMemory.lastInteraction < 1000 * 60 * 5; // within 5 minutes
    const shouldRespond =
      isGreeting(cleanedText) || isQuestion(cleanedText) || isFollowUp;

    if (!shouldRespond) return;

    // Detect context
    const intent = detectIntent(cleanedText);
    chatMemory.contextType = intent;
    chatMemory.history.push({ role: "user", content: cleanedText });
    chatMemory.lastInteraction = Date.now();
    if (chatMemory.history.length > 10)
      chatMemory.history = chatMemory.history.slice(-10);

    // Knowledge context
    const knowledgeBases = await loadKnowledgeBases();
    const selectedKnowledge =
      knowledgeBases[intent] ||
      Object.values(knowledgeBases).slice(0, 2).join("\n");

    const conversationContext = chatMemory.history
      .map(m => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
      .join("\n")
      .slice(-2000);

    // 🧠 Prompt optimized for fast, clean answers
    const prompt = `
You are Byron's AI WhatsApp assistant for NuruShop and Advent NuruTech.

TASK:
- Continue chat naturally based on the last few messages.
- If user asks for products, display them clearly in this format:
  🛒 *Product:* NAME
  💰 *Price:* KSH XXX
  🔗 *Link:* nurushop.co.ke/product-name
  📜 *Details:* SHORT DESCRIPTION
- If user asks about something not in stock, say:
  "Sorry, that item is currently out of stock. Please check again soon at nurushop.co.ke."
- If user asks for contact or more info, show this:
  "You can reach Mtumishi Byron at +254759167209."
- Keep answers fast, direct, and warm.
- Avoid repeating contact info unless user requests it directly.

Knowledge (${intent} context):
${selectedKnowledge.slice(0, 4000)}

Conversation so far:
${conversationContext}

Now respond briefly and clearly to:
"${cleanedText}"
`;

    const reply = await openrouter(prompt);
    if (!reply) return;

    const cleanReply = reply
      .replace(/<\|.*?\|>/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    chatMemory.history.push({ role: "assistant", content: cleanReply });
    await saveUserMemory(sender, chatMemory);

    await sock.sendMessage(sender, { text: cleanReply });
  } catch (err) {
    console.error("❌ Error in handleMessage:", err);
  }
};
