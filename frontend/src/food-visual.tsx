// FoodAvatar: shows a real product image when available in assets/,
// falls back to the emoji system otherwise. Drop PNGs into
// assets/ingredients/{ingredient_id}.png or assets/dishes/{dish_id}.png,
// run `node scripts/gen-image-map.js`, rebuild — images appear automatically.
import React from "react";
import { Image, StyleSheet, Text, View, ViewStyle } from "react-native";

import { DISH_IMAGES, INGREDIENT_IMAGES } from "@/src/generated-image-maps";
import { dishEmoji, dishTint, emojiFor, tintFor } from "@/src/food-emoji";

type Kind = "ingredient" | "dish";

export function FoodAvatar({
  kind,
  id,
  category,
  size = 46,
  style,
}: {
  kind: Kind;
  id?: string | null;
  category?: string | null;
  size?: number;
  style?: ViewStyle;
}) {
  const img = id ? (kind === "ingredient" ? INGREDIENT_IMAGES[id] : DISH_IMAGES[id]) : undefined;
  const tint = kind === "ingredient" ? tintFor(category) : dishTint(category);
  const emoji = kind === "ingredient" ? emojiFor(id, category) : dishEmoji(id, category);

  return (
    <View
      style={[
        styles.wrap,
        { width: size, height: size, borderRadius: size * 0.28, backgroundColor: img ? "#FFFFFF" : tint },
        style,
      ]}
    >
      {img ? (
        <Image source={img} style={{ width: size - 6, height: size - 6 }} resizeMode="contain" />
      ) : (
        <Text style={{ fontSize: size * 0.52 }}>{emoji}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", justifyContent: "center", overflow: "hidden" },
});
