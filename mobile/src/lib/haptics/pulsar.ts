/**
 * Web build: Pulsar is native-only. The native implementation lives in pulsar.native.ts;
 * Metro picks that file on iOS/Android.
 */
export interface PulsarPattern {
  discretePattern: { time: number; amplitude: number; frequency: number }[];
  continuousPattern: { amplitude: { time: number; value: number }[]; frequency: { time: number; value: number }[] };
}

export interface PulsarBackend {
  /** 0 none · 1 limited (no amplitude control) · 2 standard · 3 advanced */
  support: number;
  parse(p: PulsarPattern): number;
  play(id: number): void;
  stop(id: number): void;
  stopAll(): void;
  enable(on: boolean): void;
}

export const pulsar: PulsarBackend | null = null;
