/**
 * Reads the shared contract vectors (../tests/contract/vectors/*.json at the repo root) for the
 * phone's runners (`__tests__/contract-*.test.ts`). The server's runners read the same files
 * (tests/contract/vectors.ts). Never imported by the app. See tests/contract/README.md.
 */
import fs from "node:fs";
import path from "node:path";

export interface Case<I, E> {
  /** Why this case exists, in a few words; the test's name on both sides. */
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

/** mobile/src/test → the repo root's tests/contract/vectors. */
export const VECTORS_DIR = path.resolve(__dirname, "../../../tests/contract/vectors");

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
