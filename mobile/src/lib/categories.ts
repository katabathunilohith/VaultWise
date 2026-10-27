import type { ImageSourcePropType } from "react-native";
import {
  FirstAidKitIcon,
  GraduationCapIcon,
  HouseLineIcon,
  LifebuoyIcon,
  PlantIcon,
  SparkleIcon,
  type Icon,
} from "@/components/icons";
import type { CategoryKey } from "@/theme";

/**
 * Purpose-coded vault identity (earmarking made visible — Soman & Cheema 2011):
 * each category has a fixed hue, a Phosphor duotone icon, a 3D object and a plain
 * "unlocks for" list that is shown before any money goes in.
 */
export interface CategoryMeta {
  key: CategoryKey;
  label: string;
  short: string;
  Icon: Icon;
  object3d: ImageSourcePropType;
  unlocksFor: string[];
  proofHint: string;
  /** A few words for the purpose picker. */
  blurb: string;
  /** A suggested vault name. */
  nameIdea: string;
  /** The kind of bill in running text: "a medical bill", "only covers medical costs". */
  billWord: string;
  /** Emergency money comes from Tier 1 vaults straight away, then Tier 2 after a PIN and a pause. */
  emergencyTier: 1 | 2;
}

/** Every vault category, in the order the purpose picker shows them. */
export const VAULT_CATEGORIES = ["health", "education", "housing", "emergency", "retirement", "custom"] as const satisfies readonly CategoryKey[];

/** The categories a custom vault can borrow rules from. */
export const TEMPLATE_CATEGORIES = VAULT_CATEGORIES.filter((k) => k !== "custom");

export const emoji3d = {
  health: require("@/assets/emoji3d/stethoscope.png"),
  education: require("@/assets/emoji3d/graduation_cap.png"),
  housing: require("@/assets/emoji3d/house.png"),
  emergency: require("@/assets/emoji3d/ring_buoy.png"),
  retirement: require("@/assets/emoji3d/potted_plant.png"),
  custom: require("@/assets/emoji3d/sparkles.png"),
  moneyBag: require("@/assets/emoji3d/money_bag.png"),
  coin: require("@/assets/emoji3d/coin.png"),
  locked: require("@/assets/emoji3d/locked.png"),
  party: require("@/assets/emoji3d/party_popper.png"),
  check: require("@/assets/emoji3d/check_mark_button.png"),
  hourglass: require("@/assets/emoji3d/hourglass_not_done.png"),
  receipt: require("@/assets/emoji3d/receipt.png"),
  shield: require("@/assets/emoji3d/shield.png"),
  trophy: require("@/assets/emoji3d/trophy.png"),
  medal: require("@/assets/emoji3d/sports_medal.png"),
  seedling: require("@/assets/emoji3d/seedling.png"),
  rocket: require("@/assets/emoji3d/rocket.png"),
  robot: require("@/assets/emoji3d/robot.png"),
  speech: require("@/assets/emoji3d/speech_balloon.png"),
  star: require("@/assets/emoji3d/glowing_star.png"),
  gem: require("@/assets/emoji3d/gem_stone.png"),
  key: require("@/assets/emoji3d/key.png"),
  fire: require("@/assets/emoji3d/fire.png"),
  bell: require("@/assets/emoji3d/bell.png"),
  camera: require("@/assets/emoji3d/camera.png"),
  card: require("@/assets/emoji3d/credit_card.png"),
  bank: require("@/assets/emoji3d/bank.png"),
  hospital: require("@/assets/emoji3d/hospital.png"),
  bags: require("@/assets/emoji3d/shopping_bags.png"),
  umbrella: require("@/assets/emoji3d/umbrella_with_rain_drops.png"),
  stopwatch: require("@/assets/emoji3d/stopwatch.png"),
} satisfies Record<string, ImageSourcePropType>;

