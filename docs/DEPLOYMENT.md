# Vercel 배포 및 운영

이 프로젝트는 Vercel의 정적 호스팅과 Node.js Functions, Turso 관리형 libSQL 데이터베이스를 사용합니다. 개인 컴퓨터나 상시 실행 Node 서버는 필요하지 않습니다. 이 문서는 배포 가능한 설정을 설명하며, 실제 Vercel/Turso 운영 연결과 배포는 아직 검증하지 않았습니다.

## 구성

- `npm run build` → `dist/`: 프론트엔드 HTML/CSS/JS와 스키마·예시 파일.
- `/`와 `/admin`: Vercel이 정적 파일을 제공합니다.
- `/api/*` → `api/index.js`: 같은 도메인의 Node.js Function이 기존 인증·검증·게시·복원 API를 처리합니다.
- Turso: 게시본, 이력, 서버 세션, 로그인 시도 제한을 영속 저장합니다. DB 토큰은 브라우저로 보내지 않습니다.
- 쓰기 트랜잭션에서 현재 게시본 ID를 확인한 뒤 이력과 공개 포인터를 함께 저장합니다. 다른 인스턴스가 먼저 게시하면 409를 반환합니다.
- Vercel에서는 `DATABASE_PATH`를 설정해도 로컬 SQLite로 대체하지 않습니다. 원격 DB 오류 시 빈 DB를 생성하거나 게시를 성공 처리하지 않습니다.

## 1. Turso 준비

Turso 대시보드에서 운영 DB를 만들고 DB URL과 쓰기 토큰을 발급하세요. 지역은 가능한 한 Vercel 함수 실행 지역에 가깝게 선택하세요. 원격 DB는 쓰기 가능한 기본 DB URL을 사용하며 로컬 복제본/embedded replica는 사용하지 않습니다.

첫 API 요청에서 필요한 테이블을 `CREATE TABLE IF NOT EXISTS`로 만듭니다. 스키마는 `src/store-schema.js`에 있습니다. 기존 로컬 SQLite 데이터는 자동으로 이전되지 않습니다. 이미 게시한 데이터가 있다면 배포 전에 DB 전체를 별도 백업하고 Turso의 SQLite import 절차로 이전한 뒤 게시본·이력 수를 비교하세요. 기존 DB를 삭제하지 마세요.

비밀값은 채팅이나 Git에 올리지 말고 Vercel 설정에 직접 입력하세요. 서비스별 플랜과 저장/요청 한도는 계정에서 확인하세요.

## 2. Vercel 프로젝트와 환경변수

GitHub의 `PoongzaGoon/JRA_schedule` 저장소를 Vercel에 Import합니다.

- Root Directory: 저장소 루트
- Framework Preset: Other
- Node.js Version: 24.x (`package.json`에서도 지정)
- Install Command: `npm ci`
- Build Command: `npm run build`
- Output Directory: `dist`

빌드/정적 헤더/API 라우팅은 커밋된 `vercel.json`이 설정합니다. 별도 프론트엔드 API URL이나 CORS 설정은 필요하지 않습니다.

Project Settings → Environment Variables에 다음을 입력하세요.

| 변수 | Production 값 |
| --- | --- |
| `TURSO_DATABASE_URL` | 운영 DB의 `libsql://…` 또는 `https://…` URL |
| `TURSO_AUTH_TOKEN` | 해당 DB의 쓰기 토큰. Sensitive로 저장 |
| `ADMIN_PASSWORD_HASH` | `npm run admin:password`로 생성한 전체 `scrypt:…` 문자열. Sensitive로 저장 |
| `APP_ORIGIN` | 사용자가 방문할 정확한 HTTPS origin, 예: `https://your-project.vercel.app` |

`NODE_ENV=production`과 `VERCEL=1`은 Vercel 런타임이 제공합니다. `HOST`, `PORT`, `DATABASE_PATH`는 Vercel에서 설정하지 않습니다. `APP_ORIGIN`에는 경로·쿼리·와일드카드를 넣지 마세요. 비밀번호 원문을 환경변수로 저장하지 않습니다.

도메인을 아직 모르면 프로젝트를 먼저 생성해 Production 도메인을 확인하고 환경변수를 설정한 뒤 배포/재배포하세요. `APP_ORIGIN`이 없으면 정적 화면은 표시되어도 관리자 쓰기는 차단됩니다. 도메인을 바꾸면 `APP_ORIGIN` 변경과 재배포가 필요합니다. 하나의 관리자 origin을 사용하세요.

