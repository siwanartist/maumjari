# 배포 가이드

## 추천 구성과 이유

**Vercel(앱) + 관리형 PostgreSQL(Neon 또는 Supabase) + GitHub Actions(10분 주기 작업)**

- Next.js 제작사가 운영하는 호스팅이라 설정이 거의 없고, HTTPS·도메인 연결·배포 롤백이 기본 제공됩니다.
- 관리형 DB는 백업·복구를 대신 해줍니다. 직접 서버에 DB를 설치하면 백업 실패 시 예약·결제 기록을 잃을 수 있습니다.
- 초기 소규모 트래픽은 대부분 무료 또는 저렴한 요금제로 시작할 수 있습니다. (요금은 각 사이트에서 최신 정보 확인)
- 10분 주기 작업은 호스팅 요금제와 무관하게 동작하도록 GitHub Actions 로 호출합니다.

> 다른 곳(AWS, 국내 클라우드, 자체 서버)도 가능합니다. Node.js 20 이상 + PostgreSQL 만 있으면 `npm run build && npm start` 로 동작합니다.

---

## 1단계 — 코드를 GitHub 에 올리기

1. github.com 가입 → New repository → 이름 `maumjari`, **Private** 선택
2. 이 폴더에서:
   ```bash
   git init && git add . && git commit -m "init"
   git branch -M main
   git remote add origin https://github.com/<내아이디>/maumjari.git
   git push -u origin main
   ```
   `.env` 파일은 `.gitignore` 에 있어 올라가지 않습니다. (비밀키 유출 방지 — 절대 올리지 마세요)

## 2단계 — 데이터베이스 만들기

1. Neon(neon.tech) 또는 Supabase(supabase.com) 가입 → 새 프로젝트 생성 (리전: 서울/도쿄 등 가까운 곳)
2. 연결 문자열(Connection string) 복사 — `postgresql://...?sslmode=require` 형태
   - 서버리스 환경이므로 **pooled(풀링) 연결 문자열**이 제공되면 그것을 사용
3. 내 컴퓨터에서 운영 DB에 테이블과 관리자 계정 생성:
   ```bash
   DATABASE_URL="복사한 연결문자열" ADMIN_EMAIL="내이메일" ADMIN_PASSWORD="강력한비밀번호" npm run db:migrate
   DATABASE_URL="복사한 연결문자열" ADMIN_EMAIL="내이메일" ADMIN_PASSWORD="강력한비밀번호" npm run db:seed
   ```
   ⚠️ 운영 DB에는 `--demo` 를 붙이지 마세요.

## 3단계 — Vercel 에 배포

1. vercel.com 가입(GitHub 계정으로) → Add New Project → `maumjari` 저장소 선택
2. **Environment Variables** 에 아래 값 입력 (`.env.example` 참고)

   | 이름 | 값 |
   |---|---|
   | DATABASE_URL | 2단계의 연결 문자열 |
   | SESSION_SECRET | 무작위 48자 이상 (`openssl rand -base64 48`) |
   | APP_URL | `https://내도메인` (처음엔 Vercel이 준 주소) |
   | PAYMENT_PROVIDER | PG 연동 전: `mock` |
   | ALLOW_MOCK_PAYMENT | 테스트 공개 기간에만 `true`. **실결제 오픈 시 삭제** |
   | PLATFORM_FEE_RATE | `0.15` |
   | BOOKING_RESPONSE_HOURS | `24` |
   | EMAIL_PROVIDER / EMAIL_FROM | `console` / 발신 주소 |
   | CRON_SECRET | 무작위 문자열 |

3. 빌드 명령은 `vercel.json` 에 이미 설정되어 있습니다 (배포할 때마다 DB 스키마 반영 + 관리자 계정 확인). ADMIN_EMAIL, ADMIN_PASSWORD 환경변수도 반드시 입력하세요.
4. Deploy → 발급된 주소로 접속 확인

> 안전장치: 운영 환경에서 `PAYMENT_PROVIDER=mock` 인데 `ALLOW_MOCK_PAYMENT=true` 가 없으면 결제가 오류로 막힙니다. 가짜 결제가 켜진 채 실서비스가 열리는 사고를 막기 위함입니다.

## 4단계 — 10분 주기 작업 켜기

GitHub 저장소 → Settings → Secrets and variables → Actions → New repository secret
- `APP_URL` = 배포 주소 (끝에 `/` 없이)
- `CRON_SECRET` = Vercel 에 넣은 값과 동일

Actions 탭 → booking-sweep → Run workflow 로 한 번 실행해 초록색 체크가 뜨는지 확인합니다.
(이 작업이 멈춰도 사용자가 예약 목록을 열 때 기한 초과 건은 자동 정리되지만, **리마인드 알림은 이 작업이 있어야 나갑니다**.)

## 5단계 — 도메인 연결

1. 도메인 구입 (가비아, 후이즈 등)
2. Vercel 프로젝트 → Settings → Domains → 도메인 추가 → 안내되는 DNS 값을 도메인 업체 관리 화면에 입력
3. HTTPS 인증서는 자동 발급됩니다. `APP_URL` 을 새 도메인으로 바꾸고 재배포.

---

## 오픈 전 체크리스트

### 법적·사업
- [ ] 사업자등록, 통신판매업 신고
- [ ] `/terms`, `/privacy` 실제 내용으로 교체 (현재 "작성 필요" 자리표시)
- [ ] 화면 하단 등에 사업자 정보 표시 (상호, 대표자, 사업자번호, 통신판매업 번호, 연락처) — 전자상거래법 요구사항
- [ ] 취소·환불 규정(`src/lib/policy.ts`)의 법률 검토 — 청약철회 규정과의 관계
- [ ] 지도자 대금 정산 구조에 대한 PG사·세무 확인 (중개 판매 시 필요한 계약 형태)

### 결제
- [ ] PG 계약 및 어댑터 연결 (`docs/PAYMENT_INTEGRATION.md`)
- [ ] PG 테스트 키로 결제 → 승인 → 거절 환불 → 부분 환불 전 과정 확인
- [ ] 실결제 키로 교체 후 **소액 실결제 → 환불** 직접 확인
- [ ] `ALLOW_MOCK_PAYMENT` 환경변수 삭제

### 보안
- [ ] `SESSION_SECRET`, `CRON_SECRET` 이 추측 불가능한 무작위 값인지
- [ ] `.env` 가 GitHub 에 올라가지 않았는지 (저장소에서 직접 확인)
- [ ] 관리자 비밀번호 강력하게 설정
- [ ] 로그인 시도 횟수 제한 추가 권장 (현재 미구현 — 무차별 대입 방지)

### 운영
- [ ] DB 자동 백업이 켜져 있는지 확인, 복구 방법 한 번 읽어두기
- [ ] 에러 알림 도구 연결 권장 (현재는 호스팅 로그에만 기록 — `[CRITICAL]` 로 시작하는 로그는 수동 환불이 필요한 건)
- [ ] 이메일 발송 서비스 연결 (현재 이메일은 로그 출력만, 인앱 알림은 정상 동작)
- [ ] `docs/TEST_SCENARIOS.md` 전 항목을 실제 배포 주소에서 수행