export const CATEGORIES: Record<CategoryKey, CategoryMeta> = {
  health: {
    key: "health",
    billWord: "medical",
    emergencyTier: 1,
    blurb: "Bills, pharmacy, tests",
    nameIdea: "Family health fund",
    label: "Health",
    short: "Health",
    Icon: FirstAidKitIcon,
    object3d: emoji3d.health,
    unlocksFor: ["Hospital and clinic bills", "Pharmacy receipts", "Lab and test invoices"],
    proofHint: "A medical invoice, pharmacy receipt or hospital bill",
  },
  education: {
    key: "education",
    billWord: "education",
    emergencyTier: 2,
    blurb: "Fees, books, exams",
    nameIdea: "Maya's college fund",
    label: "Education",
    short: "Education",
    Icon: GraduationCapIcon,
    object3d: emoji3d.education,
    unlocksFor: ["Tuition and course fees", "Textbooks and supplies", "Exam and enrolment fees"],
    proofHint: "A tuition invoice, fee receipt or textbook receipt",
  },
  housing: {
    key: "housing",
    billWord: "housing",
    emergencyTier: 2,
    blurb: "Rent, deposits, lease",
    nameIdea: "Apartment deposit",
    label: "Housing",
    short: "Housing",
    Icon: HouseLineIcon,
    object3d: emoji3d.housing,
    unlocksFor: ["Rent and deposits", "Lease signing costs", "Mortgage payments"],
    proofHint: "A rent receipt, lease or deposit invoice",
  },
  emergency: {
    key: "emergency",
    billWord: "emergency",
    emergencyTier: 2,
    blurb: "Repairs, urgent travel",
    nameIdea: "Rainy day fund",
    label: "Emergency",
    short: "Emergency",
    Icon: LifebuoyIcon,
    object3d: emoji3d.emergency,
    unlocksFor: ["Urgent repairs", "Emergency travel", "Utility shut-off notices"],
    proofHint: "Any bill that supports the emergency",
  },
  retirement: {
    key: "retirement",
    billWord: "retirement",
    emergencyTier: 2,
    blurb: "Pension, later life",
    nameIdea: "Retirement top-up",
    label: "Retirement",
    short: "Retirement",
    Icon: PlantIcon,
    object3d: emoji3d.retirement,
    unlocksFor: ["Pension contributions", "Retirement-age payouts"],
    proofHint: "A pension statement or age-eligibility proof",
  },
  custom: {
    key: "custom",
    billWord: "custom",
    emergencyTier: 2,
    blurb: "Your goal, your rules",
    nameIdea: "Wedding fund",
    label: "Custom goal",
    short: "Custom",
    Icon: SparkleIcon,
    object3d: emoji3d.custom,
    unlocksFor: ["Receipts matching the template you chose"],
    proofHint: "A receipt that matches the template you chose",
  },
};

export function categoryOf(key: string | undefined | null): CategoryMeta {
  return CATEGORIES[(key && key in CATEGORIES ? key : "custom") as CategoryKey];
}

/** A bill category in running text ("medical"); categories outside the list read as they are. */
export function billWord(category: string) {
  return category in CATEGORIES ? CATEGORIES[category as CategoryKey].billWord : category;
}

/** Which emergency tier a vault in this category pays from (the vault's own category, as on the server). */
export function emergencyTier(category: string): 1 | 2 {
  return categoryOf(category).emergencyTier;
}

/** The category whose vaults pay out first in an emergency (Health). */
export const TIER1_CATEGORY: CategoryKey = VAULT_CATEGORIES.find((k) => CATEGORIES[k].emergencyTier === 1) ?? "health";

interface RulesSource {
  category: string;
  template?: string | null;
  /** custom-rules: a custom vault's own rule. */
  customRule?: unknown;
}

/** The category whose rules a vault follows: a custom vault's borrowed template, otherwise its own. */
export function rulesCategory(v: RulesSource): CategoryKey {
  const own = categoryOf(v.category).key;
  return own === "custom" && v.template && v.template !== "custom" ? categoryOf(v.template).key : own;
}

/**
 * Whether a vault can pay a bill in `billCategory` without a person checking it against a rule of
 * its own: a custom vault covers bills only through the template it borrowed.
 */
export function covers(v: RulesSource, billCategory: string) {
  if (v.customRule) return false; // custom-rules: a person checks every bill against the vault's own rule
  return rulesCategory(v) === billCategory;
}
