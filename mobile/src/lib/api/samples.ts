import type { ImageSourcePropType } from "react-native";
import { getConnection } from "./connection";
import type { Sample } from "./types";

/** Sample documents bundled with the app so "Use a sample" works in demo mode. */
const BUNDLED: Record<string, ImageSourcePropType> = {
  "medical-invoice": require("@/assets/samples/medical-invoice.jpg"),
  "pharmacy-receipt": require("@/assets/samples/pharmacy-receipt.jpg"),
  "tuition-invoice": require("@/assets/samples/tuition-invoice.jpg"),
  "rent-receipt": require("@/assets/samples/rent-receipt.jpg"),
  "coffee-receipt": require("@/assets/samples/coffee-receipt.jpg"),
  "old-invoice": require("@/assets/samples/old-invoice.jpg"),
  "tampered-invoice": require("@/assets/samples/tampered-invoice.jpg"),
};

export const DEMO_SAMPLES: Sample[] = [
  { key: "medical-invoice", label: "Hospital invoice", category: "health", expect: "Should auto-approve from a Health vault" },
  { key: "pharmacy-receipt", label: "Pharmacy receipt", category: "health", expect: "Should auto-approve from a Health vault" },
  { key: "tuition-invoice", label: "Tuition invoice", category: "education", expect: "Education vault, dependant's name" },
  { key: "rent-receipt", label: "Rent receipt", category: "housing", expect: "Should pass for a Housing vault" },
  { key: "coffee-receipt", label: "Coffee shop receipt", category: "other", expect: "Purpose mismatch, should be declined" },
  { key: "old-invoice", label: "Ten-month-old invoice", category: "health", expect: "Older than the vault accepts, goes to a person" },
  { key: "tampered-invoice", label: "Edited hospital invoice", category: "health", expect: "Total was altered, tamper checks fire" },
];

/** Image to show for a sample: the live server's render when connected, otherwise the bundled copy. */
export function sampleSource(key: string): ImageSourcePropType {
  const { mode, baseUrl } = getConnection();
  if (mode === "live") return { uri: `${baseUrl}/api/v1/samples/${key}` };
  return BUNDLED[key] ?? BUNDLED["medical-invoice"];
}
