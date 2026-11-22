import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { Banner, Button, Chip, ModalScreen, TextField, Txt } from "@/components/ui";
import { haptic } from "@/lib/haptics";
import { space } from "@/theme";
import { SUS_STATEMENTS, susScore, type WouldLock } from "./model";
import { markFeedbackSent } from "./state";
import { sendFeedback } from "./track";

const SCALE = [1, 2, 3, 4, 5];
const WOULD_LOCK: { value: WouldLock; label: string }[] = [
  { value: "yes", label: "Yes" },
  { value: "maybe", label: "Maybe" },
  { value: "no", label: "No" },
];

/** A short usability score (SUS) plus the question the idea depends on: would people lock real money? */
export function FeedbackScreen() {
  const [answers, setAnswers] = useState<(number | undefined)[]>(() => SUS_STATEMENTS.map(() => undefined));
  const [wouldLock, setWouldLock] = useState<WouldLock | null>(null);
  const [comment, setComment] = useState("");
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const close = () => (router.canGoBack() ? router.back() : router.replace("/"));
  const answer = (index: number, value: number) => setAnswers((all) => all.map((a, i) => (i === index ? value : a)));

  const send = async () => {
    const scores = answers.filter((a): a is number => a !== undefined);
    if (scores.length < SUS_STATEMENTS.length || !wouldLock) {
      haptic("error");
      setProblem("Please answer every question. Only the last box is optional.");
      return;
    }
    setProblem(null);
    setSending(true);
    const properties: Record<string, string | number> = { sus_score: susScore(scores), would_lock: wouldLock };
    scores.forEach((a, i) => {
      properties[`sus_${i + 1}`] = a;
    });
    if (comment.trim()) properties.comment = comment.trim().slice(0, 1000);
    const delivered = await sendFeedback(properties);
    setSending(false);
    if (!delivered) {
      haptic("error");
      setProblem("That didn't send. Check your connection and try again.");
      return;
    }
    markFeedbackSent();
    close();
  };

  return (
    <ModalScreen title="Your feedback" onClose={close} footer={<Button label="Send feedback" loading={sending} onPress={() => void send()} />}>
      <Txt v="bodyM" color="textMuted">
        This takes about 2 minutes. Your answers go to the Vaultwise team through PostHog, with a random ID. For each statement, choose 1 for strongly
        disagree, up to 5 for strongly agree.
      </Txt>
      {SUS_STATEMENTS.map((statement, index) => (
        <View key={statement} style={styles.question} accessibilityRole="radiogroup" accessibilityLabel={statement}>
          <Txt v="bodyM">
            {index + 1}. {statement}
          </Txt>
          <View style={styles.scale}>
            {SCALE.map((value) => (
              <View key={value} style={styles.flex}>
                <Chip label={String(value)} selected={answers[index] === value} onPress={() => answer(index, value)} />
              </View>
            ))}
          </View>
        </View>
      ))}
      <View style={styles.question} accessibilityRole="radiogroup" accessibilityLabel="Would you lock your own money in a vault and show a bill to take it out?">
        <Txt v="titleM">Would you lock your own money in a vault and show a bill to take it out?</Txt>
        <View style={styles.scale}>
          {WOULD_LOCK.map((option) => (
            <View key={option.value} style={styles.flex}>
              <Chip label={option.label} selected={wouldLock === option.value} onPress={() => setWouldLock(option.value)} />
            </View>
          ))}
        </View>
      </View>
      <TextField
        label="Anything else? (optional)"
        hint="Please leave out names and other personal details."
        value={comment}
        onChangeText={setComment}
        multiline
        maxLength={1000}
      />
      {problem ? <Banner tone="warning" title="Not sent yet" body={problem} /> : null}
    </ModalScreen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  question: { gap: space.xs },
  scale: { flexDirection: "row", gap: space.xs },
});
