// "Watch the recipe" — same deep-link pattern as the Instamart/Zepto vendor
// search: open the YouTube app on a search for the dish, falling back to the
// web if the app isn't installed. Tamil keyword appended so the user gets
// Tamil cooking videos, which is the whole point.
import { Linking } from "react-native";

// Owner's preferred channel: easy-to-follow, covers most basics. We BIAS the
// search toward it rather than restricting to it (a channel-scoped URL
// dead-ends on an empty page when the channel lacks the dish — which happens
// for AI-invented dishes). Set to "" to go back to plain Tamil search.
const PREFERRED_CHANNEL = "Madras Samayal";

/** `"Bottle Gourd Kootu"` -> `Bottle Gourd Kootu tamil Madras Samayal recipe` */
export function youtubeQuery(dishName: string, nameTa?: string): string {
  // Prefer the Tamil name when we have a real one — better search results.
  const base = nameTa && nameTa !== dishName ? `${dishName} ${nameTa}` : dishName;
  return `${base} tamil ${PREFERRED_CHANNEL} recipe`.replace(/\s+/g, " ").trim();
}

export async function openYoutubeRecipe(dishName: string, nameTa?: string): Promise<void> {
  const q = encodeURIComponent(youtubeQuery(dishName, nameTa));
  const appUrl = `vnd.youtube://results?search_query=${q}`;
  const webUrl = `https://www.youtube.com/results?search_query=${q}`;
  try {
    if (await Linking.canOpenURL(appUrl)) {
      await Linking.openURL(appUrl);
      return;
    }
  } catch {
    /* fall through to web */
  }
  Linking.openURL(webUrl).catch(() => {});
}
