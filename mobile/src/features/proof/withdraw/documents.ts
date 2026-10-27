import type { Sample } from "@/lib/api/types";
import { pickImage, sampleUpload, type PickFailure } from "@/lib/media/pick";
import type { PickedDoc } from "./types";

/**
 * Turns the three ways of providing a bill into one upload shape (lib/media/pick does the work).
 * - Library: the system photo picker.
 * - Camera: the photo expo-camera saved to the cache.
 * - Sample: in Practice mode the simulator only reads the file name; live, the sample's URL is uploaded.
 */

/** The system photo picker, with the photo named "bill-…" when the system gives no name. */
export async function pickFromLibrary(): Promise<{ ok: true; doc: PickedDoc } | PickFailure> {
  const r = await pickImage("bill");
  return r.ok ? { ok: true, doc: { ...r.image, source: "library" } } : r;
}

export function cameraDoc(photo: { uri: string; width: number; height: number }): PickedDoc {
  return {
    file: { uri: photo.uri, name: `scan-${Date.now()}.jpg`, type: "image/jpeg" },
    preview: { uri: photo.uri },
    width: photo.width,
    height: photo.height,
    source: "camera",
  };
}

export function sampleDoc(sample: Sample): PickedDoc {
  return { ...sampleUpload(sample), source: "sample", label: sample.label };
}
