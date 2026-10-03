import { handle, json } from "@/lib/api";
import { SAMPLES } from "@/lib/samples";

export const GET = handle(async () => json({ samples: Object.entries(SAMPLES).map(([key, s]) => ({ key, ...s })) }));
