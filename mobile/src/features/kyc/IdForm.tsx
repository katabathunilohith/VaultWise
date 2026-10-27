import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Image } from "expo-image";
import { CameraIcon, ImagesIcon, TrashIcon } from "@/components/icons";
import { Button, Txt } from "@/components/ui";
import { FieldError, Group, RadioRow } from "@/features/account/controls";
import { TextField } from "@/features/account/onboarding/TextField";
import { errorMessage } from "@/lib/api/errors";
import { DOC_LABELS, docTypesFor, numberHint, validateIdNumber } from "@/lib/api/identity-ids";
import type { IdDocType, IdSubmission } from "@/lib/api/identity-types";
import { openAppSettings } from "@/lib/auth/app-lock";
import { pickImage, takePhoto, type PickedImage, type PickResult } from "@/lib/media/pick";
import { radius, space, useTheme } from "@/theme";
import { SAMPLE_ID_FILE, SampleIdCard } from "./sample";

/** The photo of the ID: one the person took or chose, or (Practice) the sample card. */
export type IdPhoto = { kind: "photo"; image: PickedImage } | { kind: "sample" };

/** What the person has entered. Lives in the screen's memory only, and is cleared once sent. */
export interface IdFormValue {
  docType: IdDocType | null;
  photo: IdPhoto | null;
  number: string;
}

export const EMPTY_ID_FORM: IdFormValue = { docType: null, photo: null, number: "" };

export interface IdFormErrors {
  docType?: string;
  photo?: string;
  number?: string;
}

/**
 * Checks the form before anything is sent. `photo: "required"` for an ID check or a recovery
 * request; `"either"` for Find my account, where a typed number alone is enough.
 */
export function checkIdForm(v: IdFormValue, { photo, market }: { photo: "required" | "either"; market: string | null }): IdFormErrors {
  const e: IdFormErrors = {};
  if (!v.docType) {
    e.docType = "Choose the type of ID.";
    return e;
  }
  if (v.number.trim()) {
    const check = validateIdNumber(v.docType, v.number, market);
    if (!check.ok) e.number = check.reason;
  }
  if (!v.photo && photo === "required") e.photo = "Add a photo of your ID.";
  if (!v.photo && photo === "either" && !v.number.trim()) e.photo = "Add a photo of your ID, or type its number.";
  return e;
}

/** The request body for an ID: the photo (or the sample's name) and the typed number, if any. */
export function idSubmission(v: IdFormValue): IdSubmission {
  return {
    docType: v.docType!,
    file: v.photo?.kind === "photo" ? v.photo.image.file : v.photo?.kind === "sample" ? SAMPLE_ID_FILE : undefined,
    idNumber: v.number.trim() || undefined,
  };
}

/**
 * Which ID, a photo of it, and (optionally) its number: the form behind Verify your ID, Find my
 * account and a recovery request. Practice adds "Use a sample ID".
 */
