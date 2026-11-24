import { MpinPanel } from "@/features/mpin";
import { PhoneVerifyScreen } from "@/features/phone-verify";

/** phone-verify: add or change the phone number with a code, then the MPIN (the MPIN prompt is handed in). */
export default function VerifyPhoneRoute() {
  return <PhoneVerifyScreen MpinPanel={MpinPanel} />;
}
