"use client";
import { useRouter } from "next/navigation";
import TopBar from "@/components/TopBar";
import TeacherProfileForm, { emptyTeacherForm } from "@/components/TeacherProfileForm";
import { api } from "@/lib/client";

export default function Apply() {
  const router = useRouter();
  return (
    <main className="shell">
      <TopBar title="지도자 등록 신청" back="/profile" />
      <section className="pad" style={{ paddingTop: 0 }}>
        <p className="muted small">작성한 내용은 운영진 심사 후 공개됩니다. 승인되면 클래스를 등록하고 예약을 받을 수 있어요.</p>
        <TeacherProfileForm initial={emptyTeacherForm} submitLabel="심사 신청하기" onSubmit={async (f) => {
          await api("/api/teacher/apply", { body: f });
          router.replace("/teacher");
        }} />
      </section>
    </main>
  );
}
