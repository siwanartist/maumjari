import TopBar from "@/components/TopBar";

// ⚠️ 오픈 전 반드시 실제 약관으로 교체 (법률 검토 필요)
export default function Terms() {
  return (
    <main className="shell">
      <TopBar title="이용약관" back />
      <section className="pad" style={{ paddingTop: 0 }}>
        <div className="card" style={{ borderColor: "var(--warn)" }}>
          <b>작성 필요</b>
          <p className="small">이 페이지는 자리표시입니다. 서비스 오픈 전 사업자 정보, 서비스 내용, 결제·취소·환불 규정, 회원 의무, 분쟁 해결 등을 담은 실제 이용약관으로 교체해야 합니다.</p>
        </div>
      </section>
    </main>
  );
}
