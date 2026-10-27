/**
 * Icons the identity screens (sign-in, ID check, recovery) need that the shared set doesn't have.
 * Loaded per file, the same way as src/components/icons.ts (the package barrel is ~6 MB).
 */
import type { Icon } from "@/components/icons";

export const IdentificationCardIcon: Icon = require("phosphor-react-native/src/icons/IdentificationCard").IdentificationCardIcon;
export const KeyIcon: Icon = require("phosphor-react-native/src/icons/Key").KeyIcon;
export const UserFocusIcon: Icon = require("phosphor-react-native/src/icons/UserFocus").UserFocusIcon;
export const ShieldWarningIcon: Icon = require("phosphor-react-native/src/icons/ShieldWarning").ShieldWarningIcon;
