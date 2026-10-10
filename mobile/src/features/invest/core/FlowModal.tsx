import { type ReactNode } from "react";
import { Modal, Platform, type ModalProps } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

/** Native-only presentation: full screen on iOS (no swipe-to-dismiss), edge to edge on Android. */
const NATIVE_PROPS: Partial<ModalProps> = Platform.select<Partial<ModalProps>>({
  ios: { presentationStyle: "fullScreen", allowSwipeDismissal: false },
  android: { statusBarTranslucent: true, navigationBarTranslucent: true },
  default: {},
});

/**
 * Full-screen money flow presented over the Invest tab (R7). A React Native Modal keeps the flow
 * inside this tab without a separate route. Its own SafeAreaProvider measures the modal window,
 * so ModalScreen's insets line up with the system bars on every platform.
 */
export function FlowModal({ visible, onRequestClose, children }: { visible: boolean; onRequestClose: () => void; children: ReactNode }) {
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onRequestClose} {...NATIVE_PROPS}>
      <SafeAreaProvider>{children}</SafeAreaProvider>
    </Modal>
  );
}
