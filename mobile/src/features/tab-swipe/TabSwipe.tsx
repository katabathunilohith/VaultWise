import { useCallback, type ReactNode } from "react";
import { router, useFocusEffect } from "expo-router";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import { neighbourTab, type TabName } from "@/components/nav/tabs";
import { useReduceMotion } from "@/components/ui";
import { haptic } from "@/lib/haptics";
import { TAB_SWIPE } from "./config";
import { follow, markEntering, stepFor, takeEntering } from "./model";

const SETTLE = { damping: 22, stiffness: 260, mass: 0.6 };

/**
 * Wraps a tab's root screen so a sideways swipe moves to the next or previous tab, in the tab
 * bar's order. Vertical scrolling wins as soon as the finger moves more up or down than sideways,
 * and horizontal scrollers inside the screen (built on react-native-gesture-handler) keep their swipe.
 */
export function TabSwipe({ tab, children }: { tab: TabName; children: ReactNode }) {
  const reduce = useReduceMotion();
  const x = useSharedValue(0);
  const prev = neighbourTab(tab, -1);
  const next = neighbourTab(tab, 1);

  // Arriving by a swipe: slide in from the side the finger came from.
  useFocusEffect(
    useCallback(() => {
      const from = takeEntering(tab);
      if (from === null || reduce) return;
      x.set(from * 36);
      x.set(withTiming(0, { duration: 220, easing: Easing.out(Easing.cubic) }));
    }, [tab, reduce, x]),
  );

  const go = (step: -1 | 1, dx: number) => {
    const target = step === 1 ? next : prev;
    if (!target) return false;
    haptic("tab.change");
    markEntering(target.name, dx < 0 ? 1 : -1);
    router.navigate(target.href);
    return true;
  };

  const pan = Gesture.Pan()
    .enabled(TAB_SWIPE.enabled)
    .runOnJS(true)
    .activeOffsetX([-TAB_SWIPE.activeX, TAB_SWIPE.activeX])
    .failOffsetY([-TAB_SWIPE.cancelY, TAB_SWIPE.cancelY])
    .onUpdate((e) => {
      if (reduce) return;
      // Mostly up or down: that's a scroll, so the screen stays put.
      x.set(Math.abs(e.translationX) < Math.abs(e.translationY) * 2 ? 0 : follow(e.translationX, { prev: !!prev, next: !!next }));
    })
    .onEnd((e) => {
      const step = stepFor(e.translationX, e.velocityX, e.translationY);
      // Leaving: snap back at once, so the screen is at rest when it's next shown.
      if (step !== 0 && go(step, e.translationX)) x.set(0);
      else x.set(reduce ? 0 : withSpring(0, SETTLE));
    })
    .onFinalize(() => {
      if (x.get() !== 0) x.set(reduce ? 0 : withSpring(0, SETTLE));
    });

  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: x.get() }],
    opacity: 1 - Math.min(0.25, Math.abs(x.get()) / 220),
  }));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={[{ flex: 1 }, style]}>{children}</Animated.View>
    </GestureDetector>
  );
}
