import { useState, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { PlusIcon, XIcon } from "@/components/icons";
import { Banner, Press, Segmented, Stack, TextField, Txt } from "@/components/ui";
import { layout, radius, space, useTheme } from "@/theme";
import { addUse, LIMITS, removeUse, USE_IDEAS, type OwnRuleDraft } from "./model";
import type { OwnRuleState, RuleSource } from "./useOwnRule";

const SOURCES: { value: RuleSource; label: string }[] = [
  { value: "own", label: "Write my own" },
  { value: "template", label: "Borrow a category's" },
];

/**
 * "Which rules should it follow?" for a custom vault: write your own rule, or borrow a category's
 * (the `templatePicker` the new-vault flow already has).
 */
export function OwnRuleChooser({ state, templatePicker }: { state: OwnRuleState; templatePicker: ReactNode }) {
  return (
    <Stack gap={space.sm}>
      <Txt v="titleM" accessibilityRole="header">
        Which rules should it follow?
      </Txt>
      <Segmented value={state.source} options={SOURCES} onChange={state.setSource} />
      {state.source === "own" ? <OwnRuleEditor draft={state.draft} onChange={state.setDraft} /> : templatePicker}
    </Stack>
  );
}

function OwnRuleEditor({ draft, onChange }: { draft: OwnRuleDraft; onChange: (d: OwnRuleDraft) => void }) {
  const [text, setText] = useState("");
  const full = draft.uses.length >= LIMITS.maxUses;
  const add = (value: string) => {
    const next = addUse(draft, value);
    if (next !== draft) onChange(next);
    setText("");
  };
  const ideas = USE_IDEAS.filter((i) => !draft.uses.some((u) => u.toLowerCase() === i.toLowerCase()));

  return (
    <Stack gap={space.md}>
      <Txt v="bodyM" color="textMuted">
        Say what this money can pay for, and what proof you&apos;ll show to take it out.
      </Txt>

      <View style={{ gap: space.xs }}>
        <Txt v="labelL">It can pay for</Txt>
        {draft.uses.length ? (
          <View style={styles.wrap} accessibilityLabel="Things it can pay for">
            {draft.uses.map((u) => (
              <UsePill key={u} label={u} onRemove={() => onChange(removeUse(draft, u))} />
            ))}
          </View>
        ) : null}
        {full ? (
          <Txt v="caption" color="textMuted">
            That&apos;s the most it can list. Remove one to add another.
          </Txt>
        ) : (
          <>
            <View style={styles.addRow}>
              <View style={{ flex: 1 }}>
                <TextField
                  label="Add something"
                  value={text}
                  onChangeText={setText}
                  placeholder="For example, wedding venue"
                  maxLength={LIMITS.useMax}
                  returnKeyType="done"
                  blurOnSubmit={false}
                  onSubmitEditing={() => add(text)}
                />
              </View>
              <Press
                accessibilityRole="button"
                accessibilityLabel="Add"
                onPress={() => add(text)}
                disabled={text.trim().length < LIMITS.useMin}
                style={styles.addBtn}
              >
                <AddIcon dim={text.trim().length < LIMITS.useMin} />
              </Press>
            </View>
            {ideas.length ? (
              <View style={styles.wrap}>
                {ideas.slice(0, 4).map((idea) => (
                  <IdeaPill key={idea} label={idea} onPress={() => add(idea)} />
                ))}
              </View>
            ) : null}
          </>
        )}
      </View>

      <TextField
        label="Proof you'll show"
        value={draft.proof}
        onChangeText={(proof) => onChange({ ...draft, proof })}
        placeholder="An invoice or booking confirmation"
        maxLength={LIMITS.proofMax}
        returnKeyType="done"
      />

      <Banner
        tone="info"
        title="A person checks it"
        body="Every withdrawal from this vault is checked by a person against your rule. That keeps the lock honest, even from you."
      />
    </Stack>
  );
}

function AddIcon({ dim }: { dim: boolean }) {
  const { c } = useTheme();
  return (
    <View style={[styles.addCircle, { backgroundColor: dim ? c.surfaceRaised : c.accentFill }]}>
      <PlusIcon size={22} color={dim ? c.textMuted : c.onAccentFill} weight="bold" />
    </View>
  );
}

function UsePill({ label, onRemove }: { label: string; onRemove: () => void }) {
  const { c } = useTheme();
  return (
    <Press
      accessibilityRole="button"
      accessibilityLabel={`Remove ${label}`}
      onPress={onRemove}
      hitSlop={4}
      style={[styles.pill, { backgroundColor: c.accentSoft, borderColor: c.accentSoft }]}
    >
      <Txt v="labelM" numberOfLines={1} style={{ flexShrink: 1 }}>
        {label}
      </Txt>
      <XIcon size={14} color={c.text} weight="bold" />
    </Press>
  );
}

function IdeaPill({ label, onPress }: { label: string; onPress: () => void }) {
  const { c } = useTheme();
  return (
    <Press
      accessibilityRole="button"
      accessibilityLabel={`Add ${label}`}
      hapticOnPressIn="select.tick"
      onPress={onPress}
      hitSlop={4}
      style={[styles.pill, { backgroundColor: c.surface, borderColor: c.border }]}
    >
      <PlusIcon size={14} color={c.textMuted} weight="bold" />
      <Txt v="labelM" color="textMuted">
        {label}
      </Txt>
    </Press>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: space.xs },
  addRow: { flexDirection: "row", alignItems: "flex-end", gap: space.xs },
  addBtn: { width: layout.hit + 12, height: 56, alignItems: "center", justifyContent: "center" },
  addCircle: { width: layout.hit, height: layout.hit, borderRadius: layout.hit / 2, alignItems: "center", justifyContent: "center" },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 36,
    maxWidth: "100%",
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
});
