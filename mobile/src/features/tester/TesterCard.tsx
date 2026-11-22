import { StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { CaretRightIcon, CheckCircleIcon } from "@/components/icons";
import { Button, Card, Press, Txt } from "@/components/ui";
import { radius, space, useTheme } from "@/theme";
import { TESTER_ENABLED } from "./config";
import { FEEDBACK_HREF, TASKS } from "./model";
import { setSharing, useTester, type TaskId } from "./state";
import { track } from "./track";

/** The test on Home: asks to share activity, then gives people three things to try and a feedback form. */
export function TesterCard() {
  const t = useTester();
  if (!TESTER_ENABLED || !t.ready) return null;
  if (t.sharing === null) return <AskToShare />;
  return (
    <Card style={styles.card}>
      {t.feedbackSent ? <Thanks /> : <Tasks done={t.done} />}
      <Press onPress={() => setSharing(!t.sharing)} hitSlop={10} accessibilityRole="button" style={styles.link}>
        <Txt v="caption" color="textMuted">
          {t.sharing ? "Stop sharing my activity" : "Share my activity"}
        </Txt>
      </Press>
    </Card>
  );
}

function AskToShare() {
  const yes = () => {
    setSharing(true);
    track("test_started");
  };
  return (
    <Card style={styles.card}>
      <Txt v="titleM" accessibilityRole="header">
        Help test Vaultwise
      </Txt>
      <Txt v="bodyM">
        This is a student project, and everything here is pretend money on a sample account. Can we record which screens you open and which steps you
        finish? It goes to PostHog, an analytics service, with a random ID. We don’t record your name or anything you type.
      </Txt>
      <Txt v="caption" color="textMuted">
        For people aged 18 and over. You can stop at any time.
      </Txt>
      <Button label="Yes, share" size="md" armOnMount onPress={yes} />
      <Button label="No thanks" size="md" variant="tonal" onPress={() => setSharing(false)} />
    </Card>
  );
}

function Tasks({ done }: { done: TaskId[] }) {
  const finished = done.length === TASKS.length;
  return (
    <>
      <Txt v="titleM" accessibilityRole="header">
        {finished ? "All done. What did you think?" : "3 things to try"}
      </Txt>
      {TASKS.map((task) => (
        <TaskRow key={task.id} label={task.label} done={done.includes(task.id)} onPress={() => router.push(task.href)} />
      ))}
      <Button label="Give feedback" size="md" variant={finished ? "primary" : "tonal"} onPress={() => router.push(FEEDBACK_HREF)} />
    </>
  );
}

function TaskRow({ label, done, onPress }: { label: string; done: boolean; onPress: () => void }) {
  const { c } = useTheme();
  return (
    <Press onPress={onPress} accessibilityRole="button" accessibilityLabel={`${label}. ${done ? "Done" : "Not done yet"}`} style={styles.task}>
      {done ? <CheckCircleIcon size={24} color={c.accent} weight="fill" /> : <View style={[styles.ring, { borderColor: c.textMuted }]} />}
      <Txt v="bodyM" style={styles.flex}>
        {label}
      </Txt>
      <CaretRightIcon size={16} color={c.textMuted} />
    </Press>
  );
}

function Thanks() {
  return (
    <>
      <Txt v="titleM" accessibilityRole="header">
        Thanks for testing
      </Txt>
      <Txt v="bodyM" color="textMuted">
        Your feedback was sent. Keep exploring as long as you like.
      </Txt>
    </>
  );
}

const styles = StyleSheet.create({
  card: { gap: space.sm },
  flex: { flex: 1 },
  task: { flexDirection: "row", alignItems: "center", gap: space.sm, minHeight: 44 },
  ring: { width: 22, height: 22, marginHorizontal: 1, borderRadius: radius.pill, borderWidth: 2 },
  link: { alignSelf: "center", paddingVertical: space.xs },
});
