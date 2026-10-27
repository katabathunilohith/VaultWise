import { Platform, type ImageSourcePropType } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { api } from "@/lib/api/client";
import { sampleSource } from "@/lib/api/samples";
import type { Sample, UploadFile } from "@/lib/api/types";
import { withSystemUi } from "@/lib/auth/app-lock";

/**
 * Photos to upload (bills, receipts): the system photo picker, the system camera, or a practice
 * sample, all in one upload shape. The picker and the camera are system UI, so the app lock waits
 * for them (withSystemUi).
 */

/** A photo ready to send, with what to show before sending it. */
export interface PickedImage {
  file: UploadFile;
  preview: ImageSourcePropType;
  width?: number;
  height?: number;
}

export type PickFailure =
  | { ok: false; reason: "cancelled" | "denied" }
  /** The picker or the camera couldn't open; `error` says why. */
  | { ok: false; reason: "unavailable"; error: unknown };

export type PickResult = { ok: true; image: PickedImage } | PickFailure;

/** One photo, as JPEG rather than HEIC so the server can read it, fetching iCloud originals when needed (iOS). */
const LIBRARY: ImagePicker.ImagePickerOptions = {
  mediaTypes: ["images"],
  quality: 0.85,
  allowsEditing: false,
  allowsMultipleSelection: false,
  preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
  shouldDownloadFromNetwork: true,
};

const CAMERA: ImagePicker.ImagePickerOptions = { mediaTypes: ["images"], quality: 0.8 };

function extFor(mime: string | null | undefined) {
  const sub = mime?.split("/")[1]?.toLowerCase();
  if (!sub) return "jpg";
  return sub === "jpeg" ? "jpg" : sub;
}

/** The first asset, named `<name>-<time>.<ext>` when the system gives no file name. */
function fromResult(r: ImagePicker.ImagePickerResult, name: string): PickResult {
  if (r.canceled || !r.assets?.length) return { ok: false, reason: "cancelled" };
  const a = r.assets[0];
  const type = a.mimeType ?? "image/jpeg";
  return {
    ok: true,
    image: {
      file: { uri: a.uri, name: a.fileName ?? `${name}-${Date.now()}.${extFor(type)}`, type },
      preview: { uri: a.uri },
      width: a.width,
      height: a.height,
    },
  };
}

/** The system photo picker (no photo-library permission needed to pick one image). */
export function pickImage(name: string): Promise<PickResult> {
  return withSystemUi(async (): Promise<PickResult> => {
    try {
      return fromResult(await ImagePicker.launchImageLibraryAsync(LIBRARY), name);
    } catch (error) {
      return { ok: false, reason: "unavailable", error };
    }
  });
}

/** The system camera, after the camera permission prompt (none on web). */
export function takePhoto(name: string): Promise<PickResult> {
  return withSystemUi(async (): Promise<PickResult> => {
    try {
      if (Platform.OS !== "web") {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) return { ok: false, reason: "denied" };
      }
      return fromResult(await ImagePicker.launchCameraAsync(CAMERA), name);
    } catch (error) {
      return { ok: false, reason: "unavailable", error };
    }
  });
}

/**
 * A practice sample. The file name carries the sample key, so Practice checks it like live (the
 * simulator reads only the name; api.sampleUri is the bare key there). Live, the server's copy is
 * uploaded by URL (the web client fetches it into a Blob, native passes the URI to FormData).
 */
export function sampleUpload(sample: Sample): PickedImage {
  return {
    file: { uri: api.sampleUri(sample.key), name: `${sample.key}.jpg`, type: "image/jpeg" },
    preview: sampleSource(sample.key),
  };
}
