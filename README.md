# live-check-in-demo

발표 현장에서 청중이 휴대폰으로 한 번 참여하고, 약 60초 동안 연결 상태를 유지하는 독립 샘플 애플리케이션입니다.

## 사용자 흐름

1. 청중이 `참여하기`를 한 번 누릅니다.
2. frontend가 API에서 임시 session ID를 받습니다.
3. frontend가 약 60초 동안 3초 간격으로 heartbeat를 순차적으로 보냅니다.
4. 버튼은 즉시 비활성화되고 `참여 중 · 연결됨` 상태가 표시됩니다.
5. 60초가 지나면 요청을 중단하고 `참여 완료` 상태를 표시합니다.

session ID와 만료 시각은 새로고침 중복 실행을 막기 위해 브라우저의 localStorage에 임시로 보관합니다. 서버는 사용자 개인정보를 받지 않으며, 세션은 최대 60초 동안만 메모리에 임시 보관하고 영속 저장하지 않습니다. 데이터베이스도 사용하지 않습니다.

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

## 환경 변수

`.env.example`을 복사해 로컬 환경을 구성합니다.

```bash
cp .env.example .env
```

- `PORT`: API가 듣는 포트. 기본값은 `8080`입니다.
- `WEB_ORIGIN`: CORS를 허용할 frontend origin. 기본값은 `http://localhost:5173`입니다.
- `VITE_API_BASE_URL`: Vite frontend가 호출할 API 주소. 기본값은 `http://localhost:8080`입니다.
- `INSTANCE_ID`: heartbeat 응답의 `servedBy` 값. 생략하면 hostname을 사용합니다.

## 로컬 실행

Node.js 22 이상과 npm이 필요합니다.

```bash
npm ci
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

개인정보 없이 임시 UUID session ID와 만료 시각을 반환합니다.

### `POST /api/check-ins/:sessionId/heartbeat`

유효한 세션이면 `ok`, `receivedAt`, `servedBy`를 반환합니다. 잘못되거나 만료된 session ID는 `400`을 반환합니다.

존재하지 않는 route는 일관된 JSON `404`, 잘못된 JSON은 `400`, 처리되지 않은 서버 오류는 일관된 JSON `500`으로 응답합니다. 애플리케이션 요청 로그에는 method와 status만 기록하며 token, IP, User-Agent와 원문 오류 메시지는 기록하지 않습니다. ALB나 WAF 같은 인프라 access log의 보존 정책은 배포 환경에서 별도로 관리해야 합니다.

## Docker

API 이미지는 multi-stage Dockerfile로 빌드합니다.

```bash
docker build -f apps/api/Dockerfile -t live-check-in-api .
docker run --rm -p 8080:8080 -e INSTANCE_ID=local-container live-check-in-api
curl http://localhost:8080/health
```

이미지는 production dependency만 포함하고 `node` non-root 사용자로 실행합니다. `EXPOSE 8080`과 container health check는 `/health`를 사용합니다.

## 배포 계약

frontend와 backend는 독립된 Application Unit입니다. `apps/web`은 Vite 정적 build 결과를 S3에 둘 수 있고, `apps/api`는 Docker image로 EC2 또는 ASG에서 실행할 수 있습니다. API 앞에 ALB를 두고 `/health`를 Target Group health check로 사용해도 됩니다.

이 샘플은 애플리케이션 소스만 제공하며 Terraform이나 AWS 리소스 정의는 포함하지 않습니다. API는 메모리에서 만료 세션만 관리하므로 DB, Redis, WebSocket, 인증이 필요하지 않습니다. 따라서 여러 API 인스턴스를 동시에 사용할 때는 ALB sticky session을 켜거나 단일 API 인스턴스로 운영해야 합니다. 세션은 60초 뒤 자동 정리되고, 프로세스별 활성 세션 수는 10,000개로 제한됩니다.

운영 환경에서는 ALB에서 TLS를 종료하고 `WEB_ORIGIN`, `VITE_API_BASE_URL`에 HTTPS origin을 사용하세요. 이 데모는 공개 인증 서비스가 아니므로 production 인증·rate limiting·공유 세션 저장소가 필요해지면 별도 설계가 필요합니다.


## SketchCatch 데모 배포 기준

이 저장소는 SketchCatch의 재현 가능한 golden-path 데모용 기준 레포입니다. Repository 분석과 템플릿 추천은 아래 계약을 정답으로 사용해야 합니다.

### 기대 분석 결과

- apps/web: React + TypeScript + Vite 정적 웹 애플리케이션
- apps/api: Express + Node.js + TypeScript 컨테이너 API
- API Dockerfile: apps/api/Dockerfile
- API 포트와 ALB health check: 8080, /health
- API 경로: /api
- frontend build output: apps/web/dist
- runtime environment: VITE_API_BASE_URL, WEB_ORIGIN, PORT, INSTANCE_ID

### 목표 AWS 배포 구조

apps/web은 S3와 CloudFront로 정적 배포합니다. apps/api는 Docker image를 ECR에 push한 뒤 ECS/Fargate Service로 실행합니다. ALB는 API의 /health를 Target Group health check로 사용하고, CloudWatch는 ECS와 ALB의 운영 지표와 로그를 수집합니다.

VITE_API_BASE_URL은 ALB의 HTTPS API origin을 가리키고, WEB_ORIGIN은 CloudFront의 HTTPS origin을 허용합니다. 발표용 기본값은 API Fargate Task 1개입니다. 이 앱의 세션은 메모리에 있으므로 scale-out은 데모 성공 조건이 아니며, 여러 Task를 사용할 때는 ALB sticky session 또는 공유 세션 저장소가 필요합니다.

### GitOps 데모 기준

main branch의 변경은 GitHub Actions가 Docker build, ECR push, 새 ECS Task Definition 등록, ECS Service 배포, ALB health check 순서로 반영합니다. 발표에서는 UI 문구 또는 버전 표기 한 줄만 바꿔 v2 배포를 검증합니다.

이 계약은 SketchCatch 데모를 위한 우선 배포 기준이며, 이 README의 일반적인 EC2/ASG 예시는 이 데모 경로에 적용하지 않습니다.
