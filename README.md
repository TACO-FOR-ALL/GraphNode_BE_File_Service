# GraphNode File Service

AI export ZIP import MSA. GraphNode BFF만 `/internal/*` 로 호출합니다.

## 기능

- OpenAI export ZIP → 대화·첨부 파싱
- presigned PUT staging → worker → S3 `import-files/` + Postgres
- 첨부 presigned GET (`/internal/files/:fileId/presign`)

## 업로드 (prod)

1. BFF `POST /v1/imports/init`
2. FE → S3 `import-staging/.../source.zip` (presigned PUT)
3. BFF `POST /v1/imports/:jobId/start` → SQS worker

## 배포

[`docs/INFRA_AWS.md`](docs/INFRA_AWS.md) — ECS, RDS, SQS, Secrets, **S3 staging TTL 7일**.

## Internal API

| Method | Path |
|--------|------|
| GET | `/internal/import-providers` |
| POST | `/internal/imports/init` |
| POST | `/internal/imports/:jobId/start` |
| GET | `/internal/imports/:jobId` |
| GET | `/internal/imports/:jobId/result` | (legacy) 전체 JSON HTTP |
| GET | `/internal/imports/:jobId/result-ref` | S3 key만 (BE worker용) |
| POST | `/internal/imports/:jobId/finalize/claim` | 멱등 finalize claim |
| POST | `/internal/imports/:jobId/finalize/complete` | Mongo 저장 완료 |
| POST | `/internal/imports/:jobId/finalize/fail` | finalize 실패 (재시도 가능) |
| DELETE | `/internal/imports/:jobId` |
| GET | `/internal/files/:fileId/presign` |

Headers: `X-Internal-Api-Key`, `X-User-Id`

## Local dev

```bash
cp .env.example .env
# DATABASE_URL, INTERNAL_API_KEY, (선택) AWS/SQS 값 수정

npm ci
npm run db:generate
npm run db:push          # Postgres 스키마 적용
npm run dev              # API :3001
npm run dev:worker       # SQS worker (별 터미널)
```

BFF 연동 테스트 시 GraphNode BE `.env` 의 `FILE_SERVICE_BASE_URL=http://localhost:3001`, `FILE_SERVICE_INTERNAL_API_KEY` 를 File Service `INTERNAL_API_KEY` 와 맞춥니다.

## Build

```bash
npm ci
npm run db:generate
npm run build
npm run start          # API
npm run start:worker   # SQS consumer
```
