import { useLocalSearchParams } from "expo-router";
import { ReceiptUpload } from "@/features/emergency/receipt/ReceiptUpload";
import { RequestFlow } from "@/features/emergency/request/RequestFlow";

/**
 * Full-screen modal for emergency money. `?receipt=<emergencyId>` opens the receipt upload for a
 * request that's already been paid (receipts come afterwards and never block the money).
 */
export default function EmergencyRequestScreen() {
  const { receipt } = useLocalSearchParams<{ receipt?: string }>();
  return receipt ? <ReceiptUpload emergencyId={receipt} /> : <RequestFlow />;
}
