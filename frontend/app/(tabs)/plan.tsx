import { EmptyScreen } from "@/src/components/empty-screen";

export default function PlanScreen() {
  return (
    <EmptyScreen
      screenTestID="plan-screen"
      headerTitle="Plan"
      headerSubtitleTa="இன்றைய உணவு திட்டம்"
      iconName="restaurant-outline"
      emptyTitle="No meals planned yet"
      emptyTitleTa="இன்னும் உணவு திட்டமிடப்படவில்லை"
      emptyBody="Plan breakfast, lunch and dinner using Tamil combo rules and ICMR-balanced templates."
    />
  );
}
