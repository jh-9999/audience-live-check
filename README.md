# live-check-in-demo

발표 현장에서 청중이 휴대폰으로 한 번 참여하고, 약 60초 동안 연결 상태를 유지하는 독립 샘플 애플리케이션입니다.

## 사용자 흐름

1. 청중이 `참여하기`를 한 번 누릅니다.
2. frontend가 API에서 약 60초 동안 유효한 서명된 임시 session token을 받습니다.
3. frontend가 token을 `Authorization` 헤더에 넣어 약 60초 동안 3초 간격으로 heartbeat를 순차적으로 보냅니다.
4. 버튼은 즉시 비활성화되고 `참여 중 · 연결됨` 상태가 표시됩니다.
5. 60초가 지나면 요청을 중단하고 `참여 완료` 상태를 표시합니다.

session token과 만료 시각은 새로고침 복구를 위해 브라우저의 localStorage에 임시로 보관하고 만료 즉시 삭제합니다. token payload에는 무작위 session ID, 발급 시각, 만료 시각만 있으며 개인정보, IP, User-Agent는 포함하지 않습니다. API는 session 상태를 저장하지 않으며 데이터베이스와 Redis도 사용하지 않습니다.

## 폴더 구조

```text
live-check-in-demo/
├── apps/
│   ├── web/
│   │   ├── src/
│   │   ├── index.html
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── vite.config.ts
│   └── api/
│       ├── src/
│       ├── package.json
│       ├── tsconfig.json
│       └── Dockerfile
├── packages/
│   └── shared/
│       ├── src/
│       ├── package.json
│       └── tsconfig.json
├── .env.example
├── package.json
├── package-lock.json
├── README.md
└── tsconfig.base.json
```

## Application Units

### web

- path: `apps/web`
- framework: React
- language: TypeScript
- build tool: Vite
- install command: `npm ci`
- build command: `npm run build --workspace apps/web`
- build output: `apps/web/dist`
- required environment variable: `VITE_API_BASE_URL`
- hosting: Vite build output은 S3 같은 static hosting에 배포할 수 있습니다.

### api

- path: `apps/api`
- framework: Express
- runtime: Node.js
- language: TypeScript
- install command: `npm ci`
- build command: `npm run build --workspace apps/api`
- start command: `npm run start --workspace apps/api`
- port: `8080` 기본값, `PORT`로 변경 가능
- health check path: `/health`
- application API prefix: `/api`
- Dockerfile path: `apps/api/Dockerfile`
- container entrypoint: `npm run start --workspace apps/api`
- required runtime environment variables: `WEB_ORIGIN`, `PORT`, `INSTANCE_ID`, `CHECK_IN_SIGNING_SECRET`

## 환경 변수

`.env.example`은 필요한 변수 이름과 로컬 기본값을 보여주는 참고 파일입니다. 로컬 shell에서 export하거나 SketchCatch/AWS 배포 설정으로 주입하세요.

- `PORT`: API가 듣는 포트. 기본값은 `8080`입니다.
- `WEB_ORIGIN`: CORS를 허용할 frontend origin. 기본값은 `http://localhost:5173`입니다.
- `VITE_API_BASE_URL`: Vite frontend가 호출할 API 주소. 기본값은 `http://localhost:8080`입니다.
- `INSTANCE_ID`: heartbeat 응답의 `servedBy` 값. 생략하면 hostname을 사용합니다.
- `CHECK_IN_SIGNING_SECRET`: HMAC-SHA256 session token 서명 키. production에서는 UTF-8 기준 최소 32바이트가 필수입니다.

로컬 또는 production용 값을 새로 만들 때 다음 명령을 사용합니다. 생성된 값은 Git에 저장하지 마세요.

```bash
openssl rand -base64 32
```

production API는 `CHECK_IN_SIGNING_SECRET`이 없거나 32바이트보다 짧으면 시작하지 않습니다. 개발 환경에서 변수가 없으면 안전하지 않은 개발 전용 기본값과 명확한 경고를 사용하므로 배포 환경에서는 반드시 명시적으로 설정해야 합니다.

## 로컬 실행

Node.js 22 이상과 npm이 필요합니다.

```bash
npm ci
export CHECK_IN_SIGNING_SECRET="$(openssl rand -base64 32)"
npm run dev
```

frontend는 `http://localhost:5173`, API는 `http://localhost:8080`에서 실행됩니다.

## 빌드, 타입 검사, lint, 테스트

```bash
npm run build
npm run typecheck
npm run lint
npm test
```

전체 build는 shared 타입을 먼저 만들고 API와 frontend를 각각 빌드합니다. API는 `dist/main.js`, frontend는 `apps/web/dist`에 결과를 만듭니다.

## API endpoints

### `GET /health`

```json
{
  "status": "ok",
  "service": "live-check-in-api",
  "version": "1.0.0"
}
```

### `POST /api/check-ins`

개인정보 없이 HMAC-SHA256으로 서명한 opaque session token, 만료 시각, heartbeat 간격을 반환합니다. 무작위 UUID session ID는 token payload 안에만 들어가며 URL에는 노출되지 않습니다.

```json
{
  "sessionToken": "<opaque-signed-token>",
  "expiresAt": "2026-07-20T00:01:00.000Z",
  "heartbeatIntervalMs": 3000
}
```

### `POST /api/check-ins/heartbeat`

token은 URL path나 query가 아니라 Bearer Authorization 헤더로 전달합니다.

```http
POST /api/check-ins/heartbeat HTTP/1.1
Authorization: Bearer <sessionToken>
Content-Type: application/json
```

