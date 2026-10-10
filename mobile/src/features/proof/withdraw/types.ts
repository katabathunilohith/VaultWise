import type { ImageSourcePropType } from "react-native";
import type { UploadFile } from "@/lib/api/types";

/** Steps of the withdraw-with-proof flow. Only the top of the step stack renders. */
export type Step =
  | "resume"
  | "choose"
  | "amount"
  | "payee"
  | "proof"
  | "samples"
  | "primer"
  | "cameraOff"
  | "camera"
  | "review"
  | "verifying";

export type DocSource = "camera" | "library" | "sample";

/** A photo or sample ready to send, with what to show while reviewing it. */
export interface PickedDoc {
  file: UploadFile;
  preview: ImageSourcePropType;
  width?: number;
  height?: number;
  source: DocSource;
  /** Sample label, when it's one of ours. */
  label?: string;
}

export type CameraOffReason = "denied" | "unavailable" | "web";

/** Leading header control: Close on the first step, Back afterwards. */
export interface StepNav {
  onClose: () => void;
  onBack?: () => void;
}

/** The vault fields the flow needs. */
export interface FlowVault {
  id: string;
  name: string;
  category: string;
  /** The category whose proof rules apply (a custom vault's template). */
  proofCategory: string;
  available: number;
  held: number;
  currency: string;
}
