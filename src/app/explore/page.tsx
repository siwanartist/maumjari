import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import TeacherList from "@/components/TeacherList";

export default function Explore() {
  return (
    <main className="shell">
      <TopBar title="탐색" />
      <TeacherList mode="explore" />
      <BottomNav />
    </main>
  );
}
