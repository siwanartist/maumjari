# 마음자리 — 명상 지도자 매칭 서비스

취향 진단(온보딩)으로 맞춤 명상 지도자를 추천하고, 클래스 예약·결제·승인·환불·정산까지 처리하는 웹 서비스입니다.

## 기술 구성

| 영역 | 선택 |
|---|---|
| 프론트엔드 + 백엔드 | Next.js 14 (App Router) + TypeScript — 한 프로젝트 |
| 데이터베이스 | PostgreSQL + Drizzle ORM |
| 인증 | 이메일/비밀번호 (bcrypt) + 서명된 세션 쿠키 (httpOnly) |
| 결제 | PG 어댑터 구조 (현재 테스트용 mock) — `docs/PAYMENT_INTEGRATION.md` |
| 알림 | 인앱 알림 + 이메일 어댑터 (현재 로그 출력) |
| 주기 작업 | `/api/cron/sweep` 을 10분마다 호출 (GitHub Actions 포함) |

## 로컬에서 실행하기

필요한 것: Node.js 20 이상, PostgreSQL 14 이상

```bash
npm install
cp .env.example .env          # .env 를 열어 DATABASE_URL, SESSION_SECRET 등 입력
npm run db:migrate            # 테이블 생성
npm run db:seed -- --demo     # 관리자 + 데모 데이터 (개발용)
npm run dev                   # http://localhost:3000
```

### 데모 계정 (`--demo` 로 시드한 경우)

| 역할 | 이메일 | 비밀번호 |
|---|---|---|
| 관리자 | `.env` 의 ADMIN_EMAIL | `.env` 의 ADMIN_PASSWORD |
| 회원 | demo@demo.local | demo1234! |
| 지도자 | doyun@demo.local (seoyun / haneul / jimin 도 동일) | demo1234! |
| 심사 대기 지도자 | applicant@demo.local | demo1234! |

## 주요 명령어

| 명령 | 설명 |
|---|---|
| `npm run dev` | 개발 서버 |
| `npm run build` / `npm start` | 운영 빌드 / 실행 |
| `npm run typecheck` | 타입 검사 |
| `npm run db:generate` | 스키마(`src/db/schema.ts`) 변경 후 마이그레이션 파일 생성 |
| `npm run db:migrate` | 마이그레이션 적용 |
| `npm run db:seed` | 관리자 계정 생성 (`-- --demo` 추가 시 데모 데이터) |
| `npm run test:smoke` | 핵심 시나리오 54개 자동 점검 (개발 DB 전용) |

## 문서

- `docs/DEPLOY.md` — 서버에 올리는 방법 (단계별) + 오픈 전 체크리스트
- `docs/TEST_SCENARIOS.md` — 공개 전 반드시 해볼 테스트
- `docs/PAYMENT_INTEGRATION.md` — 실제 PG 연결 방법
- `docs/ARCHITECTURE.md` — 구조, 예약 상태 흐름, 설계 결정

## 폴더 구조

```
src/
  app/            화면(page.tsx)과 API(api/**/route.ts)
  components/     공통 UI
  db/             스키마, DB 연결, 마이그레이션, 시드
  lib/            핵심 로직 — booking.ts(예약·결제·환불·정산), policy.ts(환불 규정),
                  recommend.ts(추천), payments/(PG 어댑터), notify.ts(알림)
drizzle/          마이그레이션 SQL
scripts/          자동 점검 스크립트
```
