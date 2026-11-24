import { StyleSheet, View } from "react-native";
import { router, type Href } from "expo-router";
import { PhoneIcon } from "@/components/icons";
import { Button, Txt } from "@/components/ui";
import { StepScreen } from "@/features/account/layout";
import { space, useTheme } from "@/theme";
import { VERIFY_PHONE_ROUTE } from "./config";

/**
 * Shown by a flow that texts a code to the verified number when there isn't one yet (or the server
 * answered `phone_required`). Adding it opens Add your phone number; the flow carries on when the
 * person comes back, because /me then says the number is verified.
 */
export function PhoneNeededScreen({ title, body, close }: { title: string; body: string; close: () => void }) {
  const { c } = useTheme();
  return (
    <StepScreen
      close={close}
      footer={
        <>
          <Button label="Add your phone number" armOnMount onPress={() => router.push(VERIFY_PHONE_ROUTE as Href)} />
          <Button label="Not now" variant="tonal" size="md" onPress={close} />
        </>
      }
    >
      <View style={styles.wrap}>
        <View style={[styles.disc, { backgroundColor: c.surfaceRaised }]}>
          <PhoneIcon size={32} color={c.text} />
        </View>
        <Txt v="headline" align="center" accessibilityRole="header">
          {title}
        </Txt>
        <Txt v="bodyL" color="textMuted" align="center">
          {body}
        </Txt>
      </View>
    </StepScreen>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", gap: space.sm, paddingTop: space.xxl },
  disc: { width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center" },
});
