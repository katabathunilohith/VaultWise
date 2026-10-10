import { useState } from "react";
import { View } from "react-native";
import { Banner, Button, Card, Txt } from "@/components/ui";
import { api } from "@/lib/api/client";
import { ApiError, errorMessage } from "@/lib/api/errors";
import { haptic } from "@/lib/haptics";
import { useRefreshProof } from "../hooks";
import { Field } from "./Field";

const MIN_CHARS = 5;

/**
 * A note to the person checking the proof. Sending it also asks for a person's review when the
 * automatic check declined it.
 */
export function AppealBox({
  proofId,
  title,
  body,
  sentTitle,
  sentBody,
  onSent,
  autoFocus,
}: {
  proofId: string;
  title: string;
  body?: string;
  sentTitle: string;
  sentBody?: string;
  onSent?: (note: string) => void;
  autoFocus?: boolean;
}) {
  const refresh = useRefreshProof();
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<{ title: string; body: string } | null>(null);
  const [sent, setSent] = useState(false);
  const trimmed = note.trim();
  const tooShort = trimmed.length > 0 && trimmed.length < MIN_CHARS;

  if (sent) return <Banner tone="success" title={sentTitle} body={sentBody} />;

  const send = async () => {
    if (trimmed.length < MIN_CHARS || sending) return;
    setSending(true);
    setError(null);
    try {
      await api.appeal(proofId, trimmed);
      setSent(true);
      onSent?.(trimmed);
      void refresh(proofId);
    } catch (e) {
      haptic("error");
      // The server only takes notes on declined checks; one already with a person answers 409.
      setError(
        e instanceof ApiError && e.status === 409
          ? { title: "This note can't be added here", body: "A person already has this bill. Talk to a person and they'll pass your note on." }
          : { title: "That didn't send", body: errorMessage(e) },
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <Card>
      <Txt v="titleM">{title}</Txt>
      {body ? (
        <Txt v="bodyM" color="textMuted">
          {body}
        </Txt>
      ) : null}
      <Field
        label="Your note"
        value={note}
        onChangeText={setNote}
        placeholder="For example, what the bill was for"
        multiline
        maxLength={500}
        autoFocus={autoFocus}
        hint={tooShort ? `At least ${MIN_CHARS} characters` : null}
        error={tooShort}
      />
      {error ? <Banner tone="danger" title={error.title} body={error.body} /> : null}
      <View style={{ alignItems: "flex-start" }}>
        <Button label="Send note" variant="tonal" size="md" onPress={send} loading={sending} disabled={trimmed.length < MIN_CHARS} />
      </View>
    </Card>
  );
}
