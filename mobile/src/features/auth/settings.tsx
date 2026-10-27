import { useState } from "react";
import { router } from "expo-router";
import { SignOutIcon } from "@/components/icons";
import { ListRow } from "@/components/ui";
import { Dialog } from "@/features/vaults/Dialog";
import { useConnection } from "@/lib/api/hooks";
import { useAuthState } from "@/lib/auth/firebase";
import { KeyIcon } from "../kyc/icons";
import { SIGN_IN_ENABLED } from "./config";
import { signOutOfVaultwise } from "./gate";
import { AUTH_HREF } from "./routes";

/** Which identity rows Settings shows: Sign out while signed in (live), the sign-in preview in Practice. */
export function useAuthSettings() {
  const a = useAuthState();
  const { mode } = useConnection();
  return { signedIn: mode === "live" && a.enabled && !!a.user, preview: SIGN_IN_ENABLED && mode === "demo", email: a.user?.email ?? null };
}

/** Settings → Sign out, confirmed. Signing out also clears this phone's PIN and app lock. */
export function SignOutRow({ email }: { email: string | null }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const signOut = async () => {
    setBusy(true);
    try {
      await signOutOfVaultwise();
    } finally {
      setBusy(false);
      setOpen(false);
    }
  };
  return (
    <>
      <ListRow icon={SignOutIcon} title="Sign out" subtitle={email ? `Signed in as ${email}` : undefined} onPress={() => setOpen(true)} />
      <Dialog
        visible={open}
        title="Sign out of Vaultwise?"
        body="Your account and money stay as they are. This phone forgets your PIN and app lock, so set them again after you sign back in."
        onDismiss={() => setOpen(false)}
        actions={[
          { label: "Sign out", variant: "primary", loading: busy, onPress: () => void signOut() },
          { label: "Stay signed in", variant: "tonal", onPress: () => setOpen(false) },
        ]}
      />
    </>
  );
}

/** Practice only: opens the sign-in and recovery screens as a preview, so a demo can show them. */
export function SignInPreviewRow() {
  return (
    <ListRow icon={KeyIcon} title="Sign-in and recovery" subtitle="See how signing in and getting back in work. Nothing is sent." onPress={() => router.push(AUTH_HREF.welcome)} />
  );
}
