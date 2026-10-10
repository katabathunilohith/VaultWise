import { useEffect, useRef } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { Image } from "expo-image";
import { useReduceMotion } from "@/components/ui";
import { emoji3d } from "@/lib/categories";

const HEIGHT = 232;
const OBJECT = 132;
const COIN = 56;
/** Where the coin's top sits when it meets the object (a little inside its top edge). */
const COIN_REST = HEIGHT - OBJECT + 24 - COIN;
const FALL_MS = 520;

/**
 * A coin falls into the vault's 3D object. `onImpact` runs on the frame the coin lands, so the
 * caller can play `deposit.coinDrop` in sync with the bounce. Under Reduce Motion the coin simply
 * fades in over the object and out again (150 ms each), with the impact at the end of the fade-in.
 */
export function CoinDrop({ object, play, onImpact }: { object: number; play: boolean; onImpact: () => void }) {
  const reduce = useReduceMotion();
  const y = useSharedValue(-COIN_REST);
  const coinOpacity = useSharedValue(0);
  const spin = useSharedValue(-24);
  const squash = useSharedValue(1);
  const played = useRef(false);

  useEffect(() => {
    if (!play || played.current) return;
    played.current = true;
    const land = () => onImpact();
    if (reduce) {
      y.value = 0;
      spin.value = 0;
      coinOpacity.value = withTiming(1, { duration: 150 }, (done) => {
        if (!done) return;
        scheduleOnRN(land);
        coinOpacity.value = withDelay(250, withTiming(0, { duration: 150 }));
      });
      return;
    }
    coinOpacity.value = 1;
    spin.value = withTiming(0, { duration: FALL_MS });
    y.value = withTiming(0, { duration: FALL_MS, easing: Easing.in(Easing.quad) }, (done) => {
      if (!done) return;
      scheduleOnRN(land);
      // Decaying bounce, in step with the three-beat haptic (0 / 70 / 115 ms).
      squash.value = withSequence(
        withTiming(0.9, { duration: 70 }),
        withTiming(1.04, { duration: 45 }),
        withSpring(1, { damping: 12, stiffness: 260 }),
      );
      coinOpacity.value = withTiming(0, { duration: 120 });
    });
  }, [play, reduce, onImpact, y, spin, coinOpacity, squash]);

  const coinStyle = useAnimatedStyle(() => ({
    opacity: coinOpacity.value,
    transform: [{ translateY: y.value }, { rotate: `${spin.value}deg` }],
  }));
  const objectStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: 2 - squash.value }, { scaleY: squash.value }] }));

  return (
    <View style={styles.stage} accessible={false} importantForAccessibility="no-hide-descendants">
      <Animated.View style={[styles.coin, coinStyle]}>
        <Image source={emoji3d.coin} style={styles.coinImg} contentFit="contain" />
      </Animated.View>
      <Animated.View style={[styles.object, objectStyle]}>
        <Image source={object} style={styles.objectImg} contentFit="contain" />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  stage: { height: HEIGHT, width: "100%", alignItems: "center" },
  coin: { position: "absolute", top: COIN_REST, width: COIN, height: COIN, zIndex: 2 },
  coinImg: { width: COIN, height: COIN },
  object: { position: "absolute", bottom: 0, width: OBJECT, height: OBJECT, transformOrigin: "bottom" },
  objectImg: { width: OBJECT, height: OBJECT },
});