export function IdForm({
  value,
  onChange,
  errors,
  market,
  photo,
  practice,
  disabled,
  expandable = false,
}: {
  value: IdFormValue;
  onChange: (next: IdFormValue, changed: keyof IdFormValue) => void;
  errors: IdFormErrors;
  market: string | null;
  photo: "required" | "either";
  practice: boolean;
  disabled?: boolean;
  /** Signed out, the market is only a guess: offer every other type of ID too. */
  expandable?: boolean;
}) {
  const { c } = useTheme();
  const [pickProblem, setPickProblem] = useState<{ text: string; settings: boolean } | null>(null);
  const [showAll, setShowAll] = useState(false);
  const local = docTypesFor(market);
  const every = docTypesFor(null);
  const types = showAll ? [...local, ...every.filter((t) => !local.includes(t))] : local;
  const docType = value.docType;
  const label = docType ? DOC_LABELS[docType] : "ID";

  const take = async (how: "camera" | "library") => {
    setPickProblem(null);
    const r: PickResult = how === "camera" ? await takePhoto("id-photo") : await pickImage("id-photo");
    if (r.ok) return onChange({ ...value, photo: { kind: "photo", image: r.image } }, "photo");
    if (r.reason === "denied") setPickProblem({ text: "Camera access is off. Choose a photo instead, or turn the camera on in Settings.", settings: true });
    else if (r.reason === "unavailable") setPickProblem({ text: errorMessage(r.error, "The photo didn't open. Try again."), settings: false });
  };

  return (
    <View style={{ gap: space.lg }}>
      <View style={{ gap: space.xxs }}>
        <Group title="Which ID?">
          {types.map((t) => (
            <RadioRow key={t} label={DOC_LABELS[t]} selected={docType === t} onPress={() => !disabled && onChange({ ...value, docType: t }, "docType")} />
          ))}
        </Group>
        {errors.docType ? <FieldError text={errors.docType} /> : null}
        {expandable && !showAll && local.length < every.length ? (
          <Button label="Show other types of ID" variant="ghost" size="sm" onPress={() => setShowAll(true)} style={{ alignSelf: "flex-start" }} />
        ) : null}
      </View>

      <View style={{ gap: space.sm }}>
        <Txt v="labelM" accessibilityRole="header">
          {photo === "required" ? `Photo of your ${label}` : `Photo of your ${label} (or type the number below)`}
        </Txt>
        {value.photo ? (
          <View style={{ gap: space.sm }}>
            {value.photo.kind === "sample" ? (
              <SampleIdCard />
            ) : (
              <View style={[styles.preview, { backgroundColor: c.paper, borderColor: c.border }]}>
                <Image
                  source={value.photo.image.preview}
                  style={styles.previewImage}
                  contentFit="contain"
                  accessible
                  accessibilityLabel={`Your photo of your ${label}`}
                />
              </View>
            )}
            <Button
              label="Remove photo"
              icon={TrashIcon}
              variant="tonal"
              size="md"
              disabled={disabled}
              onPress={() => onChange({ ...value, photo: null }, "photo")}
            />
          </View>
        ) : (
          <View style={{ gap: space.xs }}>
            <Button label="Take a photo" icon={CameraIcon} variant="tonal" size="md" disabled={disabled} onPress={() => void take("camera")} />
            <Button label="Choose a photo" icon={ImagesIcon} variant="tonal" size="md" disabled={disabled} onPress={() => void take("library")} />
            {practice ? (
              <Button
                label="Use a sample ID"
                variant="ghost"
                size="md"
                disabled={disabled}
                accessibilityHint="Uses a plain sample card. Practice only."
                onPress={() => onChange({ ...value, photo: { kind: "sample" } }, "photo")}
              />
            ) : null}
            <Txt v="caption" color="textMuted">
              The whole card, flat and in good light, with nothing covering it. The photo is only used to check your ID.
            </Txt>
          </View>
        )}
        {errors.photo ? <FieldError text={errors.photo} /> : null}
        {pickProblem ? (
          <View style={{ gap: 4 }}>
            <FieldError text={pickProblem.text} />
            {pickProblem.settings ? (
              <Button label="Open Settings" variant="ghost" size="sm" onPress={() => void openAppSettings()} style={{ alignSelf: "flex-start" }} />
            ) : null}
          </View>
        ) : null}
      </View>

      {docType ? (
        <TextField
          label={`${label} number (optional)`}
          value={value.number}
          onChangeText={(t) => onChange({ ...value, number: t }, "number")}
          placeholder={docType === "aadhaar" ? "1234 5678 9012" : undefined}
          hint={`${numberHint(docType, market)} Typing it helps if the photo is hard to read. We keep only the last 4 characters.`}
          error={errors.number}
          autoCapitalize="characters"
          autoCorrect={false}
          spellCheck={false}
          autoComplete="off"
          importantForAutofill="no"
          textContentType="none"
          keyboardType={docType === "aadhaar" ? "number-pad" : "default"}
          maxLength={24}
          editable={!disabled}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  preview: { borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, padding: space.xs, alignItems: "center" },
  previewImage: { width: "100%", aspectRatio: 1.6, borderRadius: radius.sm },
});
