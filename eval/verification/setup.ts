import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Each evaluation run gets its own throwaway database and upload folder (never data/).
process.env.VAULTWISE_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "vaultwise-eval-"));
// Only the live configuration may reach Groq, and it sets the key itself from GROQ_LIVE_KEY.
delete process.env.GROQ_API_KEY;
