import { EmptyScreen } from "@/src/components/empty-screen";

export default function GroceryScreen() {
  return (
    <EmptyScreen
      screenTestID="grocery-screen"
      headerTitle="Grocery"
      headerSubtitleTa="சந்தை பட்டியல்"
      iconName="cart-outline"
      emptyTitle="No grocery list yet"
      emptyTitleTa="இன்னும் சந்தை பட்டியல் இல்லை"
      emptyBody="Generate a smart shopping list from your planned meals and pantry gaps."
    />
  );
}
