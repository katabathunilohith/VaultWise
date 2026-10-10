import { View } from "react-native";
import { Card, Divider, EmptyState, ListRow, ModalScreen, MoneyText, PracticeBadge, ScreenSkeleton, Txt, VaultGlyph } from "@/components/ui";
import { useVaults } from "@/lib/api/hooks";
import type { Vault } from "@/lib/api/types";
import { money } from "@/lib/money";
import { CalmError } from "../components/CalmError";
import type { StepNav } from "./types";

/** Step 0: which vault pays. Only vaults with money available are offered. */
export function ChooseVaultStep({ nav, onPick }: { nav: StepNav; onPick: (v: Vault) => void }) {
  const q = useVaults();
  const vaults = (q.data?.vaults ?? []).filter((v) => v.available > 0);
  return (
    <ModalScreen title="Withdraw" onClose={nav.onClose} back={nav.onBack}>
      <PracticeBadge />
      <Txt v="headline" accessibilityRole="header">
        Which vault is paying?
      </Txt>
      {q.isPending ? (
        <ScreenSkeleton />
      ) : q.isError ? (
        <CalmError error={q.error} onRetry={() => void q.refetch()} />
      ) : vaults.length === 0 ? (
        <EmptyState title="Nothing to withdraw yet" body="Vaults with money available show up here. Money set aside for a request being checked isn't counted." />
      ) : (
        <Card>
          {vaults.map((v, i) => (
            <View key={v.id}>
              {i > 0 ? <Divider /> : null}
              <ListRow
                title={v.name}
                subtitle="Available"
                leading={<VaultGlyph category={v.category} size={40} />}
                trailing={<MoneyText value={v.available} currency={v.currency} />}
                onPress={() => onPick(v)}
                accessibilityLabel={`${v.name}, ${money(v.available, v.currency)} available`}
              />
            </View>
          ))}
        </Card>
      )}
    </ModalScreen>
  );
}
