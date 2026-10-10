import { memo } from "react";
import { StyleSheet, View } from "react-native";
import { CheckIcon, FlagIcon, RobotIcon, WarningCircleIcon } from "@/components/icons";
import { Button, PracticeBadge, Press, Skeleton, Txt } from "@/components/ui";
import { layout, radius, space, useTheme } from "@/theme";
import { stripEmoji } from "../tone";
import type { AssistantMessage, ChatMessage } from "../useChat";
import { MoneyActionCard } from "./MoneyActionCard";
import { RichText } from "./RichText";

/** The assistant's first message: says it's AI, what it can do, and what it can't. */
export function IntroMessage() {
  const { c } = useTheme();
  return (
    <View style={styles.intro}>
      <PracticeBadge />
      <View style={styles.assistantCol}>
        <View style={styles.byline}>
          <RobotIcon size={16} color={c.textMuted} />
          <Txt v="caption" color="textMuted">
            Vaultwise AI · AI assistant
          </Txt>
        </View>
        <View style={[styles.bubble, styles.assistantBubble, { backgroundColor: c.surface, borderColor: c.border }]}>
          <Txt v="bodyL">
            I&apos;m Vaultwise AI, an AI assistant, not a person. Ask me about your vaults, proofs or emergency money. I can&apos;t move money, and I can
            get things wrong.
          </Txt>
        </View>
      </View>
    </View>
  );
}

interface ItemProps {
  message: ChatMessage;
  onRetry: (id: string) => void;
  onReport: (m: AssistantMessage) => void;
  onAskPerson: () => void;
}

export const MessageItem = memo(function MessageItem({ message, onRetry, onReport, onAskPerson }: ItemProps) {
  const { c } = useTheme();
  if (message.role === "user")
    return (
      <View
        style={[styles.bubble, styles.userBubble, { backgroundColor: c.accentFill }]}
        accessible
        accessibilityLabel={`You: ${message.text}`}
      >
        <Txt v="bodyL" color="onAccentFill">
          {message.text}
        </Txt>
      </View>
    );
  return <AssistantReply message={message} onRetry={onRetry} onReport={onReport} onAskPerson={onAskPerson} />;
});

function AssistantReply({
  message: m,
  onRetry,
  onReport,
  onAskPerson,
}: {
  message: AssistantMessage;
  onRetry: (id: string) => void;
  onReport: (m: AssistantMessage) => void;
  onAskPerson: () => void;
}) {
  const { c } = useTheme();
  const text = m.tone === "straight" ? stripEmoji(m.text) : m.text;
  const waiting = m.status === "streaming" && !text;
  return (
    <View style={styles.assistantCol}>
      {waiting ? (
        <View
          style={[styles.bubble, styles.assistantBubble, styles.waiting, { backgroundColor: c.surface, borderColor: c.border }]}
          accessible
          accessibilityLabel="Vaultwise AI is writing a reply"
        >
          <Skeleton height={12} width={160} />
          <Skeleton height={12} width={110} />
        </View>
      ) : text ? (
        <View
          style={[styles.bubble, styles.assistantBubble, { backgroundColor: c.surface, borderColor: c.border }]}
          accessible={m.status === "done"}
          accessibilityLabel={m.status === "done" ? `Vaultwise AI: ${text}` : undefined}
        >
          <RichText text={text} color={c.text} />
        </View>
      ) : null}

      {m.status === "error" ? (
        <View style={[styles.error, { backgroundColor: c.dangerSoft }]} accessibilityRole="alert">
          <View style={styles.errorHead}>
            <WarningCircleIcon size={20} color={c.danger} weight="fill" />
            <Txt v="labelM" color="danger" style={styles.flex}>
              {text ? "This reply didn't finish." : "That reply didn't come through."}
            </Txt>
          </View>
          {m.error ? (
            <Txt v="bodyM" color="text">
              {m.error}
            </Txt>
          ) : null}
          <View style={styles.errorActions}>
            <Button label="Try again" variant="tonal" size="sm" onPress={() => onRetry(m.id)} />
            <Button label="Ask a person" variant="ghost" size="sm" onPress={onAskPerson} />
          </View>
        </View>
      ) : null}

      {m.status === "done" ? (
        <View style={styles.meta}>
          {m.reported ? (
            <View style={styles.metaAction} accessible accessibilityLabel="Reported">
              <CheckIcon size={16} color={c.textMuted} weight="bold" />
              <Txt v="caption" color="textMuted">
                Reported
              </Txt>
            </View>
          ) : (
            <Press
              accessibilityLabel="Report this reply"
              onPress={() => onReport(m)}
              hitSlop={6}
              style={styles.metaAction}
            >
              <FlagIcon size={16} color={c.textMuted} />
              <Txt v="caption" color="textMuted">
                Report
              </Txt>
            </Press>
          )}
          {m.fellBack ? (
            <Txt v="caption" color="textMuted" style={styles.flex}>
              Straight answer for this one
            </Txt>
          ) : null}
        </View>
      ) : null}

      {m.action ? <MoneyActionCard action={m.action} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  intro: { gap: space.sm },
  byline: { flexDirection: "row", alignItems: "center", gap: 6 },
  bubble: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: radius.lg },
  userBubble: { alignSelf: "flex-end", maxWidth: "85%", borderBottomEndRadius: 6 },
  assistantCol: { alignSelf: "stretch", gap: 6, paddingEnd: "8%" },
  assistantBubble: { alignSelf: "flex-start", borderWidth: StyleSheet.hairlineWidth, borderBottomStartRadius: 6 },
  waiting: { gap: 8, paddingVertical: 14 },
  error: { borderRadius: radius.md, padding: space.sm, gap: space.xs },
  errorHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  errorActions: { flexDirection: "row", flexWrap: "wrap", gap: space.xs },
  meta: { flexDirection: "row", alignItems: "center", gap: space.xs, minHeight: layout.hit },
  metaAction: { flexDirection: "row", alignItems: "center", gap: 4, minHeight: layout.hit, paddingHorizontal: 4 },
});
