import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { router, useFocusEffect } from "expo-router";
import { useNow } from "@/components/ui";
import { api, ApiError } from "@/lib/api/client";
import { DEMO_PIN } from "@/lib/api/demo";
import { useCheckout, useConnection, useInvalidateMoney, useVaults } from "@/lib/api/hooks";
import type { PaymentIntent } from "@/lib/api/pay-types";
import { haptic } from "@/lib/haptics";
import { authenticateBiometric, biometricKind } from "@/lib/session";
import { selectedVault, vaultOptions, type PayVault } from "./vaults";

export type Phase =
  | { kind: "review" }
  /** The Face ID / fingerprint sheet is up. */
  | { kind: "authenticating" }
  | { kind: "pin"; message: string | null }
  /** `from` is the step that stays on screen while confirming. */
  | { kind: "submitting"; via: "biometric" | "pin"; from: "review" | "pin" }
  /** Confirming failed for a reason other than the PIN. */
  | { kind: "failed"; error: unknown };

/**
 * Pay with Vaultwise checkout: load the intent, pick the vault, hold to pay, authenticate
 * (biometrics, PIN as fallback), confirm, then follow the intent while it's processed.
 *
 * Simulated checkouts (demo mode, or live while the server's /pay routes don't exist) are
 * confirmed by the on-device simulator, which accepts the practice PIN — so a passed biometric
 * check stands in for it there. A real checkout needs the customer's server PIN, so it always
 * asks for it.
 */
