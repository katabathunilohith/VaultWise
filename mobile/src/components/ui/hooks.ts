import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";
import { motion } from "@/theme";

/** True while the OS "Reduce Motion" setting is on. */
export function useReduceMotion() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => alive && setOn(v))
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setOn);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
  return on;
}

/**
 * False for the first 400 ms after mount. Main buttons on a freshly shown step ignore taps
 * until then, so a double tap on "Continue" can't also press the next step's button.
 */
export function useArmed(delay: number = motion.ctaArmDelay) {
  const [armed, setArmed] = useState(delay <= 0);
  useEffect(() => {
    if (delay <= 0) return;
    const t = setTimeout(() => setArmed(true), delay);
    return () => clearTimeout(t);
  }, [delay]);
  return armed;
}

/** Re-renders every `ms` while `active`, returning Date.now(). For countdowns and ETAs. */
export function useNow(ms = 1000, active = true) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms, active]);
  return now;
}
