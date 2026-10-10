import { useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useConnection, useVaults } from "@/lib/api/hooks";
import { giveAiConsent, useSession } from "@/lib/session";
import { layout, space, useTheme } from "@/theme";
import { AssistantHeader } from "./components/AssistantHeader";
import { ConsentCard, SuggestionChips, TalkToPersonLink } from "./components/BottomBits";
import { Composer } from "./components/Composer";
import { IntroMessage, MessageItem } from "./components/Messages";
import { ReportSheet } from "./components/ReportSheet";
import { ToneDial } from "./components/ToneDial";
import { setHandoff } from "./handoff";
import { useTone } from "./tone";
import { useChat, type AssistantMessage } from "./useChat";
import { useKeyboardVisible } from "./useKeyboardVisible";

/** How close to the end (pt) still counts as "reading the latest", so new text keeps it in view. */
const STICK_TO_END = 80;
/** At the largest text sizes the consent card can outgrow the screen; past this share it scrolls. */
const CONSENT_MAX_SHARE = 0.6;

/**
 * Vaultwise AI (full-screen modal). Header: Close · "Vaultwise AI" + AI label · New chat.
 * Tone dial under the header; messages newest at the bottom; suggested prompts, then the
 * composer, sitting on top of the keyboard. Consent comes first, inline where the composer goes.
 */
export function AssistantScreen() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const session = useSession();
  const { mode } = useConnection();
  const vaults = useVaults();
  const consented = session.aiConsent;
  const chat = useChat(vaults.data?.vaults, consented);
  const [tone, setTone] = useTone();
  const [draft, setDraft] = useState("");
  const [reporting, setReporting] = useState<AssistantMessage | null>(null);
  const keyboard = useKeyboardVisible();
  const list = useRef<ScrollView>(null);
  const atEnd = useRef(true);

  const close = () => (router.canGoBack() ? router.back() : router.replace("/"));

  const send = (text: string) => {
    if (!text.trim() || chat.streaming) return;
    atEnd.current = true;
    chat.send(text, tone);
    setDraft("");
  };

  const askPerson = () => {
    setHandoff({ topic: chat.person.topic, question: chat.person.question });
    router.push(chat.person.topic ? { pathname: "/support", params: { topic: chat.person.topic } } : "/support");
  };

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    atEnd.current = contentOffset.y + layoutMeasurement.height >= contentSize.height - STICK_TO_END;
  };

  const followEnd = () => {
    if (atEnd.current) list.current?.scrollToEnd({ animated: !chat.streaming });
  };

  return (
    <View style={[styles.fill, { backgroundColor: c.bg }]}>
      <AssistantHeader onClose={close} onNewChat={chat.reset} canReset={chat.messages.length > 0} />
      <ToneDial value={tone} onChange={setTone} />
      <KeyboardAvoidingView
        // Padding is the keyboard's overlap with this view, so it's also right on Android
        // edge-to-edge (0 when the window resizes instead).
        behavior="padding"
        style={styles.fill}
      >
        <ScrollView
          ref={list}
          style={styles.fill}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
          onScroll={onScroll}
          scrollEventThrottle={64}
          onContentSizeChange={followEnd}
          onLayout={followEnd}
        >
          <IntroMessage />
          {chat.messages.map((m) => (
            <MessageItem key={m.id} message={m} onRetry={chat.retry} onReport={setReporting} onAskPerson={askPerson} />
          ))}
        </ScrollView>

        <View style={[styles.bottom, { paddingBottom: (keyboard ? 0 : insets.bottom) + space.xs }]}>
          {chat.person.visible ? (
            <View style={styles.inset}>
              <TalkToPersonLink onPress={askPerson} />
            </View>
          ) : null}
          {consented ? (
            <>
              {draft.length === 0 ? <SuggestionChips onPick={send} disabled={chat.streaming} /> : null}
              <View style={styles.inset}>
                <Composer value={draft} onChange={setDraft} onSend={() => send(draft)} busy={chat.streaming} />
              </View>
            </>
          ) : (
            <ScrollView style={{ maxHeight: windowHeight * CONSENT_MAX_SHARE }} contentContainerStyle={styles.inset} bounces={false}>
              <ConsentCard onAgree={() => void giveAiConsent()} onDecline={close} demo={mode === "demo"} />
            </ScrollView>
          )}
        </View>
      </KeyboardAvoidingView>

      <ReportSheet target={reporting} onClose={() => setReporting(null)} onReported={chat.markReported} />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  list: {
    paddingHorizontal: layout.gutter,
    paddingTop: space.xs,
    paddingBottom: space.md,
    gap: space.md,
    maxWidth: layout.maxContentWidth,
    width: "100%",
    alignSelf: "center",
  },
  bottom: { gap: space.xs, paddingTop: space.xs },
  inset: { paddingHorizontal: layout.gutter, maxWidth: layout.maxContentWidth, width: "100%", alignSelf: "center" },
});
