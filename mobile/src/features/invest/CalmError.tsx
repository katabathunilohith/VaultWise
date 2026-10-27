import { router } from "expo-router";
import { ErrorState } from "@/components/ui";

/**
 * Load failure for the Invest tab: the kit's calm error (no 3D object), saying the investments
 * haven't changed, with a retry and a person to ask.
 */
export function CalmError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <ErrorState
      variant="calm"
      iconSize={40}
      bareIcon
      heading
      error={error}
      onRetry={onRetry}
      footnote="Your investments haven't changed."
      secondaryAction={{ label: "Ask a person", onPress: () => router.push("/support") }}
    />
  );
}
