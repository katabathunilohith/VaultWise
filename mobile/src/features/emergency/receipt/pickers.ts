import type { Sample } from "@/lib/api/types";
import { pickImage, sampleUpload, takePhoto as cameraPhoto, type PickedImage, type PickResult } from "@/lib/media/pick";

/** The three ways in for a receipt (lib/media/pick), with photos named "receipt-…". */

export type Picked = PickedImage;
export type { PickResult };

/** The system camera (no in-app viewfinder needed for a single receipt). */
export function takePhoto(): Promise<PickResult> {
  return cameraPhoto("receipt");
}

/** The system photo picker (no library permission needed). */
export function choosePhoto(): Promise<PickResult> {
  return pickImage("receipt");
}

/** A practice sample document. */
export function pickSample(s: Sample): Picked {
  return sampleUpload(s);
}
