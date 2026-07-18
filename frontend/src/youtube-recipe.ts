// "Watch the recipe" — same deep-link pattern as the Instamart/Zepto vendor
// search: open the YouTube app on a search for the dish, falling back to the
// web if the app isn't installed. Tamil keyword appended so the user gets
// Tamil cooking videos, which is the whole point.
import { Linking } from "react-native";

/** `"Bottle Gourd Kootu"` -> searches `Bottle Gourd Kootu tamil recipe` */
export function youtubeQuery(dishName: string, nameTa?: string): string {
  // Prefer the Tamil name when we have a real one — better search results.
  const base = nameTa && nameTa !== dishName ? `${dishName} ${nameTa}` : dishName;
  return `${base} tamil recipe`.trim();
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
