# GraphNode File Service — Import 최종 설계 (v1.1)

## 아키텍처

- **공개 진입**: GraphNode BE (BFF)만 ALB 노출
- **File Service**: 내부 전용 (Cloud Map / internal ALB)
- **프로세스**: BFF API, GraphNode SQS Worker, File Service API, File Import Worker

## Import 파이프라인 (Worker)

1. `unzipRecursively` — 중첩 ZIP BFS, depth/entry/byte 한도
2. `discoverConversationShards` + optional `export_manifest.json`
3. `buildFileIndex` — `file_*` → ZIP 경로
4. **Shard 루프** — `parseConversationShard` → `parseConversations` + `extractFileReferencesFromConversation` (JSON 합치지 않음)
5. dedupe 업로드 → `message_file_links` → `ImportCompleteDto` (S3) → job `completed`

## S3 키

| 용도 | 패턴 |
|------|------|
| staging | `import-staging/{userId}/{jobId}/source.zip` |
| result | `import-results/{jobId}/result.json` |
| files | `import-files/{userId}/{fileId}/{safeName}` |

## FE 첨부

- `Attachment.url` = logical **fileId**
- BFF → File Service `/internal/files/{fileId}/presign` → presigned GET

## 프로바이더

- Registry; v1 **openai** only
- gemini/claude/deepseek → `StubExtractor` (501)

## 환경 변수 (ZIP)

- `MAX_ZIP_BYTES` (5 GiB, 압축 전)
- `MAX_ZIP_DEPTH` (default 3)
- `MAX_NESTED_ZIPS` (50)
- `MAX_ZIP_ENTRIES` (100000)
- `MAX_UNCOMPRESSED_BYTES` (15 GiB, 압축 해제 후)

## 미구현 (다음 PR)

- GraphNode BFF `FileServiceClient`, `/v1/imports`
- FE Import UI + job polling
- AWS RDS / SQS / ECS internal 배포
