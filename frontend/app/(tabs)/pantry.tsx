import { EmptyScreen } from "@/src/components/empty-screen";

export default function PantryScreen() {
  return (
    <EmptyScreen
      screenTestID="pantry-screen"
      headerTitle="Pantry"
      headerSubtitleTa="சாமான் அறை"
      iconName="cube-outline"
      emptyTitle="Your pantry is empty"
      emptyTitleTa="உங்கள் சாமான் அறை காலியாக உள்ளது"
      emptyBody="Add ingredients with quantity and purchase date to start tracking freshness and get smart alerts."
    />
  );
}
