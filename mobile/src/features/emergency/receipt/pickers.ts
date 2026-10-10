import { Image, Platform, type ImageSourcePropType } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { sampleSource } from "@/lib/api/samples";
import type { Sample, UploadFile } from "@/lib/api/types";
import { withSystemUi } from "@/lib/session";

export interface Picked {
  file: UploadFile;
  /** What to show on the paper card before sending. */
  preview: ImageSourcePropType;
}

export type PickResult = { ok: true; picked: Picked } | { ok: false; reason: "cancelled" | "denied" | "unavailable" };

function fromAsset(a: ImagePicker.ImagePickerAsset): Picked {
  const name = a.fileName ?? `receipt-${Date.now()}.jpg`;
  return { file: { uri: a.uri, name, type: a.mimeType ?? "image/jpeg" }, preview: { uri: a.uri } };
}

/**
 * The system camera (no in-app viewfinder needed for a single receipt). The permission prompt
 * and the camera are system UI, so the app lock waits for them (withSystemUi).
 */
export function takePhoto(): Promise<PickResult> {
  return withSystemUi(async (): Promise<PickResult> => {
    try {
      if (Platform.OS !== "web") {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) return { ok: false, reason: "denied" };
      }
      const r = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.8 });
      if (r.canceled || !r.assets[0]) return { ok: false, reason: "cancelled" };
      return { ok: true, picked: fromAsset(r.assets[0]) };
    } catch {
      return { ok: false, reason: "unavailable" };
    }
  });
}

/** The system photo picker (no library permission needed). The app lock waits for it. */
export function choosePhoto(): Promise<PickResult> {
  return withSystemUi(async (): Promise<PickResult> => {
    try {
      const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8 });
      if (r.canceled || !r.assets[0]) return { ok: false, reason: "cancelled" };
      return { ok: true, picked: fromAsset(r.assets[0]) };
    } catch {
      return { ok: false, reason: "unavailable" };
    }
  });
}

/** A URI for a sample: the live server's copy, or the bundled asset in Practice demo mode. */
function sourceUri(src: ImageSourcePropType): string {
  if (typeof src === "number") return Image.resolveAssetSource?.(src)?.uri ?? "";
  if (Array.isArray(src)) return src[0]?.uri ?? "";
  return (src as { uri?: string }).uri ?? "";
}

/** A practice sample document. The file name carries the sample key so demo checks behave like live. */
export function pickSample(s: Sample): Picked {
  const preview = sampleSource(s.key);
  return { file: { uri: sourceUri(preview), name: `${s.key}.jpg`, type: "image/jpeg" }, preview };
}
