import { TurboModuleRegistry, type TurboModule } from "react-native";
import type { PulsarBackend, PulsarPattern } from "./pulsar";

export type { PulsarBackend, PulsarPattern } from "./pulsar";

/**
 * react-native-pulsar (Software Mansion; recommended by Expo's haptics docs) plays custom
 * Core Haptics patterns on iOS and Composition/envelope effects on Android. It is only present
 * in development and store builds — Expo Go doesn't ship it, and its JS entry throws on import
 * when the native module is missing. So we never import the package: we look the native module
 * up ourselves and fall back to expo-haptics when it's absent.
 */
interface Spec extends TurboModule {
  Pulsar_enableHaptics(state: boolean): void;
  Pulsar_stopHaptics(): void;
  Pulsar_hapticSupport(): number;
  PatternComposer_parsePattern(data: PulsarPattern): number;
  PatternComposer_play(patternId: number): void;
  PatternComposer_stop(patternId: number): void;
}

function load(): PulsarBackend | null {
  let mod: Spec | null = null;
  try {
    mod = TurboModuleRegistry.get<Spec>("RNPulsar");
  } catch {
    mod = null;
  }
  if (!mod) return null;
  let support = 0;
  try {
    support = mod.Pulsar_hapticSupport();
  } catch {
    support = 0;
  }
  const m = mod;
  return {
    support,
    parse: (p) => m.PatternComposer_parsePattern(p),
    play: (id) => m.PatternComposer_play(id),
    stop: (id) => m.PatternComposer_stop(id),
    stopAll: () => m.Pulsar_stopHaptics(),
    enable: (on) => m.Pulsar_enableHaptics(on),
  };
}

export const pulsar: PulsarBackend | null = load();
