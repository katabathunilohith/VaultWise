import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Every test file gets its own throwaway database, never the demo one.
process.env.VAULTWISE_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "vaultwise-test-"));
// Tests must not call the AI provider.
delete process.env.GROQ_API_KEY;
