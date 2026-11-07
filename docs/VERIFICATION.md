# Vercel 리팩토링 검증 결과

Node.js 24.22.1 / Linux / 시스템 Chromium에서 검증했습니다.

- `npm run build`: 통과. 프롬프트·JSON Schema·예시 생성, 서버/함수/브라우저 JS 구문 검사, `dist/` 생성.
- `npm test`: 31개 통과, 실패·건너뜀 없음. 스키마와 기존 동작에 더해 로컬 SQLite/libSQL API 동등성, 함수 인스턴스 간 공개본·세션·로그인 제한 공유, 동시 게시 충돌, 실제 DB 쓰기 실패 시 트랜잭션 롤백, 만료 처리, 초기화 실패 후 재시도, Vercel의 로컬 DB 대체 차단, 파싱된 요청 본문과 2MB 제한, 실제 함수 진입점 응답을 확인했습니다.
- `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium npm run test:e2e`: 통과.
- `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium npm run test:e2e:remote`: 통과. 비동기 libSQL 저장 계층으로 같은 시나리오를 실행했습니다.
- 브라우저 검증: 데스크톱/390px 모바일, 종마 필터, 원문·부가 열, 잘못된 입력 보존, 공개본 미변경, JSON 파일 업로드, 로컬 캡처 표시와 서버 미전송, HTML 형태 입력 비실행, 확인 전 게시 차단, 게시·복원·로그아웃. 브라우저 pageerror 없음.
- CI에 두 저장 계층의 브라우저 검증을 등록했습니다. CI 원격 실행 결과를 의미하지는 않습니다.
- `git diff --check`: 통과.

브라우저 실행 결과는 Git에서 제외된 `work/browser/`에 저장됩니다. `docs/review/` 이미지는 기존 검토 자료입니다.

## 검증 한계

libSQL 검증은 실제 클라이언트와 임시 파일 DB를 사용했습니다. 클라우드 Turso의 HTTPS 연결·토큰·서비스 상태, Vercel의 실제 빌드/라우팅/도메인·HTTPS, 운영 재배포 후 영속성, 운영 백업 복구는 아직 실행하지 않았습니다. Vercel/Turso 프로젝트 연결 정보가 현재 환경에 없습니다. [배포 안내](DEPLOYMENT.md)의 환경변수 설정과 배포 후 검증이 필요합니다.

실제 출주표의 전사·번역 정확성은 검증하지 않았습니다. Docker 이미지 빌드는 이번 리팩토링 검증 범위에 포함하지 않았습니다.
