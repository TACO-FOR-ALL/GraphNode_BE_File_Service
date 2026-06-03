# File Service — Import Architecture

GraphNode BFF가 인증 후 `/internal/*` 만 호출합니다.

## Endpoints (internal)

| Method | Path |
|--------|------|
| GET | `/internal/import-providers` |
| POST | `/internal/imports/init` |
| POST | `/internal/imports/:jobId/start` |
| GET | `/internal/imports/:jobId` |
| GET | `/internal/imports/:jobId/result` |
| DELETE | `/internal/imports/:jobId` |
| GET | `/internal/files/:fileId/presign` |

Headers: `X-Internal-Api-Key`, `X-User-Id`

## Providers

- `openai` — implemented
- `gemini`, `claude`, `deepseek` — stub (501)

## S3

| Prefix | 보관 |
|--------|------|
| `import-staging/` | Lifecycle **7일** |
| `import-files/` | 영구 |
| `import-results/` | 영구 |

배포: [`docs/INFRA_AWS.md`](../INFRA_AWS.md)
