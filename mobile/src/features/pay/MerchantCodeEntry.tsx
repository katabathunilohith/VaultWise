import { useState } from "react";
import { Keyboard, StyleSheet, TextInput, View } from "react-native";
import { router } from "expo-router";
import { WarningCircleIcon } from "@/components/icons";
import { Button, Row, Txt } from "@/components/ui";
import { useDemoIntents } from "@/lib/api/hooks";
import { haptic } from "@/lib/haptics";
import { fonts, layout, radius, type, useTheme } from "@/theme";
import { PRACTICE_MERCHANT_CODES, resolveMerchantCode } from "./intent-link";

/** Fallback to scanning: the short code printed under the merchant's QR. */
export function MerchantCodeEntry() {
  const { c } = useTheme();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  // Codes open the merchant's newest checkout, so a code still works after its first bill is paid.
  const intents = useDemoIntents();

  const go = () => {
    const typed = code.trim();
    if (!typed) {
      setError("Type the code the merchant gave you.");
      return;
    }
    const id = resolveMerchantCode(typed, intents.data);
    if (!id) {
      haptic("error");
      setError("That code doesn't match a merchant. Check it with them and try again.");
      return;
    }
    setError(null);
    setCode("");
    Keyboard.dismiss();
    router.push(`/checkout/${id}`);
  };

  return (
    <View style={styles.wrap}>
      <Txt v="titleM" accessibilityRole="header">
        Enter merchant code
      </Txt>
      <Row gap={8}>
        <TextInput
          value={code}
          onChangeText={(t) => {
            setCode(t);
            if (error) setError(null);
          }}
          onSubmitEditing={go}
          placeholder="e.g. CITYGEN"
          placeholderTextColor={c.textMuted}
          autoCapitalize="characters"
          autoCorrect={false}
          autoComplete="off"
          spellCheck={false}
          returnKeyType="go"
          maxLength={80}
          accessibilityLabel="Merchant code"
          accessibilityHint="The code printed under the merchant's QR code"
          maxFontSizeMultiplier={1.4}
          style={[
            styles.input,
            { backgroundColor: c.surface, color: c.text, borderColor: error ? c.danger : c.border },
          ]}
        />
        <Button label="Go" variant="tonal" onPress={go} style={styles.go} accessibilityHint="Opens the checkout for this code" />
      </Row>
      {error ? (
        <Row gap={6} style={styles.top}>
          <WarningCircleIcon size={18} color={c.danger} weight="bold" />
          <Txt v="bodyM" color="danger" style={styles.flex} accessibilityRole="alert">
            {error}
          </Txt>
        </Row>
      ) : (
        <Txt v="caption" color="textMuted">
          Practice codes: {PRACTICE_MERCHANT_CODES.join(", ")}
        </Txt>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  input: {
    flex: 1,
    height: layout.ctaHeight,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth * 2,
    paddingHorizontal: 16,
    fontFamily: fonts.monoMedium,
    fontSize: type.bodyL.fontSize,
    letterSpacing: 1,
  },
  go: { width: 80, borderRadius: radius.md },
  top: { alignItems: "flex-start" },
  flex: { flex: 1 },
});
