import { useMemo, useState } from "react";
import { FlatList, Modal, Platform, StyleSheet, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CaretDownIcon, CheckIcon, GlobeIcon, MagnifyingGlassIcon } from "@/components/icons";
import { Divider, Press, Txt } from "@/components/ui";
import type { Country } from "@/lib/api/types";
import { fonts, layout, radius, space, useTheme } from "@/theme";
import { FieldError } from "../controls";
import { HeaderButton } from "../layout";

/** "France · Euro area rules · EUR" — what choosing this country means for the account. */
export function countryDetail(c: Country) {
  const market = c.marketName && c.marketName !== c.name ? `${c.marketName} rules` : `${c.name} rules`;
  return `${market} · ${c.currency}`;
}

/** The selected country as a tappable field; opens a searchable list in a modal. */
export function CountryField({
  countries,
  value,
  onChange,
  hint,
  error,
}: {
  countries: Country[];
  value: string | null;
  onChange: (code: string) => void;
  hint?: string | null;
  error?: string | null;
}) {
  const { c } = useTheme();
  const [open, setOpen] = useState(false);
  const selected = countries.find((x) => x.code === value) ?? null;
  return (
    <View style={styles.wrap}>
      <Txt v="labelM">Country you live in</Txt>
      <Press
        accessibilityLabel={selected ? `Country: ${selected.name}. Change` : "Choose your country"}
        accessibilityHint="Opens the list of countries"
        onPress={() => setOpen(true)}
        scaleTo={0.99}
        style={[styles.field, { backgroundColor: c.surface, borderColor: error ? c.danger : c.border }]}
      >
        {selected ? (
          <Txt v="titleM" accessibilityElementsHidden importantForAccessibility="no">
            {selected.flag}
          </Txt>
        ) : (
          <GlobeIcon size={22} color={c.textMuted} />
        )}
        <View style={{ flex: 1 }}>
          <Txt v="labelL" color={selected ? "text" : "textMuted"}>
            {selected ? selected.name : "Choose your country"}
          </Txt>
          {selected ? (
            <Txt v="caption" color="textMuted">
              {countryDetail(selected)}
            </Txt>
          ) : null}
        </View>
        <CaretDownIcon size={18} color={c.textMuted} />
      </Press>
      {error ? (
        <FieldError text={error} />
      ) : hint ? (
        <Txt v="caption" color="textMuted">
          {hint}
        </Txt>
      ) : null}
      <CountryModal
        visible={open}
        countries={countries}
        value={value}
        onClose={() => setOpen(false)}
        onPick={(code) => {
          onChange(code);
          setOpen(false);
        }}
      />
    </View>
  );
}

function CountryModal({
  visible,
  countries,
  value,
  onClose,
  onPick,
}: {
  visible: boolean;
  countries: Country[];
  value: string | null;
  onClose: () => void;
  onPick: (code: string) => void;
}) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState("");
  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    const sorted = [...countries].sort((a, b) => a.name.localeCompare(b.name));
    if (!q) return sorted;
    return sorted.filter((x) => x.name.toLowerCase().includes(q) || x.code.toLowerCase() === q || x.marketName.toLowerCase().includes(q));
  }, [countries, query]);
  const sheet = Platform.OS === "ios";
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle={sheet ? "pageSheet" : "fullScreen"}
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
      // A swipe-down on the iOS sheet closes it natively; keep our state in step.
      onDismiss={onClose}
    >
      <View style={[styles.modal, { backgroundColor: c.bg, paddingTop: sheet ? space.md : insets.top + space.xs }]}>
        <View style={styles.modalHeader}>
          <HeaderButton kind="close" onPress={onClose} />
          <Txt v="titleM" accessibilityRole="header" style={{ flex: 1 }} align="center">
            Choose your country
          </Txt>
          <View style={{ width: layout.hit }} />
        </View>
        <View style={[styles.search, { backgroundColor: c.surface, borderColor: c.border }]}>
          <MagnifyingGlassIcon size={20} color={c.textMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search"
            placeholderTextColor={c.textMuted}
            accessibilityLabel="Search countries"
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
            selectionColor={c.accent}
            style={[styles.searchInput, { color: c.text }]}
          />
        </View>
        <FlatList
          data={list}
          keyExtractor={(x) => x.code}
          keyboardShouldPersistTaps="handled"
          ItemSeparatorComponent={Divider}
          contentContainerStyle={{ paddingHorizontal: layout.gutter, paddingBottom: insets.bottom + space.xl }}
          ListEmptyComponent={
            <Txt v="bodyM" color="textMuted" align="center" style={{ paddingVertical: space.xl }}>
              {query.trim() ? `No supported country matches “${query.trim()}”.` : "No countries to show yet. Close this and try again in a moment."}
            </Txt>
          }
          renderItem={({ item }) => {
            const on = item.code === value;
            return (
              <Press
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                accessibilityLabel={`${item.name}. ${countryDetail(item)}`}
                hapticOnPressIn={on ? null : "select.tick"}
                onPress={() => onPick(item.code)}
                scaleTo={0.99}
                style={styles.option}
              >
                <Txt v="titleM" accessibilityElementsHidden importantForAccessibility="no">
                  {item.flag}
                </Txt>
                <View style={{ flex: 1 }}>
                  <Txt v="labelL">{item.name}</Txt>
                  <Txt v="caption" color="textMuted">
                    {countryDetail(item)}
                  </Txt>
                </View>
                {on ? <CheckIcon size={20} color={c.accent} weight="bold" /> : null}
              </Press>
            );
          }}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  field: {
    minHeight: layout.rowMin,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth * 2,
    paddingHorizontal: 16,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  modal: { flex: 1, gap: space.sm },
  modalHeader: { flexDirection: "row", alignItems: "center", paddingHorizontal: layout.gutter, gap: 8 },
  search: {
    marginHorizontal: layout.gutter,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth * 2,
    paddingHorizontal: 14,
    minHeight: 48,
  },
  searchInput: { flex: 1, fontFamily: fonts.body, fontSize: 17, minHeight: 44 },
  option: { minHeight: layout.rowMin, flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 10 },
});
