# 구현 체크리스트

## File Service — 완료

- [x] OpenAI extractor + SQS worker + presigned PUT upload
- [x] Internal API + Postgres + S3 prefixes
- [x] ECS task definition 템플릿
- [x] Staging S3 Lifecycle 템플릿 (`infra/s3-lifecycle-import-staging.json`)

## GraphNode BFF — 완료

- [x] `FileServiceClient` + `/v1/imports/*` + finalize → MongoDB
- [x] SDK `uploadImport` / presign

## 배포 (운영)

- [ ] File Service Git push + ECR build
- [ ] RDS, SQS prod, Secrets, ECS API/Worker, Cloud Map
- [ ] BE Infisical `FILE_SERVICE_*`
- [ ] S3 CORS + staging Lifecycle 7일 적용
- [ ] FE Import UI + `uploadImport`