유효한 token이면 `ok`, `receivedAt`, `servedBy`를 반환합니다. `servedBy`는 `INSTANCE_ID` 또는 hostname이므로 개발 환경에서 요청을 처리한 Task를 확인할 수 있습니다. Authorization 누락, 서명 불일치, 변조, 만료 token은 동일한 JSON 형식의 `401 invalid_session`으로 거절합니다.

존재하지 않는 route는 일관된 JSON `404`, 잘못된 JSON은 `400`, 처리되지 않은 서버 오류는 일관된 JSON `500`으로 응답합니다. CORS는 `Authorization`과 `Content-Type`을 허용하고 요청 body 제한은 `16kb`입니다. 애플리케이션 요청 로그에는 method와 status만 기록하며 token, secret, IP, User-Agent와 원문 오류 메시지는 기록하지 않습니다. ALB나 WAF 같은 인프라 access log의 보존 정책은 배포 환경에서 별도로 관리해야 합니다.

## Docker

API 이미지는 multi-stage Dockerfile로 빌드합니다.

```bash
docker build -f apps/api/Dockerfile -t live-check-in-api .
export CHECK_IN_SIGNING_SECRET="$(openssl rand -base64 32)"
docker run --rm -p 8080:8080 \
  -e INSTANCE_ID=local-container \
  -e CHECK_IN_SIGNING_SECRET \
  live-check-in-api
curl http://localhost:8080/health
```

이미지는 production dependency만 포함하고 `node` non-root 사용자로 실행합니다. `EXPOSE 8080`과 container health check는 `/health`를 사용합니다.

## 배포 계약

frontend와 backend는 독립된 Application Unit입니다. `apps/web`은 Vite 정적 build 결과를 S3/CloudFront에 배포하고, `apps/api`는 Docker image를 ECS/Fargate Service로 실행할 수 있습니다. API 앞의 ALB는 `/health`를 Target Group health check로 사용합니다.

API는 공유 상태가 없는 서명 token을 사용합니다. Task A에서 발급한 token도 같은 `CHECK_IN_SIGNING_SECRET`을 사용하는 Task B 또는 C가 독립적으로 검증할 수 있으므로 Fargate가 1개에서 최대 3개로 확장되어도 ALB sticky session, Redis, 데이터베이스가 필요하지 않습니다. production에서는 AWS Secrets Manager 같은 비밀 저장소를 통해 모든 Task에 정확히 같은 secret을 주입해야 합니다. 서로 다른 secret을 쓰는 Task는 의도적으로 서로의 token을 거절합니다.

이 샘플은 애플리케이션 소스만 제공하며 Terraform이나 실제 AWS 리소스 정의는 포함하지 않습니다. 운영 환경에서는 ALB에서 TLS를 종료하고 `WEB_ORIGIN`, `VITE_API_BASE_URL`에 HTTPS origin을 사용하세요. 이 token은 60초짜리 데모 참여 확인용이며 사용자 인증 token이 아닙니다. 공개 서비스 수준의 인증이나 rate limiting이 필요하면 별도 설계가 필요합니다.

## SketchCatch 데모 배포 기준

이 저장소는 SketchCatch의 재현 가능한 golden-path 데모용 기준 레포입니다. Repository 분석과 템플릿 추천은 아래 계약을 정답으로 사용해야 합니다.

### 기대 분석 결과

- apps/web: React + TypeScript + Vite 정적 웹 애플리케이션
- apps/api: Express + Node.js + TypeScript 컨테이너 API
- API Dockerfile: apps/api/Dockerfile
- API 포트와 ALB health check: 8080, /health
- API 경로: /api
- frontend build output: apps/web/dist
- deployment configuration (web build + API runtime): VITE_API_BASE_URL, WEB_ORIGIN, PORT, INSTANCE_ID, CHECK_IN_SIGNING_SECRET

### 목표 AWS 배포 구조

apps/web은 S3와 CloudFront로 정적 배포합니다. apps/api는 Docker image를 ECR에 push한 뒤 ECS/Fargate Service로 실행합니다. ALB는 API의 /health를 Target Group health check로 사용하고, CloudWatch는 ECS와 ALB의 운영 지표와 로그를 수집합니다.

`VITE_API_BASE_URL`은 ALB의 HTTPS API origin을 가리키고, `WEB_ORIGIN`은 CloudFront의 HTTPS origin을 허용합니다. `PORT`는 컨테이너 포트와 맞추고, `INSTANCE_ID`는 각 Task를 구분할 값으로 설정합니다. `CHECK_IN_SIGNING_SECRET`은 Secrets Manager 등에서 가져온 동일한 값을 모든 Task에 주입합니다. 발표용 기본값은 API Fargate Task 1개이며, 최대 3개로 확장해도 sticky session이나 공유 session 저장소 없이 heartbeat가 계속됩니다.

버튼 한 번은 최초 token 발급 요청 1회와 약 60초 동안 3초 간격의 순차 heartbeat 약 20회를 만듭니다. heartbeat 응답의 `servedBy`로 다른 Task가 같은 token을 검증하는지 확인할 수 있고, 이 요청은 ALB 요청 수와 CloudWatch 로그·지표를 관측하는 데 사용할 수 있습니다.

### GitOps 데모 기준

main branch의 변경은 GitHub Actions가 Docker build, ECR push, 새 ECS Task Definition 등록, ECS Service 배포, ALB health check 순서로 반영합니다. 발표에서는 UI 문구 또는 버전 표기 한 줄만 바꿔 v2 배포를 검증합니다.

이 계약은 SketchCatch 데모를 위한 우선 배포 기준이며, 이 README의 일반적인 EC2/ASG 예시는 이 데모 경로에 적용하지 않습니다.
