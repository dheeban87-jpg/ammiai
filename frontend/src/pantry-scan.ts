// R3 — fridge-photo inventory helpers. Capture a photo, cap it at ~1280px JPEG
// to keep vision cost/latency sane, and POST to the catalog-grounded scan
// endpoint. Nothing writes to the pantry until the user confirms.
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { api } from "@/src/api";

export type ScanItem = {
  ingredient_id: string;
  name: string;
  category: string;
  qty_class: "small" | "medium" | "large";
  qty: number;
  unit: string;
};

export type ScanResult = { items: ScanItem[]; count: number; note?: string };
export type ScanSource = "camera" | "gallery";

async function resizeToJpegBase64(uri: string): Promise<string> {
  const out = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: 1280 } }],
    { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG, base64: true },
  );
  return out.base64 ?? "";
}

// Shape returned by the unified S3 /api/scan endpoint.
type ScanApiItem = {
  ingredient_id: string | null;
  name_en: string;
  name_ta?: string;
  category: string;
  qty: number;
  unit: string;
  addable: boolean;
  needs_mapping?: boolean;
  include_default?: boolean;
};
type ScanApiResult = {
  mode: "physical_item" | "document_list" | "not_food";
  items?: ScanApiItem[];
  note?: string;
  message?: string;
  cache_hit?: boolean;
};

/** Pick/take one photo and scan it via the unified /api/scan pipeline. Returns
 *  null if the user cancels the picker. Throws with `.perm` set
 *  ("camera"/"gallery") on permission denial. Non-physical modes (order
 *  screenshots, non-food) return an empty item list with a `note` for now —
 *  full receipt import lands in S3c. Only catalog-addable items are surfaced
 *  until the knowledge base (S3b) can back non-catalog items. */
export async function captureAndScan(source: ScanSource): Promise<ScanResult | null> {
  if (source === "camera") {
    const p = await ImagePicker.requestCameraPermissionsAsync();
    if (!p.granted) {
      const e: any = new Error("perm");
      e.perm = "camera";
      throw e;
    }
  } else {
    const p = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!p.granted) {
      const e: any = new Error("perm");
      e.perm = "gallery";
      throw e;
    }
  }
  const res =
    source === "camera"
      ? await ImagePicker.launchCameraAsync({ quality: 0.7 })
      : await ImagePicker.launchImageLibraryAsync({ quality: 0.7 });
  if (res.canceled || !res.assets?.[0]?.uri) return null;
  const base64 = await resizeToJpegBase64(res.assets[0].uri);
  if (!base64) throw new Error("process");

  const out = await api.post<ScanApiResult>("/api/scan", {
    image_base64: base64,
    media_type: "image/jpeg",
  });
  // not_food → nothing to add. physical_item AND document_list (S3c receipt
  // import) both yield addable catalog items into the same confirm flow.
  if (out.mode === "not_food") {
    return { items: [], count: 0, note: out.message };
  }
  const items: ScanItem[] = (out.items ?? [])
    .filter((i) => i.addable && i.ingredient_id && i.include_default !== false)
    .map((i) => ({
      ingredient_id: i.ingredient_id as string,
      name: i.name_en,
      category: i.category,
      qty_class: "medium",
      qty: i.qty,
      unit: i.unit,
    }));
  return { items, count: items.length, note: out.note };
}

export function storageForCategory(category?: string): "pantry" | "fridge" {
  // Greens & dairy default to fridge; other fresh items to pantry (editable).
  return category === "leafy_green" || category === "dairy" ? "fridge" : "pantry";
}

/** Upsert confirmed items into the pantry. Best-effort per item (skips ones
 *  that hit the free-plan limit or already exist). Returns how many landed. */
export async function addScannedItems(
  items: { ingredient_id: string; qty: number; unit: string; category?: string }[],
): Promise<number> {
  let added = 0;
  for (const it of items) {
    try {
      await api.post("/api/pantry", {
        ingredient_id: it.ingredient_id,
        qty: it.qty,
        unit: it.unit,
        storage: storageForCategory(it.category),
      });
      added++;
    } catch {
      /* skip — limit reached or duplicate */
    }
  }
  return added;
}
