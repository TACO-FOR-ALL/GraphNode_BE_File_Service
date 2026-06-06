/**
 * 모듈: PresignService
 *
 * 책임: 채팅 UI에서 첨부 파일을 열 때 쓸 S3 presigned GET URL 발급.
 * - FE는 영구 URL 대신 fileId로 BFF→File Service presign 호출
 * - 소유권(userId) 검증 후 TTL 만료 URL 반환
 */
import { loadEnv } from '../../config/env';
import type { ImportJobRepository } from '../ports/ImportJobRepository';
import type { StoragePort } from '../ports/StoragePort';
import type { PresignedAccessResponse } from '../../shared/dtos/import';
import { NotFoundError } from '../../shared/errors/domain';
import { buildContentDisposition } from '../../shared/utils/contentDisposition';

export class PresignService {
  constructor(
    private readonly repo: ImportJobRepository,
    private readonly storage: StoragePort
  ) {}

  async presignFileAccess(
    userId: string,
    fileId: string,
    opts?: { disposition?: 'inline' | 'attachment' }
  ): Promise<PresignedAccessResponse> {
    const file = await this.repo.findFileById(fileId);
    if (!file || file.userId !== userId) {
      throw new NotFoundError('File not found');
    }
    if (!file.s3Key) {
      throw new NotFoundError('File is not uploaded yet');
    }

    const env = loadEnv();
    const expiresSec = env.PRESIGN_TTL_SEC;
    // RFC 5987 — 다운로드/인라인 시 원본 파일명(한글 등) 유지
    const disposition =
      opts?.disposition === 'attachment' || opts?.disposition === 'inline'
        ? buildContentDisposition(file.originalName, opts.disposition)
        : undefined;

    const url = await this.storage.getPresignedGetUrl(file.s3Key, expiresSec, { disposition });
    const expiresAt = new Date(Date.now() + expiresSec * 1000).toISOString();

    return {
      url,
      expiresAt,
      fileId: file.id,
      mimeType: file.mimeType,
      name: file.originalName,
    };
  }
}
