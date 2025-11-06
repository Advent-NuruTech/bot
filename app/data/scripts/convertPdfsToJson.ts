// scripts/convertPdfsToJson.ts
import fs from "fs";
import path from "path";
import crypto from "crypto";
import pdf from "pdf-parse";

const pdfDir = path.join(process.cwd(), "app/pdfs");
const processedDir = path.join(process.cwd(), "data/knowledge/processed");
const outputJson = path.join(process.cwd(), "data/knowledge/knowledgeBase.json");

// ensure folders exist
if (!fs.existsSync(pdfDir)) fs.mkdirSync(pdfDir, { recursive: true });
if (!fs.existsSync(processedDir)) fs.mkdirSync(processedDir, { recursive: true });

type DocRecord = {
  title: string;
  source: string;
  content: string;
  mtimeMs: number;
  checksum: string;
};

function checksumBuffer(buf: Buffer) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

async function processPdf(filePath: string): Promise<DocRecord | null> {
  const fileBuf = fs.readFileSync(filePath);
  const stats = fs.statSync(filePath);
  const checksum = checksumBuffer(fileBuf);
  const title = path.basename(filePath, path.extname(filePath));
  const outTxtPath = path.join(processedDir, `${title}.txt`);

  // If processed and checksum+mtime match, skip
  if (fs.existsSync(outTxtPath)) {
    try {
      const metaPath = outTxtPath + ".meta.json";
      if (fs.existsSync(metaPath)) {
        const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
        if (meta.checksum === checksum && meta.mtimeMs === stats.mtimeMs) {
          console.log(`↩️ Skipping unchanged: ${title}`);
          return { title, source: `pdfs/${path.basename(filePath)}`, content: fs.readFileSync(outTxtPath, "utf8"), mtimeMs: stats.mtimeMs, checksum };
        }
      }
    } catch (e) {
      console.warn("⚠️ meta read failed, will reprocess:", title);
    }
  }

  try {
    const pdfData = await pdf(fileBuf);
    let text = (pdfData.text || "").replace(/\s+/g, " ").trim();
    // optional: trim to safe limit (tweak 300000 chars if you want)
    const MAX_CHARS = 300_000;
    if (text.length > MAX_CHARS) text = text.slice(0, MAX_CHARS);
    
    if (!text) {
      console.warn(`⚠️  Warning: No text extracted from ${title}. The PDF might be image-based or protected.`);
    }

    fs.writeFileSync(outTxtPath, text, "utf8");
    fs.writeFileSync(outTxtPath + ".meta.json", JSON.stringify({ checksum, mtimeMs: stats.mtimeMs }, null, 2), "utf8");
    console.log(`✅ Processed: ${title}`);
    return { title, source: `pdfs/${path.basename(filePath)}`, content: text, mtimeMs: stats.mtimeMs, checksum };
  } catch (err: any) {
    console.error(`❌ Failed: ${title}`, err.message || err);
    return null;
  }
}

async function main() {
  const files = fs.existsSync(pdfDir) ? fs.readdirSync(pdfDir).filter(f => f.toLowerCase().endsWith(".pdf")) : [];
  const existing: DocRecord[] = fs.existsSync(outputJson) ? JSON.parse(fs.readFileSync(outputJson, "utf8")) : [];

  // Map existing by title for fast replace
  const existingMap = new Map(existing.map(d => [d.title, d]));

  for (const f of files) {
    const filePath = path.join(pdfDir, f);
    const rec = await processPdf(filePath);
    if (rec) {
      existingMap.set(rec.title, rec);
    }
  }

  // Write out combined list (array ordered by title)
  const combined = Array.from(existingMap.values()).sort((a, b) => a.title.localeCompare(b.title));
  // Atomic write
  fs.writeFileSync(outputJson + ".tmp", JSON.stringify(combined, null, 2), "utf8");
  fs.renameSync(outputJson + ".tmp", outputJson);
  console.log(`\n📘 knowledgeBase.json updated — ${combined.length} docs`);
}

main().catch(err => {
  console.error("Fatal converter error:", err);
  process.exit(1);
});
