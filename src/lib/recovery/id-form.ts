import { get } from "../db";
import { HttpError, type User } from "../users";
import { validateUpload } from "../verification/pipeline";
import { analyseId } from "../kyc/analyse";
import { DOC_LABELS, validateIdNumber, type DocType } from "../kyc/ids";

/** Shared by find and claim: the ID form, reading its number, and the account lookup. */

export const userById = (id: string) => get<User>("SELECT * FROM users WHERE id = ?", id);

export type IdForm = { docType: DocType; file: { buffer: Buffer; mime: string } | null; idNumber: string | null };

/** Turns the form into a normalised number: the typed one, or the one read from the photo. */
export async function numberFrom(form: IdForm): Promise<{ number: string | null; analysis: Awaited<ReturnType<typeof analyseId>> | null }> {
  let typed: string | null = null;
  if (form.idNumber) {
    const v = validateIdNumber(form.docType, form.idNumber, null);
    if (!v.ok) throw new HttpError(400, v.reason, "invalid_id");
    typed = v.number;
  }
  if (form.file) {
    await validateUpload(form.file.buffer, form.file.mime);
    const analysis = await analyseId({ docType: form.docType, file: form.file, typedNumber: typed, accountName: null, market: null });
    if (!analysis.number) throw new HttpError(400, "We couldn't read the number. Type it in and try again.", "id_number_needed");
    return { number: analysis.number, analysis };
  }
  if (!typed) throw new HttpError(400, `Type your ${DOC_LABELS[form.docType]} number, or add a photo.`, "id_number_needed");
  return { number: typed, analysis: null };
}
