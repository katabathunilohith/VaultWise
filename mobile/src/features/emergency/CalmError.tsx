import { ErrorState } from "@/components/ui";

/** Error state for the emergency area, which must not show 3D objects (DESIGN.md §2). */
export function CalmError({ error, onRetry, title }: { error: unknown; onRetry?: () => void; title?: string }) {
  return <ErrorState variant="calm" error={error} onRetry={onRetry} title={title} />;
}
