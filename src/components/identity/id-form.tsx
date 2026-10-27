"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { IdCard, ImageUp } from "lucide-react";
import { Button, ErrorNote, Field, Input, Select, cx } from "@/components/ui";
import { DOC_TYPES, checkIdNumber, normalizeIdNumber, type DocType } from "./types";

const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPT = "image/jpeg,image/png,image/webp";

export interface IdSubmission {
  docType: DocType;
  file: File | null;
  /** Spaces and dashes removed, letters in capitals. Empty when not typed. */
  idNumber: string;
}

export function idFormData(s: IdSubmission) {
  const fd = new FormData();
  fd.append("docType", s.docType);
  if (s.file) fd.append("file", s.file);
  if (s.idNumber) fd.append("idNumber", s.idNumber);
  return fd;
}

function PhotoPicker({ file, onFile, required }: { file: File | null; onFile: (f: File | null) => void; required: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const preview = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => (preview ? URL.revokeObjectURL(preview) : undefined), [preview]);

  return (
    <div>
      {file && preview ? (
        <div className="flex items-center gap-4 rounded-xl border border-line bg-surface-2 p-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="Your ID photo" className="h-20 w-28 rounded-md border border-line object-cover" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{file.name}</div>
            <div className="text-xs text-muted">{Math.max(1, Math.round(file.size / 1024))} KB</div>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={() => onFile(null)}>
            Change
          </Button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => input.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            const f = e.dataTransfer.files?.[0];
            if (f) onFile(f);
          }}
          className={cx(
            "flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-7 text-center transition-colors",
            drag ? "border-accent bg-accent-soft" : "border-line-strong hover:border-accent",
          )}
        >
          <ImageUp className="size-7 text-muted" aria-hidden />
          <span className="text-sm font-medium">Add a photo of your ID{required ? "" : " (optional)"}</span>
          <span className="text-xs text-muted">Use good light. Keep all four corners and the text clear. JPEG, PNG or WebP, up to 10 MB.</span>
        </button>
      )}
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        className="hidden"
        aria-label="Photo of your ID"
        onChange={(e) => {
          onFile(e.target.files?.[0] ?? null);
          e.target.value = "";
        }}
      />
    </div>
  );
}

/**
 * Choose an ID type, add a photo and (optionally) type the number. Used by the ID check,
 * "find my account" and "recover with an ID". The full number is only ever sent in the request body.
 */
export function IdForm({
  docTypes,
  market = null,
  photo,
  submitLabel,
  busy,
  onSubmit,
  footer,
}: {
  docTypes: DocType[];
  /** The account's rule set ("IN", "US", ...), when known. Indian passports have their own format. */
  market?: string | null;
  /** "required": a photo is needed. "or-number": a photo, a number, or both. */
  photo: "required" | "or-number";
  submitLabel: string;
  busy?: boolean;
  onSubmit: (s: IdSubmission) => void;
  footer?: ReactNode;
}) {
  const [docType, setDocType] = useState<DocType>(docTypes[0]);
  const [file, setFile] = useState<File | null>(null);
  const [number, setNumber] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const info = DOC_TYPES[docType];

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (photo === "required" && !file) return setErr("Add a photo of your ID.");
    if (!file && !number.trim()) return setErr("Add a photo of your ID, or type its number.");
    if (file && !ACCEPT.split(",").includes(file.type)) return setErr("Use a JPEG, PNG or WebP photo.");
    if (file && file.size > MAX_BYTES) return setErr("That photo is too big. Use one under 10 MB.");
    const bad = checkIdNumber(docType, number, market);
    if (bad) return setErr(bad);
    onSubmit({ docType, file, idNumber: normalizeIdNumber(number) });
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Type of ID">
        <Select value={docType} onChange={(e) => setDocType(e.target.value as DocType)}>
          {docTypes.map((t) => (
            <option key={t} value={t}>
              {DOC_TYPES[t].label}
            </option>
          ))}
        </Select>
      </Field>
      <PhotoPicker file={file} onFile={setFile} required={photo === "required"} />
      <Field
        label="ID number"
        hint={photo === "required" ? "Optional. It helps us match faster. We only keep the last 4 digits." : "We only keep the last 4 digits."}
      >
        <Input
          value={number}
          onChange={(e) => setNumber(e.target.value)}
          placeholder={info.placeholder(market)}
          autoComplete="off"
          spellCheck={false}
          maxLength={24}
        />
      </Field>
      {err && <ErrorNote>{err}</ErrorNote>}
      <Button type="submit" className="w-full" loading={busy} icon={<IdCard className="size-4" />}>
        {submitLabel}
      </Button>
      {footer}
    </form>
  );
}
