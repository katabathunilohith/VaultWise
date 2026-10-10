import { getItem, setItem } from "@/lib/storage";
import type { Tone } from "./tone";

/**
 * Reports on assistant replies (Google Play AI-generated content policy: users can flag
 * offensive or wrong output). There's no reporting API yet, so they're kept on this device for
 * the team to collect; the copy says a person will review them.
 */
export type ReportReason = "wrong" | "unsafe" | "unhelpful";

export const REPORT_REASONS: { key: ReportReason; label: string }[] = [
  { key: "wrong", label: "Wrong" },
  { key: "unsafe", label: "Unsafe" },
  { key: "unhelpful", label: "Not helpful" },
];

interface StoredReport {
  at: number;
  reason: ReportReason;
  tone: Tone;
  /** The start of the reply, so a reviewer can find it. Kept short for secure storage limits. */
  excerpt: string;
}

const KEY = "vw.aiReports";
const KEEP = 8;

export async function saveReport(reason: ReportReason, reply: { text: string; tone: Tone }) {
  let existing: StoredReport[] = [];
  try {
    const parsed: unknown = JSON.parse((await getItem(KEY)) ?? "[]");
    existing = Array.isArray(parsed) ? (parsed as StoredReport[]) : [];
  } catch {
    existing = [];
  }
  const next: StoredReport = { at: Date.now(), reason, tone: reply.tone, excerpt: reply.text.slice(0, 100) };
  await setItem(KEY, JSON.stringify([next, ...existing].slice(0, KEEP)));
}
