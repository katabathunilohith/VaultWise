import { admin, handle, json } from "@/lib/api";
import { recoveryQueue } from "@/lib/recovery/service";

/** identity: recovery claims waiting for a person, oldest first, plus the 20 most recent outcomes. */
export const GET = handle(async () => {
  await admin();
  return json(recoveryQueue());
});
