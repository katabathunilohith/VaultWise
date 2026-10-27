import { ErrorState } from "@/components/ui";

/** Error state for Pay sections: the kit's calm error (no 3D object), compact, with a bare icon. */
export function CalmError({ title, error, onRetry }: { title: string; error: unknown; onRetry?: () => void }) {
  return <ErrorState variant="calm" compact bareIcon title={title} error={error} onRetry={onRetry} />;
}
