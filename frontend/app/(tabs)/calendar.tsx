import { EmptyScreen } from "@/src/components/empty-screen";

export default function CalendarScreen() {
  return (
    <EmptyScreen
      screenTestID="calendar-screen"
      headerTitle="Calendar"
      headerSubtitleTa="வாராந்திர அட்டவணை"
      iconName="calendar-outline"
      emptyTitle="Calendar is empty"
      emptyTitleTa="அட்டவணை காலியாக உள்ளது"
      emptyBody="See your weekly meal plan at a glance and rearrange dishes with a long-press."
    />
  );
}
