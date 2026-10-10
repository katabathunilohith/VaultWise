import * as ImagePicker from "expo-image-picker";
import { api } from "@/lib/api/client";
import { sampleSource } from "@/lib/api/samples";
import type { Sample } from "@/lib/api/types";
import { withSystemUi } from "@/lib/session";
import type { PickedDoc } from "./types";

/**
 * Turns the three ways of providing a bill into one upload shape.
 * - Library: the system photo picker (no photo-library permission needed to pick one image).
 * - Camera: the photo expo-camera saved to the cache.
 * - Sample: in Practice mode the simulator only reads the file name; live, the sample's URL is
 *   uploaded directly (the web client fetches it into a Blob, native passes the URI to FormData).
 */

function extFor(mime: string | null | undefined) {
  const sub = mime?.split("/")[1]?.toLowerCase();
  if (!sub) return "jpg";
  return sub === "jpeg" ? "jpg" : sub;
}

/** The system photo picker. It's system UI, so the app lock waits for it (withSystemUi). */
export async function pickFromLibrary(): Promise<PickedDoc | null> {
  const r = await withSystemUi(() =>
    ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.85,
      allowsEditing: false,
      allowsMultipleSelection: false,
      // JPEG rather than HEIC, so the server can read it; fetch iCloud originals when needed.
      preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
      shouldDownloadFromNetwork: true,
    }),
  );
  if (r.canceled || !r.assets?.length) return null;
  const a = r.assets[0];
  const type = a.mimeType ?? "image/jpeg";
  return {
    file: { uri: a.uri, name: a.fileName ?? `bill-${Date.now()}.${extFor(type)}`, type },
    preview: { uri: a.uri },
    width: a.width,
    height: a.height,
    source: "library",
  };
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
  return {
    file: { uri: api.sampleUri(sample.key), name: `${sample.key}.jpg`, type: "image/jpeg" },
    preview: sampleSource(sample.key),
    source: "sample",
    label: sample.label,
  };
}
