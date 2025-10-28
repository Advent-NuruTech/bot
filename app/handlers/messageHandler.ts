import fs from "fs";
import { deepseek } from "../config/deepseek";
import { WAMessage, WASocket } from "@whiskeysockets/baileys";

export const handleMessage = async (message: WAMessage, sock: WASocket): Promise<void> => {
  try {
    const text =
      message.message?.conversation ||
      message.message?.extendedTextMessage?.text ||
      "";

    const sender = message.key.remoteJid;
    if (!text || !sender) return;

    // merge all your json knowledge data
    const knowledgeFiles = fs.readdirSync("./app/data/knowledge");
    let knowledge = "";
    for (const file of knowledgeFiles) {
      knowledge += fs.readFileSync(`./app/data/knowledge/${file}`, "utf8");
    }

    const prompt = `
You are Byron's personal assistant. Use this knowledge base:
${knowledge}

User: ${text}
`;

    const reply = await deepseek(prompt);
    await sock.sendMessage(sender, { text: reply });
  } catch (error) {
    console.error("❌ Error handling message:", error);
  }
};
