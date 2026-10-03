"use client";

import clsx from "clsx";
import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { CircleAlert, CircleCheck, CircleX, Info, LoaderCircle, X } from "lucide-react";
import { CATEGORIES, fmtMoney, type VaultCategory } from "@/lib/shared";

export function cx(...a: Parameters<typeof clsx>) {
  return clsx(...a);
}

/* ---------- Layout ---------- */

export function PageHeader({
  title,
  subtitle,
  actions,
  eyebrow,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  eyebrow?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">{eyebrow}</div>}
        <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-[28px]">{title}</h1>
        {subtitle && <p className="mt-1 max-w-2xl text-sm text-ink-2">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Card({
  children,
  className,
  pad = true,
  as: As = "div",
}: {
  children: ReactNode;
  className?: string;
  pad?: boolean;
  as?: "div" | "section";
}) {
  return <As className={cx("rounded-xl border border-line bg-surface shadow-card", pad && "p-5", className)}>{children}</As>;
}

export function CardTitle({ children, sub, action, className }: { children: ReactNode; sub?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cx("mb-4 flex items-start justify-between gap-3", className)}>
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold text-ink">{children}</h2>
        {sub && <p className="mt-0.5 text-[13px] text-muted">{sub}</p>}
      </div>
      {action}
    </div>
  );
}

export function Divider({ className }: { className?: string }) {
  return <div className={cx("h-px bg-line", className)} />;
}

/* ---------- Controls ---------- */

type BtnVariant = "primary" | "secondary" | "ghost" | "danger" | "brand";
const btnBase =
  "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap";
const btnVariants: Record<BtnVariant, string> = {
  primary: "bg-accent text-white hover:bg-accent-hover",
  brand: "bg-brand text-white hover:bg-brand-2 dark:bg-accent dark:hover:bg-accent-hover",
  secondary: "border border-line-strong bg-surface text-ink hover:bg-sunken",
  ghost: "text-ink-2 hover:bg-sunken hover:text-ink",
  danger: "bg-bad text-white hover:opacity-90",
};
const btnSizes = { sm: "h-8 px-3 text-[13px]", md: "h-10 px-4 text-sm", lg: "h-12 px-5 text-[15px]" };

export function Button({
  children,
  variant = "primary",
  size = "md",
  loading,
  className,
  icon,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: keyof typeof btnSizes; loading?: boolean; icon?: ReactNode }) {
  return (
    <button className={cx(btnBase, btnVariants[variant], btnSizes[size], className)} disabled={loading || rest.disabled} {...rest}>
      {loading ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
}

export function LinkButton({
  href,
  children,
  variant = "secondary",
  size = "md",
  className,
  icon,
}: {
  href: string;
  children: ReactNode;
  variant?: BtnVariant;
  size?: keyof typeof btnSizes;
  className?: string;
  icon?: ReactNode;
}) {
  return (
    <Link href={href} className={cx(btnBase, btnVariants[variant], btnSizes[size], className)}>
      {icon}
      {children}
    </Link>
  );
}

/** Gives the control inside a Field an id, so its <label> and hint are associated without extra props. */
const FieldCtx = createContext<{ id: string; hintId: string; hasHint: boolean } | null>(null);

export function Field({
  label,
  hint,
  error,
  children,
  htmlFor,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  children: ReactNode;
  htmlFor?: string;
}) {
  const auto = useId();
  const id = htmlFor ?? auto;
  const hintId = `${id}-hint`;
  return (
    <FieldCtx.Provider value={{ id, hintId, hasHint: !!(error || hint) }}>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={id} className="text-[13px] font-medium text-ink-2">
          {label}
        </label>
        {children}
        {error ? (
          <p id={hintId} className="text-xs text-bad-ink">
            {error}
          </p>
        ) : hint ? (
          <p id={hintId} className="text-xs text-muted">
            {hint}
          </p>
        ) : null}
      </div>
    </FieldCtx.Provider>
  );
}

function useFieldProps(id: string | undefined) {
  const f = useContext(FieldCtx);
  return { id: id ?? f?.id, "aria-describedby": f?.hasHint ? f.hintId : undefined };
}

const inputCls =
  "h-10 w-full rounded-lg border border-line-strong bg-surface px-3 text-sm text-ink placeholder:text-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20";

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const f = useFieldProps(props.id);
  return <input {...f} {...props} id={f.id} className={cx(inputCls, props.className)} />;
}

export function MoneyInput({ currency, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { currency: string }) {
  const symbol = new Intl.NumberFormat("en", { style: "currency", currency }).formatToParts(0).find((p) => p.type === "currency")?.value ?? currency;
  return (
    <div className="relative">
      <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted">{symbol}</span>
      <MoneyField {...props} className={cx(inputCls, "tnum", symbol.length > 1 ? "pl-10" : "pl-7", props.className)} />
    </div>
  );
}

function MoneyField(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const f = useFieldProps(props.id);
  return <input inputMode="decimal" {...f} {...props} id={f.id} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  const f = useFieldProps(props.id);
  return <select {...f} {...props} id={f.id} className={cx(inputCls, "pr-8", props.className)} />;
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const f = useFieldProps(props.id);
  return <textarea {...f} {...props} id={f.id} className={cx(inputCls, "h-auto min-h-[84px] py-2", props.className)} />;
}

export function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx("relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-40", checked ? "bg-accent" : "bg-line-strong")}
    >
      <span
        className={cx(
          "absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-transform",
          checked ? "translate-x-5" : "translate-x-0",
        )}
      />
    </button>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  size = "md",
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode }[];
  size?: "sm" | "md";
}) {
  return (
    <div className="inline-flex rounded-lg border border-line bg-sunken p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cx(
            "rounded-md font-medium transition-colors",
            size === "sm" ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-[13px]",
            value === o.value ? "bg-surface text-ink shadow-card" : "text-ink-2 hover:text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Tabs<T extends string>({
  value,
  onChange,
  tabs,
}: {
  value: T;
  onChange: (v: T) => void;
  tabs: { value: T; label: ReactNode; count?: number }[];
}) {
  return (
    <div className="mb-5 flex gap-1 overflow-x-auto border-b border-line">
      {tabs.map((t) => (
        <button
          key={t.value}
          onClick={() => onChange(t.value)}
          className={cx(
            "-mb-px flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
            value === t.value ? "border-accent text-ink" : "border-transparent text-muted hover:text-ink",
          )}
        >
          {t.label}
          {t.count != null && t.count > 0 && <span className="rounded-full bg-accent-soft px-1.5 text-xs text-accent-ink tnum">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

/* ---------- Display ---------- */

export type Tone = "neutral" | "good" | "warn" | "bad" | "info" | "accent";
const toneCls: Record<Tone, string> = {
  neutral: "bg-sunken text-ink-2 border-line",
  good: "bg-good-soft text-good-ink border-transparent",
  warn: "bg-warn-soft text-warn-ink border-transparent",
  bad: "bg-bad-soft text-bad-ink border-transparent",
  info: "bg-accent-soft text-accent-ink border-transparent",
  accent: "bg-accent text-white border-transparent",
};

export function Badge({ children, tone = "neutral", icon, className }: { children: ReactNode; tone?: Tone; icon?: ReactNode; className?: string }) {
  return (
    <span
      className={cx("inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium", toneCls[tone], className)}
    >
      {icon}
      {children}
    </span>
  );
}

/** Status pill that always pairs color with an icon and a label. */
export function StatusPill({ status, label }: { status: "pass" | "warn" | "fail" | "info" | "pending"; label?: ReactNode }) {
  const map = {
    pass: { tone: "good" as Tone, icon: <CircleCheck className="size-3.5" aria-hidden />, text: "Passed" },
    warn: { tone: "warn" as Tone, icon: <CircleAlert className="size-3.5" aria-hidden />, text: "Check" },
    fail: { tone: "bad" as Tone, icon: <CircleX className="size-3.5" aria-hidden />, text: "Failed" },
    info: { tone: "neutral" as Tone, icon: <Info className="size-3.5" aria-hidden />, text: "Info" },
    pending: { tone: "neutral" as Tone, icon: <LoaderCircle className="size-3.5 animate-spin" aria-hidden />, text: "Pending" },
  }[status];
  return (
    <Badge tone={map.tone} icon={map.icon}>
      {label ?? map.text}
    </Badge>
  );
}

export function StatusIcon({ status, className }: { status: "pass" | "warn" | "fail" | "info"; className?: string }) {
  if (status === "pass") return <CircleCheck className={cx("size-4 shrink-0 text-good", className)} aria-label="passed" />;
  if (status === "warn") return <CircleAlert className={cx("size-4 shrink-0 text-warn", className)} aria-label="needs attention" />;
  if (status === "fail") return <CircleX className={cx("size-4 shrink-0 text-bad", className)} aria-label="failed" />;
  return <Info className={cx("size-4 shrink-0 text-muted", className)} aria-label="info" />;
}

export function Money({
  value,
  currency,
  className,
  compact,
  sign,
  decimals,
}: {
  value: number;
  currency: string;
  className?: string;
  compact?: boolean;
  sign?: boolean;
  decimals?: boolean;
}) {
  return <span className={cx("tnum", className)}>{fmtMoney(value, currency, { compact, sign, decimals })}</span>;
}

export function Stat({ label, value, sub, className }: { label: ReactNode; value: ReactNode; sub?: ReactNode; className?: string }) {
  return (
    <div className={cx("min-w-0", className)}>
      <div className="text-[13px] text-muted">{label}</div>
      <div className="mt-1 truncate text-xl font-semibold text-ink">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted">{sub}</div>}
    </div>
  );
}

export function Progress({
  value,
  color = "var(--accent)",
  className,
  height = 8,
  label,
}: {
  value: number;
  color?: string;
  className?: string;
  height?: number;
  label?: string;
}) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div
      className={cx("w-full overflow-hidden rounded-full", className)}
      style={{ height, background: `color-mix(in srgb, ${color} 16%, transparent)` }}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

export function CategoryDot({ category, size = 10 }: { category: VaultCategory; size?: number }) {
  return (
    <span className="inline-block shrink-0 rounded-full" style={{ width: size, height: size, background: `var(--cat-${category})` }} aria-hidden />
  );
}

export function CategoryBadge({ category }: { category: VaultCategory }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-ink-2">
      <CategoryDot category={category} size={8} />
      {CATEGORIES[category].label}
    </span>
  );
}

export function Empty({ icon, title, body, action }: { icon?: ReactNode; title: ReactNode; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-line-strong px-6 py-10 text-center">
      {icon && <div className="mb-3 text-muted">{icon}</div>}
      <div className="text-sm font-medium text-ink">{title}</div>
      {body && <p className="mt-1 max-w-sm text-[13px] text-muted">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("vw-pulse rounded-lg bg-sunken", className)} />;
}

export function Spinner({ className }: { className?: string }) {
  return <LoaderCircle className={cx("size-4 animate-spin text-muted", className)} aria-label="Loading" />;
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-transparent bg-bad-soft px-3 py-2.5 text-[13px] text-bad-ink" role="alert">
      <CircleX className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div>{children}</div>
    </div>
  );
}

export function Notice({
  tone = "info",
  title,
  children,
  icon,
  action,
}: {
  tone?: "info" | "warn" | "good" | "bad";
  title?: ReactNode;
  children?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
}) {
  const t = {
    info: "bg-accent-soft text-accent-ink",
    warn: "bg-warn-soft text-warn-ink",
    good: "bg-good-soft text-good-ink",
    bad: "bg-bad-soft text-bad-ink",
  }[tone];
  const I =
    icon ??
    (tone === "good" ? <CircleCheck className="size-4" /> : tone === "info" ? <Info className="size-4" /> : <CircleAlert className="size-4" />);
  return (
    <div className={cx("flex items-start gap-3 rounded-lg px-3.5 py-3 text-[13px]", t)}>
      <div className="mt-0.5 shrink-0">{I}</div>
      <div className="min-w-0 flex-1">
        {title && <div className="font-semibold">{title}</div>}
        {children && <div className={cx(title && "mt-0.5", "opacity-90")}>{children}</div>}
      </div>
      {action}
    </div>
  );
}

export function KV({ k, v, className }: { k: ReactNode; v: ReactNode; className?: string }) {
  return (
    <div className={cx("flex items-baseline justify-between gap-4 py-2 text-sm", className)}>
      <span className="text-muted">{k}</span>
      <span className="text-right text-ink">{v}</span>
    </div>
  );
}

/* ---------- Modal ---------- */

export function Modal({
  open,
  onClose,
  title,
  children,
  wide,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  wide?: boolean;
  footer?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-labelledby={id}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className={cx(
        "m-auto max-h-[92vh] w-[calc(100%-24px)] overflow-hidden rounded-2xl border border-line bg-surface p-0 text-ink shadow-pop backdrop:bg-black/40 backdrop:backdrop-blur-[2px]",
        wide ? "max-w-3xl" : "max-w-lg",
      )}
    >
      {open && (
        <div className="flex max-h-[92vh] flex-col">
          <div className="flex items-center justify-between border-b border-line px-5 py-4">
            <h2 id={id} className="text-base font-semibold">
              {title}
            </h2>
            <button onClick={onClose} className="rounded-md p-1 text-muted hover:bg-sunken hover:text-ink" aria-label="Close">
              <X className="size-5" />
            </button>
          </div>
          <div className="overflow-y-auto px-5 py-5">{children}</div>
          {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line bg-surface-2 px-5 py-3">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}

/* ---------- Toasts ---------- */

interface Toast {
  id: number;
  tone: "good" | "bad" | "info";
  text: string;
}
const ToastCtx = createContext<(t: Omit<Toast, "id">) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((t: Omit<Toast, "id">) => {
    const id = Date.now() + Math.random();
    setToasts((x) => [...x, { ...t, id }]);
    setTimeout(() => setToasts((x) => x.filter((y) => y.id !== id)), 4500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-4 z-[100] flex flex-col items-center gap-2 px-4 sm:bottom-6 sm:right-6 sm:left-auto sm:items-end"
        aria-live="polite"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className="vw-in pointer-events-auto flex max-w-sm items-start gap-2.5 rounded-xl border border-line bg-surface px-4 py-3 text-sm text-ink shadow-pop"
          >
            {t.tone === "good" ? (
              <CircleCheck className="mt-0.5 size-4 shrink-0 text-good" />
            ) : t.tone === "bad" ? (
              <CircleX className="mt-0.5 size-4 shrink-0 text-bad" />
            ) : (
              <Info className="mt-0.5 size-4 shrink-0 text-accent" />
            )}
            <span>{t.text}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  return useContext(ToastCtx);
}

/* ---------- Table ---------- */

export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cx("-mx-5 overflow-x-auto", className)}>
      <table className="w-full min-w-[560px] border-collapse text-sm">{children}</table>
    </div>
  );
}
export function Th({ children, right, className }: { children?: ReactNode; right?: boolean; className?: string }) {
  return (
    <th className={cx("border-b border-line px-5 py-2 text-left text-xs font-medium text-muted first:pl-5", right && "text-right", className)}>
      {children}
    </th>
  );
}
export function Td({ children, right, className, mono }: { children?: ReactNode; right?: boolean; className?: string; mono?: boolean }) {
  return (
    <td className={cx("border-b border-line px-5 py-2.5 align-middle text-ink", right && "text-right tnum", mono && "font-mono text-xs", className)}>
      {children}
    </td>
  );
}
