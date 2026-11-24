/**
 * Reads the shared contract vectors (tests/contract/vectors/*.json) for the server's runners. The
 * phone's runners read the same files (mobile/src/test/contract.ts). See README.md.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect } from "vitest";

export interface Case<I, E> {
  /** Why this case exists, in a few words; shown as the test name on both sides. */
  why: string;
  input: I;
  expected: E;
}

export interface VectorFile {
  rule: string;
  about: string;
  server: string;
  phone: string;
  cases: Record<string, Case<unknown, unknown>[]>;
}

export const VECTORS_DIR = fileURLToPath(new URL("./vectors/", import.meta.url));

/** Every vector file's rule name (the file name without .json). */
export function vectorRules(): string[] {
  return fs
    .readdirSync(VECTORS_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, ""))
    .sort();
}

export function loadVectors(rule: string): VectorFile {
  return JSON.parse(fs.readFileSync(path.join(VECTORS_DIR, `${rule}.json`), "utf8")) as VectorFile;
}

/** One section's cases, typed by the caller. Throws when the section is missing or empty. */
export function casesOf<I, E>(file: VectorFile, section: string): Case<I, E>[] {
  const cases = file.cases[section];
  if (!Array.isArray(cases) || cases.length === 0) throw new Error(`${file.rule}.json has no "${section}" cases`);
  return cases as Case<I, E>[];
}

/** A runner must handle every section of its file, so a section added to the JSON can't go unchecked. */
export function expectSections(file: VectorFile, handled: string[]) {
  expect(Object.keys(file.cases).sort()).toEqual([...handled].sort());
}
