# File Service — AWS 배포

## 1. Secrets Manager (`taco5/graphnode/file-service`)

| 키 | 용도 |
|----|------|
| `DATABASE_URL` | 전용 Postgres |
| `INTERNAL_API_KEY` | BFF `FILE_SERVICE_INTERNAL_API_KEY` 와 동일 |
| `SQS_IMPORT_QUEUE_URL` | prod import 큐 URL |

ECS `ecs/*.json` 의 `file-service-REPLACE` → `aws secretsmanager list-secrets` 로 실제 ARN 접미사 반영.

## 2. ECS

| Task | 파일 | 포트 |
|------|------|------|
| API | `ecs/file-api-task-definition.json` | 3001 (VPC internal) |
| Worker | `ecs/file-worker-task-definition.json` | SQS only |

- ECR: `571721033550.dkr.ecr.ap-northeast-2.amazonaws.com/taco5/graphnode-file-service:<tag>`
- Task role: S3 on `S3_FILE_BUCKET`, SQS consume
- Worker visibility timeout ≥ 15분

## 3. Service Discovery → BFF

```env
FILE_SERVICE_BASE_URL=http://<cloud-map>:3001
FILE_SERVICE_INTERNAL_API_KEY=<INTERNAL_API_KEY>
```

## 4. S3 (`taco5-graphnode-filedata-chat-and-note-s3`)

| Prefix | 용도 | 보관 |
|--------|------|------|
| `import-staging/` | export ZIP | **7일 TTL** (Lifecycle) |
| `import-files/` | 첨부 | 영구 |
| `import-results/` | worker JSON | 영구 (당분간) |

**CORS**: FE 도메인 `PUT` + `Content-Type`, `Content-Length`.

### Staging Lifecycle (7일)

기존 버킷 Lifecycle과 **병합** 적용:

```bash
aws s3api put-bucket-lifecycle-configuration \
  --bucket taco5-graphnode-filedata-chat-and-note-s3 \
  --lifecycle-configuration file://infra/s3-lifecycle-import-staging.json
```

이미 Lifecycle 규칙이 있으면 콘솔에서 `import-staging/` prefix Expiration 7일 규칙을 **추가**하세요.  
템플릿: [`infra/s3-lifecycle-import-staging.json`](../infra/s3-lifecycle-import-staging.json)

## 5. SQS

prod 큐 생성 → `SQS_IMPORT_QUEUE_URL` (dev 큐와 분리 권장)

## 6. 배포 체크리스트

- [ ] RDS + `prisma migrate deploy`
- [ ] Secrets + ECS task definition ARN
- [ ] API / Worker ECS service (private subnet)
- [ ] Cloud Map + BE `FILE_SERVICE_*`
- [ ] S3 CORS + **staging Lifecycle 7일**
- [ ] Smoke: init → S3 PUT → start → completed → finalize → presign

BFF 연동: `GraphNode_BE/docs/architecture/FILE_SERVICE_INTEGRATION.md`
