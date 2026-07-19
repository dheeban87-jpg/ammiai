// AmmiAI shared TypeScript types.
export type User = {
  user_id: string;
  email?: string;
  phone?: string;
  name?: string;
  picture?: string;
  auth_provider?: string;
};

export type HealthProfile = {
  height_cm?: number;
  weight_kg?: number;
  target_weight_kg?: number; // goal weight for "Your path" pacing
  bmi?: number;
  goals: string[];
  sex?: "male" | "female";
  age_band?: string;
  activity?: "sedentary" | "moderate" | "active";
};

export type Profile = {
  user_id: string;
  name?: string;
  diet?: "veg" | "nonveg" | "eggetarian";
  household_size?: number;
  spice_level?: "mild" | "medium" | "hot";
  favorites: string[];
  allergies: string[];
  custom_avoid: string[];
  health?: HealthProfile;
  onboarding_complete?: boolean;
};

export type Ingredient = {
  ingredient_id: string;
  name: string;
  category: string;
  pantry_days: number | null;
  fridge_days: number | null;
  alert_before_days: number;
};

export type PantryItem = {
  id: string;
  ingredient_id: string;
  ingredient_name: string;
  category: string;
  qty: number;
  unit: string;
  storage: "pantry" | "fridge";
  purchase_date: string;
  shelf_days: number | null;
  alert_before_days: number;
  days_left: number | null;
  freshness: "green" | "yellow" | "red" | "unknown";
  probably_finished?: boolean;
};

export type Recipe = {
  id: string;
  name_en: string;
  name_ta: string;
  category: string;
  diet: string;
  spice_level: string;
  prep_time_min: number;
};
