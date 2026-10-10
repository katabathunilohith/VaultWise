import { useEffect, useState } from "react";
import { Keyboard, Platform } from "react-native";

/**
 * True while the software keyboard is up. Used to drop the home-indicator padding under the
 * composer while the keyboard covers that area. (Web has no keyboard events, so it stays false.)
 */
export function useKeyboardVisible() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const ios = Platform.OS === "ios";
    const show = Keyboard.addListener(ios ? "keyboardWillShow" : "keyboardDidShow", () => setVisible(true));
    const hide = Keyboard.addListener(ios ? "keyboardWillHide" : "keyboardDidHide", () => setVisible(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return visible;
}
