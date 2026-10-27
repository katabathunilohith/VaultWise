import { ErrorState } from "@/components/ui";

/** Error state for money-out and verification screens, which must not show 3D objects (DESIGN.md §2). */
export function CalmError({ error, onRetry, title }: { error: unknown; onRetry?: () => void; title?: string }) {
  return <ErrorState variant="calm" error={error} onRetry={onRetry} title={title} />;
}
