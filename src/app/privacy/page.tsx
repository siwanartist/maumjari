import TopBar from "@/components/TopBar";

// ⚠️ 오픈 전 반드시 실제 개인정보처리방침으로 교체 (개인정보보호법 기준)
export default function Privacy() {
  return (
    <main className="shell">
      <TopBar title="개인정보처리방침" back />
      <section className="pad" style={{ paddingTop: 0 }}>
        <div className="card" style={{ borderColor: "var(--warn)" }}>
          <b>작성 필요</b>
          <p className="small">이 페이지는 자리표시입니다. 이 서비스가 수집하는 항목(이메일, 닉네임, 지역, 명상 취향, 예약·결제 기록, 메시지, 위치(선택))과 보유 기간, 제3자 제공(결제대행사 등), 파기 절차, 개인정보 보호책임자 연락처를 담은 실제 방침으로 교체해야 합니다.</p>
        </div>
      </section>
    </main>
  );
}