Preview에는 운영 DB 토큰을 연결하지 마세요. 별도 테스트 DB/비밀번호와 해당 Preview의 정확한 origin을 설정하거나, DB·인증 변수를 비워 게시를 차단한 상태로 두세요. 요청의 Host를 믿어 허용 origin을 자동 생성하지 않습니다.

## 3. 배포 확인

배포 설정을 저장한 뒤 Vercel의 Deploy/Redeploy로 배포합니다. CLI를 사용하는 경우 Vercel에 인증하고 프로젝트를 연결한 뒤 `vercel deploy`로 Preview를 확인하고 `vercel deploy --prod`로 운영 배포할 수 있습니다. 이 저장소에는 인증 토큰이나 특정 Vercel 프로젝트 ID가 포함되어 있지 않습니다.

1. `/`, `/admin`, `/app.js`가 정상 응답하고 새로고침으로 `/admin`에 직접 접근할 수 있는지 확인.
2. `/api/health`에서 `configured`, `storage`, `authentication`, `origin`이 모두 `true`인지 확인. 원격 스키마 초기화도 이 요청에서 실행되므로 DB 접근 오류를 확인할 수 있습니다.
3. 비로그인 게시·이력·복원이 401, 잘못된 Origin/CSRF가 403으로 거부되는지 확인.
4. 관리자 로그인 → JSON 검증·미리보기 → 확인 후 게시 → 공개 화면에서 게시본 확인 → 이전 게시본 복원.
5. 재배포 후 공개본·이력·세션이 유지되는지 확인. 캐시된 API 응답을 사용하지 않습니다.
6. HTTPS 쿠키의 HttpOnly/Secure/SameSite 속성 확인. Vercel에서만 플랫폼이 제공하는 `X-Forwarded-For`를 로그인 제한 키에 사용하며 일반 로컬 서버는 소켓 IP를 사용합니다.

`configured=false`는 필수 설정 누락입니다. 500/503은 DB 접근/서버 설정을 점검하세요. Vercel Functions 로그 및 Turso 상태에서 원인을 확인하되 토큰이나 비밀번호를 로그에 출력하지 마세요.

## 개발 및 검증

```sh
npm ci
npm run build
npm test
npx playwright install chromium
npm run test:e2e
npm run test:e2e:remote
```

기존 Chromium을 사용하려면 `PLAYWRIGHT_CHROMIUM_EXECUTABLE`을 지정하세요. API 테스트는 로컬 SQLite와 libSQL 두 저장 계층에서 동일한 인증·게시·복원·재시작 시나리오를 실행합니다. libSQL 테스트는 임시 파일 DB와 실제 클라이언트를 사용하며, 클라우드 Turso의 네트워크/인증 상태를 검증하는 테스트는 아닙니다. 두 브라우저 시나리오는 각각 로컬 SQLite와 비동기 libSQL 계층을 사용합니다. 실제 Vercel 라우팅·HTTPS·Turso 토큰은 위 배포 확인이 별도로 필요합니다.

로컬에서 `.env.example`을 `.env`로 복사하고 `npm run admin:password`로 해시를 생성한 뒤 `npm start` 또는 `npm run dev`로 실행하세요. 원격 DB 변수 두 개가 모두 설정되면 `DATABASE_PATH`보다 우선합니다. 로컬 작업이 운영 데이터를 바꾸지 않도록 개발용 DB만 연결하세요.

## 백업 및 인증 교체

Turso의 백업/복구 기능 또는 공식 DB export 절차로 별도 백업을 만들고 복구를 확인하세요. 게시 이력은 독립 백업을 대신하지 않습니다. 운영 DB와 Preview DB의 복구 대상을 구분하세요.

비밀번호 해시 교체만으로 기존 DB 세션은 무효화되지 않습니다. 유출 시 서버의 관리자 접근을 중지하고 DB의 `sessions` 테이블을 비운 뒤 해시를 교체·재배포하세요. DB 토큰 유출 시 Turso에서 토큰을 폐기하고 Vercel 변수 교체 후 재배포하세요.

## 기존 Docker/단일 서버 실행

Node 24 + 로컬 SQLite 실행도 유지됩니다. Docker에서는 `DATABASE_PATH=/data/schedule.sqlite`와 영속 볼륨, `APP_ORIGIN=https://실제도메인`, `ADMIN_PASSWORD_HASH`를 설정하고 `HOST=0.0.0.0`으로 실행하세요. SQLite 파일을 여러 서버가 공유하지 마세요. 이 방식의 백업은 앱을 정상 종료한 다음 DB/WAL/SHM이 포함된 디렉터리 전체를 보존하거나 SQLite 온라인 백업을 사용합니다.
