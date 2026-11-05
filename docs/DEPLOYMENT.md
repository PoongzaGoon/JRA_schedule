# 배포 전 검토 및 운영 절차

현재 운영 배포는 승인되지 않았으며 실행하지 않았습니다. 다음은 검토용 절차입니다.

## 지원 환경

- Node.js 24 LTS, 쓰기 가능한 로컬 영속 디스크, 단일 애플리케이션 인스턴스.
- Docker 또는 Node 프로세스가 장시간 실행되는 서버/서비스.
- HTTPS는 호스팅 제공자 또는 reverse proxy에서 종료.
- SQLite 파일을 NFS/공유 네트워크 디스크로 여러 인스턴스가 동시에 쓰지 마세요.
- 정적 호스팅, Cloudflare Workers, Deno Deploy, 임시 디스크만 있는 서버리스 함수는 이 구현의 직접 배포 대상이 아닙니다.

## Docker (설정 예시, 이 세션에서 이미지 빌드는 실행하지 않음)

```sh
docker build -t jra-capture:0.1 .
docker volume create jra-capture-data
```

서버의 비밀값 파일 `production.env`를 저장소 밖에서 만들고 파일 권한을 제한합니다.

```dotenv
ADMIN_PASSWORD_HASH=scrypt:...실제 생성한 해시...
APP_ORIGIN=https://your-domain.example
```

```sh
docker run -d --name jra-capture --restart unless-stopped \
  --env-file /secure/path/production.env \
  -v jra-capture-data:/data \
  -p 127.0.0.1:3000:3000 jra-capture:0.1
```

역방향 프록시가 `https://your-domain.example`에서 `127.0.0.1:3000`으로 전달하도록 설정하세요. APP_ORIGIN은 브라우저 주소와 정확히 일치해야 합니다. HTTP 공개 노출로 Secure 쿠키를 우회하지 마세요.

앱은 X-Forwarded-For를 신뢰하지 않습니다. 프록시 뒤에서는 로그인 제한이 프록시 IP를 공유할 수 있습니다. 단일 관리자용으로 동작하지만, 다중 사용자 운영 시 신뢰 프록시 정책과 인증 체계를 보완해야 합니다.

## 승인 후 배포 검증

1. `/api/health`에서 configured=true와 storage/authentication/origin=true 확인.
2. 비로그인 상태에서 공개 화면은 읽을 수 있지만 게시·이력·복원은 401로 거부되는지 확인.
3. 가상 JSON으로 검증·미리보기. 이 단계에서 공개 화면이 바뀌지 않는지 확인.
4. 원본 대조 확인 후 게시 → 공개본 ID·시각 확인 → 이전 게시본 복원 테스트.
5. 프로세스/컨테이너를 재시작한 뒤 공개본과 이력 유지 확인.
6. 새 이미지로 재배포해도 같은 영속 볼륨을 사용하여 유지되는지 확인.
7. HTTPS 쿠키의 HttpOnly/Secure/SameSite 속성과 올바르지 않은 Origin의 403 확인.
8. 테스트 예시를 실제 일정과 혼동하지 않도록 표시 확인.

## 백업과 복구

게시 이력은 백업을 대체하지 않습니다. SQLite WAL 모드에서는 실행 중 메인 DB 파일 하나만 복사하면 안 됩니다. 이 프로토타입의 간단한 절차는 **앱을 정상 종료한 다음 DB 디렉터리 전체를 백업**하는 것입니다. 운영 중 무중단 백업이 필요하면 SQLite 온라인 백업 도구/볼륨 일관성 스냅샷을 별도로 도입하세요.

복구 시 앱을 중지하고 DB와 함께 백업된 WAL/SHM 파일을 동일한 세트로 복원한 뒤 권한·경로를 확인하고 시작합니다. 새 비밀번호 해시로 재시작하는 것만으로 기존 세션이 무효화되지는 않습니다. 비밀번호 유출 시 앱을 중지하고 SQLite `sessions` 테이블을 비운 뒤 비밀번호를 교체하세요.

## 운영 전에 남은 사항

실제 호스팅에서 HTTPS, 디스크 영속성, 정기 백업/복구와 접근 로그 정책을 검증해야 합니다. 단일 관리자에게 적합한 프로토타입이며 SSO/MFA, 계정별 권한, 비밀번호 복구, 감사 로그 외부 보관은 포함하지 않습니다. 자동 스크래핑, GPT API 비용, 원본 이미지 보관은 없습니다.
