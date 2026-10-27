import { customer, handle, json } from "@/lib/api";
import { readIdForm } from "@/lib/kyc/form";
import { kycView, submitKyc } from "@/lib/kyc/service";

export const maxDuration = 90;

/** identity: the caller's ID check → { status, docType, idLast4, reasons, updatedAt }. */
export const GET = handle(async () => {
  const user = await customer({ tick: false, access: "read" });
  return json(kycView(user));
});

/** Multipart { docType, file, idNumber? }: runs the KYC provider and answers with the same shape. */
export const POST = handle(async (req: Request) => {
  const user = await customer({ tick: false });
  const form = await readIdForm(req, { fileRequired: true });
  return json(await submitKyc(user, { docType: form.docType, file: form.file!, idNumber: form.idNumber }), { status: 201 });
});
