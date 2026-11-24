import { z } from "zod";
import { body, customer, handle, json } from "@/lib/api";
import { registerPushToken, unregisterPushToken } from "@/lib/alerts";
import { currentDevice } from "@/lib/devices";

const Token = z.string().trim().min(1).max(250);

/**
 * Registers the calling phone's Expo push token: `{ token, platform }` (platform `ios`, `android` or
 * `web`). The token is tied to the calling device, so signing that device out stops its
 * notifications. 400 `push_token_invalid` for something that isn't an Expo push token. `{ ok: true }`.
 */
export const POST = handle(async (req: Request) => {
  const user = await customer({ tick: false });
  const b = await body(req, z.object({ token: Token, platform: z.enum(["ios", "android", "web"]) }));
  const ctx = await currentDevice(user);
  registerPushToken(user.id, { token: b.token, platform: b.platform, deviceId: ctx.device?.id ?? null });
  return json({ ok: true });
});

/** Stops notifications to a phone that signs out: `{ token }`. `{ ok: true }` (also when it wasn't registered). */
export const DELETE = handle(async (req: Request) => {
  const user = await customer({ tick: false });
  const b = await body(req, z.object({ token: Token }));
  unregisterPushToken(user.id, b.token);
  return json({ ok: true });
});
