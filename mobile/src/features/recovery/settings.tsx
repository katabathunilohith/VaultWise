import { router } from "expo-router";
import { ListRow, StatusPill } from "@/components/ui";
import { useMe } from "@/lib/api/hooks";
import { ShieldWarningIcon } from "../kyc/icons";
import { isRecoveryAccess } from "./queries";
import { RECOVERY_HREF } from "./routes";

/** True while this account is read-only because a recovery request waits for a person. */
export function useRecoveryPending() {
  const me = useMe();
  return isRecoveryAccess(me.data);
}

/** Settings: the waiting recovery request, opening its status. */
export function RecoveryRow() {
  return (
    <ListRow
      icon={ShieldWarningIcon}
      title="Account recovery"
      subtitle="A person is checking it's you. Money can't move yet."
      trailing={<StatusPill tone="info" label="Being checked" />}
      accessibilityLabel="Account recovery. Being checked. A person is checking it's you. Money can't move yet."
      onPress={() => router.push(RECOVERY_HREF.status)}
    />
  );
}
