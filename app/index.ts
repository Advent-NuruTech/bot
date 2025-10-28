import "dotenv/config";
import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  WASocket,
  WAMessage,
  ConnectionState,
} from "@whiskeysockets/baileys";
import P from "pino";
import qrcode from "qrcode-terminal";
import { handleMessage } from "./handlers/messageHandler";

const startBot = async () => {
  const { state, saveCreds } = await useMultiFileAuthState("./app/baileys/session");

  const sock: WASocket = makeWASocket({
    auth: state,
    logger: P({ level: "silent" }),
    printQRInTerminal: false, // ✅ prevent deprecated warning
  });

  // Save creds automatically
  sock.ev.on("creds.update", saveCreds);

  // Handle connection updates (modern way)
  sock.ev.on("connection.update", (update: Partial<ConnectionState>) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.clear();
      console.log("\n📱 Scan this QR code using WhatsApp (Linked Devices):\n");
      qrcode.generate(qr, { small: true });
    }

    if (connection === "close") {
      const reason = (lastDisconnect?.error as any)?.output?.statusCode;
      if (reason === DisconnectReason.loggedOut) {
        console.log("❌ Logged out. Please rescan QR code.");
      } else {
        console.log("🔄 Connection closed. Reconnecting...");
        startBot();
      }
    }

    if (connection === "open") {
      console.log("✅ WhatsApp Connected Successfully!");
    }
  });

  // Handle messages
  sock.ev.on("messages.upsert", async (m) => {
    const message = m.messages[0];
    if (!message.message || message.key.fromMe) return;
    console.log("💬 Message from:", message.key.remoteJid);
    await handleMessage(message as WAMessage, sock);
  });
};

// Start bot
startBot()
  .then(() => console.log("🚀 Byron’s DeepSeek WhatsApp Bot is running..."))
  .catch((err) => console.error("❌ Error starting bot:", err));
