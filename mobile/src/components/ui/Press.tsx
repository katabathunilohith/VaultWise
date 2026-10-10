import { type ReactNode } from "react";
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import { haptic, type TokenName } from "@/lib/haptics";
import { motion } from "@/theme";
import { useReduceMotion } from "./hooks";

const APressable = Animated.createAnimatedComponent(Pressable);

export interface PressProps extends Omit<PressableProps, "style" | "children"> {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Haptic played at touch-down (feedback must start within ~50 ms of the touch). */
  hapticOnPressIn?: TokenName | null;
  /** Press-in scale; 0.97 for buttons, 0.98 for cards. */
  scaleTo?: number;
}

/** Pressable with a press-in scale and optional touch-down haptic. */
export function Press({ children, style, hapticOnPressIn = null, scaleTo = 0.97, onPressIn, onPressOut, disabled, ...rest }: PressProps) {
  const s = useSharedValue(1);
  const reduce = useReduceMotion();
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: s.get() }] }));
  return (
    <APressable
      accessibilityRole="button"
      {...rest}
      disabled={disabled}
      onPressIn={(e) => {
        if (!disabled) {
          if (hapticOnPressIn) haptic(hapticOnPressIn);
          if (!reduce) s.set(withTiming(scaleTo, { duration: motion.instant }));
        }
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        s.set(withSpring(1, motion.spring));
        onPressOut?.(e);
      }}
      style={[style, anim]}
    >
      {children}
    </APressable>
  );
}
