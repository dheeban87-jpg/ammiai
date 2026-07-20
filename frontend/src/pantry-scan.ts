// R3 — fridge-photo inventory helpers. Capture a photo, cap it at ~1280px JPEG
// to keep vision cost/latency sane, and POST to the catalog-grounded scan
// endpoint. Nothing writes to the pantry until the user confirms.
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { api } from "@/src/api";

export type ScanItem = {
  // Catalog id, or a synthetic "kb:<name>" id for a knowledge-base item (the
  // synthetic id is only a stable React key; KB writes go by name+category).
  ingredient_id: string;
  name: string;
  name_ta?: string;
  category: string;
  qty_class: "small" | "medium" | "large";
  qty: number;
  unit: string;
  kb?: boolean; // true → non-catalog, written to the pantry via the KB path
  price?: number | null; // what the bill charged for this line, if it was a bill
};

export type ScanResult = { items: ScanItem[]; count: number; note?: string };
export type ScanSource = "camera" | "gallery";

// C1: vision cost scales with pixels, so shrink before upload — but text and
// produce need different budgets. A bill squashed to 1024px loses the digits
// that are the entire point of scanning it.
export const SCAN_PROFILES = {
  /** produce, packets, cooked dishes — shape and colour survive 1024px fine */
  item: { edge: 1024, quality: 0.8 },
  /** bills & order screenshots — small print must stay legible */
  document: { edge: 1600, quality: 0.85 },
} as const;
export type ScanProfile = keyof typeof SCAN_PROFILES;

/** Downscale so the LONGEST edge hits the profile's target, then JPEG-encode.
 *  Returns base64 plus the byte counts, so callers can log what they saved. */
export async function resizeToJpegBase64(
  uri: string,
  profile: ScanProfile = "item",
  srcWidth?: number,
  srcHeight?: number,
): Promise<{ base64: string; sentKB: number }> {
  const { edge, quality } = SCAN_PROFILES[profile];
  // Resize the longest edge; portrait screenshots are taller than they are
  // wide, so constraining width alone would leave them oversized.
  const portrait = !!srcWidth && !!srcHeight && srcHeight > srcWidth;
  const resize = portrait ? { height: edge } : { width: edge };
  const out = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize }],
    { compress: quality, format: ImageManipulator.SaveFormat.JPEG, base64: true },
  );
  const base64 = out.base64 ?? "";
  return { base64, sentKB: Math.round((base64.length * 3) / 4 / 1024) };
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
  price?: number | null;
};
/** Map raw /api/scan (or /grocery/scan-bill) lines into confirm-sheet rows.
 *  Catalog items keep their id; everything else gets a synthetic "kb:" key and
 *  is written through the knowledge-base path. Non-food lines are dropped. */
export function mapScanItems(apiItems: ScanApiItem[] | undefined): ScanItem[] {
  return (apiItems ?? [])
    .filter((i) => i.include_default !== false && i.name_en)
    .map((i) => {
      const isCatalog = Boolean(i.addable && i.ingredient_id);
      return {
        ingredient_id: isCatalog ? (i.ingredient_id as string) : `kb:${i.name_en}`,
        name: i.name_en,
        name_ta: i.name_ta,
        category: i.category,
        qty_class: "medium" as const,
        qty: i.qty,
        unit: i.unit,
        kb: !isCatalog,
        price: i.price ?? null,
      };
    });
}

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
  // Android kills a backgrounded app while the camera Activity is in front if
  // memory runs short — that is the "app restarted after I took a photo" bug.
  // We can't stop the OS reclaiming memory, but we can stop being the reason:
  // capture compressed (a 12MP JPEG decodes to ~48MB as a bitmap) and never
  // ask the picker for base64, which would hold a second copy in memory.
  const res =
    source === "camera"
      ? await ImagePicker.launchCameraAsync({ quality: 0.5, exif: false })
      : await ImagePicker.launchImageLibraryAsync({ quality: 0.7, exif: false });
  if (res.canceled || !res.assets?.[0]?.uri) return null;
  const a = res.assets[0];
  const { base64, sentKB } = await resizeToJpegBase64(a.uri, "item", a.width, a.height);
  if (!base64) throw new Error("process");
  console.log(`[scan] item ${a.width}x${a.height} -> ${SCAN_PROFILES.item.edge}px, ${sentKB}KB sent`);

  const out = await api.post<ScanApiResult>("/api/scan", {
    image_base64: base64,
    media_type: "image/jpeg",
  });
  // not_food → nothing to add. physical_item AND document_list (S3c) yield
  // items into the same confirm flow. Catalog items add directly; non-catalog
  // (packaged/novel) items add via the knowledge-base path. Non-food lines
  // (include_default === false) are dropped.
  if (out.mode === "not_food") {
    return { items: [], count: 0, note: out.message };
  }
  const items = mapScanItems(out.items);
  return { items, count: items.length, note: out.note };
}

export function storageForCategory(category?: string): "pantry" | "fridge" {
  // Greens & dairy default to fridge; other fresh items to pantry (editable).
  return category === "leafy_green" || category === "dairy" ? "fridge" : "pantry";
}

/** Upsert confirmed items into the pantry. Best-effort per item (skips ones
 *  that hit the free-plan limit or already exist). Returns how many landed. */
export async function addScannedItems(
  items: {
    ingredient_id: string;
    name?: string;
    name_ta?: string;
    qty: number;
    unit: string;
    category?: string;
    kb?: boolean;
  }[],
): Promise<number> {
  let added = 0;
  for (const it of items) {
    try {
      const body = it.kb
        ? {
            // KB-backed (non-catalog) item — the backend creates/links a
            // knowledge-base entry; the synthetic "kb:" id is not sent.
            kb: true,
            name_en: it.name,
            name_ta: it.name_ta,
            category: it.category,
            qty: it.qty,
            unit: it.unit,
            storage: storageForCategory(it.category),
          }
        : {
            ingredient_id: it.ingredient_id,
            qty: it.qty,
            unit: it.unit,
            storage: storageForCategory(it.category),
          };
      await api.post("/api/pantry", body);
      added++;
    } catch {
      /* skip — limit reached or duplicate */
    }
  }
  return added;
}
