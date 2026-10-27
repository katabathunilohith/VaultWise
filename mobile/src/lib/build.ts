/**
 * Which build this is. The store build (eas.json `production`) sets EXPO_PUBLIC_PRACTICE_ONLY=1:
 * the app always runs on Practice data on the phone, with no server address to type, and sign-in,
 * "Verify your ID" and account recovery are off. Apple (5.1.1(ix), 3.2.1(viii)) and Google Play only
 * accept real-money finance apps, and apps that collect ID documents, from a licensed company.
 * Development and preview builds leave it unset and work exactly as before.
 */
export const PRACTICE_ONLY = process.env.EXPO_PUBLIC_PRACTICE_ONLY === "1";
