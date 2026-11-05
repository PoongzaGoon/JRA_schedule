# 검증 결과

- Node.js 24.19.0, Linux.
- `npm run build`: 통과. 프롬프트·JSON Schema·예시 자료 자동 생성 및 서버/브라우저 JS 구문 검사, dist 복사.
- `npm test`: 16개 통과. JSON 스키마·중복·null·번역 출처·프롬프트 일치, 서버 인증/권한/CSRF/Origin, 게시 전 검증의 읽기 전용성, 충돌·트랜잭션 롤백, 게시·복원 이력, 재시작 후 영속성, 로그아웃, 로그인 제한, 운영 HTTPS 설정.
- `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium npm run test:e2e`: 통과. 실제 Chromium에서 데스크톱/390px 모바일, 종마 필터, 원문·부가 열, 잘못된 입력 보존, 검증 전 공개본 미변경, JSON 파일 업로드, 브라우저 내 캡처 표시와 서버 미전송, HTML 형태 입력의 비실행, 확인 체크 전 게시 차단, 두 차례 게시·이전 게시본 복원·로그아웃 확인. 브라우저 pageerror 없음.
- `npm audit --omit=dev`: 취약점 0개.
- CI는 Ubuntu 24.04와 Node 24를 사용하며 빌드·서버 테스트·Chromium E2E를 실행합니다.
- `git diff --check`: 통과.
- 기존 저장소에 변경 없음.

화면 자료: [데스크톱](review/public-desktop.png), [모바일](review/public-mobile.png), [관리자](review/admin-desktop.png).

## 검증 한계

브라우저 테스트는 독립 임시 DB와 테스트용 비밀번호, 가상 JSON을 사용합니다. 실제 출주표의 전사·번역 정확성은 검증하지 않았습니다. 운영 배포·Docker 이미지 빌드·제공자 HTTPS/영속 디스크·실제 백업 복구는 이 세션에서 실행하지 않았습니다. 운영 전 [배포 절차](DEPLOYMENT.md)에 따라 검증해야 합니다.