export function useCheckoutFlow(intentId: string | undefined) {
  const q = useCheckout(intentId);
  const { refetch } = q;
  const qc = useQueryClient();
  const vaults = useVaults();
  const { mode } = useConnection();
  const invalidate = useInvalidateMoney();
  const [phase, setPhase] = useState<Phase>({ kind: "review" });
  const [confirmed, setConfirmed] = useState<PaymentIntent | null>(null);
  const [paidHere, setPaidHere] = useState(false);
  /** The paying vault as it was when the payment was confirmed. */
  const [paidFrom, setPaidFrom] = useState<PayVault | null>(null);
  const [vaultChoice, setVaultChoice] = useState<string | null>(null);
  const [pinError, setPinError] = useState(0);
  /** Used as the PIN pad's key: a bump gives a fresh pad when a typed PIN was never sent. */
  const [pinResets, setPinResets] = useState(0);
  const [bio, setBio] = useState<"face" | "finger" | null>(null);

  useEffect(() => {
    let alive = true;
    void biometricKind().then((k) => {
      if (alive) setBio(k);
    });
    return () => {
      alive = false;
    };
  }, []);

  // A copy cached from an earlier visit can be out of date (paid since, or a Practice checkout
  // that was reset), so only data fetched since this screen opened is shown.
  const [openedAt] = useState(() => Date.now());
  const hadCache = useRef(q.data !== undefined);
  const data = q.data && q.dataUpdatedAt >= openedAt ? q.data : undefined;
  // Until the refetch after confirming lands, the confirm response is the freshest copy.
  const intent: PaymentIntent | null = confirmed && (!data || data.status === "requires_customer") ? confirmed : (data ?? null);
  const status = intent?.status;
  const now = useNow(15_000, status === "requires_customer");
  const expired = status === "expired" || (status === "requires_customer" && !!intent && intent.expiresAt <= now);
  const vault = intent ? selectedVault(intent, vaultChoice) : null;
  const options = intent ? vaultOptions(intent, vaults.data?.vaults) : [];
  const blocked = status === "requires_customer" && !!intent && (!vault || vault.available < intent.amount);
  const practice = mode === "demo" || !!intent?.simulated;
  const intentKey = intent?.id ?? null;

  // Opening over a cached copy, or coming back from Add money (or anywhere else) — the
  // payment and balances may have changed.
  const firstFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      const first = firstFocus.current;
      firstFocus.current = false;
      if (intentId && (!first || hadCache.current)) void refetch();
    }, [intentId, refetch]),
  );

  // A vault/merchant mismatch the customer can't pay through: a caution, once per checkout.
  const warnedFor = useRef<string | null>(null);
  useEffect(() => {
    if (blocked && !expired && intentKey && warnedFor.current !== intentKey) {
      warnedFor.current = intentKey;
      haptic("warning");
    }
  }, [blocked, expired, intentKey]);

  // Outcome haptics, only for a payment confirmed on this screen (not when reopening an old one).
  const signalled = useRef<string | null>(null);
  useEffect(() => {
    if (!paidHere || !status || signalled.current === status) return;
    if (status === "succeeded") haptic("pay.success");
    else if (status === "in_review") haptic("proof.review");
    else if (status === "declined") haptic("error");
    else return;
    signalled.current = status;
    void invalidate();
  }, [paidHere, status, invalidate]);

  // Set while a confirm, or the Face ID check before one, is running. `phase` is state, so a
  // handler from an older render (a second PIN, a late hold) could still see it as idle.
  const inFlight = useRef(false);

  const submit = async (pin: string, via: "biometric" | "pin", from: "review" | "pin" = via === "pin" ? "pin" : "review") => {
    if (inFlight.current) {
      // A confirm, or the Face ID check before one, is already running (say a PIN finished while
      // Face ID was starting). Nothing was sent, so the pad starts fresh and its keys work again.
      if (via === "pin") setPinResets((n) => n + 1);
      return;
    }
    if (!intent || !vault) {
      // The payment or its vault changed meanwhile: back to the review, which says what's wrong.
      setPhase({ kind: "review" });
      return;
    }
    inFlight.current = true;
    setPhase({ kind: "submitting", via, from });
    try {
      const next = await api.confirmCheckout(intent.id, vault.id, pin);
      // The hold to pay commits nothing (Face ID or the PIN still follows); the money commits here.
      // A decline moved nothing, and its own outcome haptic follows.
      if (next.status !== "declined") haptic("irreversible.commit");
      // Seed the checkout query with the confirmed intent so its polling starts right away.
      qc.setQueriesData<PaymentIntent>({ predicate: (query) => query.queryKey[1] === "checkout" && query.queryKey[2] === next.id }, next);
      setConfirmed(next);
      setPaidFrom(vault);
      setPaidHere(true);
      setPhase({ kind: "review" });
    } catch (e) {
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
        if (via === "pin") {
          // A typed PIN was rejected: haptic + dots shake together.
          haptic("pin.wrong");
          setPinError((n) => n + 1);
        }
        setPhase({ kind: "pin", message: via === "pin" ? "That PIN isn't right. Try again." : "Enter your PIN to confirm." });
        return;
      }
      if (e instanceof ApiError && e.status === 409) {
        // Already handled elsewhere: show where it is now.
        setPhase({ kind: "review" });
        void refetch();
        return;
      }
      haptic("error");
      setPhase({ kind: "failed", error: e });
    } finally {
      inFlight.current = false;
    }
  };

  /** Face ID / fingerprint, counted as in flight so nothing else starts a confirm meanwhile. */
  const checkBiometric = async () => {
    inFlight.current = true;
    try {
      return await authenticateBiometric("Confirm payment");
    } finally {
      inFlight.current = false;
    }
  };

  /** After the hold completes. */
  const start = async () => {
    if (!intent || !vault || blocked || expired || inFlight.current) return;
    if (practice && bio) {
      setPhase({ kind: "authenticating" });
      if (await checkBiometric()) {
        await submit(DEMO_PIN, "biometric");
        return;
      }
    }
    setPhase({ kind: "pin", message: null });
  };

  /** The biometric key on the PIN pad: the PIN step stays up while it confirms. */
  const retryBiometric = async () => {
    if (!practice || !bio || phase.kind === "submitting" || inFlight.current) return;
    if (await checkBiometric()) await submit(DEMO_PIN, "biometric", "pin");
  };

  const leave = () => (router.canGoBack() ? router.back() : router.replace("/pay"));
  const close = () => {
    // Leaving mid-payment: balances move whether or not the outcome was seen here.
    if (paidHere) void invalidate();
    leave();
  };

  return {
    q,
    intent,
    phase,
    expired,
    vault,
    options,
    blocked,
    practice,
    bio,
    pinError,
    pinResets,
    paidHere,
    paidFrom,
    selectVault: setVaultChoice,
    start,
    submit,
    retryBiometric,
    backToReview: () => setPhase({ kind: "review" }),
    close,
    done: () => {
      void invalidate();
      leave();
    },
    talkToPerson: () => router.push({ pathname: "/support", params: { topic: "payment", ref: intentId ?? "" } }),
  };
}

export type CheckoutFlow = ReturnType<typeof useCheckoutFlow>;
