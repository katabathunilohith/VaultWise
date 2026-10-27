import { Redirect } from "expo-router";
import { WALLET_ENABLED, WalletScreen } from "@/features/wallet";

/** wallet: the Wallet screen (pushed from Home's wallet card). */
export default function WalletRoute() {
  if (!WALLET_ENABLED) return <Redirect href="/" />;
  return <WalletScreen />;
}
