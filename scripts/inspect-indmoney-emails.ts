import fs from "node:fs";
import path from "node:path";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";

function loadEnvLocal(): Record<string, string> {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) {
    throw new Error(".env.local not found");
  }
  const out: Record<string, string> = {};
  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    const val = line.slice(eq + 1).trim();
    out[key] = val;
  }
  return out;
}

async function main() {
  const env = loadEnvLocal();
  const host = env.EMAIL_IMAP_HOST || "imap.gmail.com";
  const port = Number(env.EMAIL_IMAP_PORT || "993");
  const user = env.EMAIL_IMAP_USER;
  const pass = env.EMAIL_IMAP_PASS;
  const filterFrom = env.EMAIL_FILTER_FROM || "indmoney";

  if (!user || !pass || pass.includes("REPLACE_WITH")) {
    throw new Error("Please update EMAIL_IMAP_USER and EMAIL_IMAP_PASS in .env.local first.");
  }

  const client = new ImapFlow({
    host,
    port,
    secure: true,
    auth: { user, pass },
    logger: false,
  });

  await client.connect();
  const lock = await client.getMailboxLock("INBOX");
  try {
    const uids = await client.search({ from: filterFrom }, { uid: true });
    const list = Array.isArray(uids) ? uids : [];
    const recent = list.slice(-25).reverse();
    console.log(`Found ${list.length} emails matching from:${filterFrom}. Showing latest ${recent.length}:\n`);

    for (const uid of recent) {
      const msg = await client.fetchOne(String(uid), { source: true }, { uid: true });
      if (!msg || !msg.source) continue;
      const parsed = await simpleParser(msg.source);
      const dateStr = parsed.date ? parsed.date.toISOString().slice(0, 19).replace("T", " ") : "unknown";
      const fromStr = parsed.from?.text ?? "";
      const subject = parsed.subject ?? "(no subject)";
      const text = (parsed.text ?? "").replace(/\s+/g, " ").trim().slice(0, 260);
      console.log(`[${dateStr}] ${subject}`);
      console.log(`  From: ${fromStr}`);
      console.log(`  Snippet: ${text}`);
      console.log("---");
    }
  } finally {
    lock.release();
    await client.logout();
  }
}

main().catch((err) => {
  console.error("Email inspection failed:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
