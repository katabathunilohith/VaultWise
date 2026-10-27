import { HttpError } from "../users";
import { isDocType, type DocType } from "./ids";

/** Reads the multipart form used by KYC and recovery: `docType`, `file`, optional `idNumber`. */
export async function readIdForm(req: Request, opts: { fileRequired: boolean }) {
  // A typed number alone may come as JSON: { docType, idNumber }.
  if (!opts.fileRequired && req.headers.get("content-type")?.includes("application/json")) {
    const b = (await req.json().catch(() => null)) as { docType?: unknown; idNumber?: unknown } | null;
    if (!b || !isDocType(b.docType)) throw new HttpError(400, "Choose the type of ID.", "doc_type_not_accepted");
    const idNumber = typeof b.idNumber === "string" && b.idNumber.trim() ? b.idNumber.trim().slice(0, 40) : null;
    return { docType: b.docType as DocType, file: null, idNumber };
  }
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw new HttpError(400, "Send the form as multipart/form-data.", "bad_form");
  }
  const docType = String(form.get("docType") ?? "");
  if (!isDocType(docType)) throw new HttpError(400, "Choose the type of ID.", "doc_type_not_accepted");
  const f = form.get("file");
  const file = f instanceof File && f.size > 0 ? { buffer: Buffer.from(await f.arrayBuffer()), mime: f.type || "image/jpeg" } : null;
  if (opts.fileRequired && !file) throw new HttpError(400, "Add a photo of your ID.", "file_required");
  const raw = form.get("idNumber");
  const idNumber = typeof raw === "string" && raw.trim() ? raw.trim().slice(0, 40) : null;
  return { docType: docType as DocType, file, idNumber };
}
