/**
 * 모듈: S3Adapter
 *
 * import-staging / import-files / import-results 업로드·다운로드·presigned GET.
 * GraphNode BE AwsS3Adapter와 동일하게 Task Role credentials 폴백.
 */
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  NotFound,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Upload } from '@aws-sdk/lib-storage';
import { Readable } from 'stream';
import * as fs from 'fs';

import { loadEnv } from '../../config/env';
import { StoragePort } from '../../core/ports/StoragePort';
import { UpstreamError } from '../../shared/errors/domain';
import { logger } from '../../shared/utils/logger';

export class S3Adapter implements StoragePort {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor() {
    const env = loadEnv();
    this.bucket = env.S3_FILE_BUCKET;
    this.client = new S3Client({
      region: env.AWS_REGION,
      // presigned PUT + LocalStack: SDK 기본 CRC32 체크섬이 서명 URL 업로드를 깨뜨림
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
      ...(env.AWS_ENDPOINT_URL
        ? { endpoint: env.AWS_ENDPOINT_URL, forcePathStyle: true }
        : {}),
      credentials:
        env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY
          ? { accessKeyId: env.AWS_ACCESS_KEY_ID, secretAccessKey: env.AWS_SECRET_ACCESS_KEY }
          : undefined,
    });
  }

  async upload(key: string, body: Buffer | Readable, contentType = 'application/octet-stream'): Promise<void> {
    try {
      const upload = new Upload({
        client: this.client,
        params: { Bucket: this.bucket, Key: key, Body: body, ContentType: contentType },
      });
      await upload.done();
    } catch (error) {
      logger.error({ err: error, key }, 'S3 upload failed');
      throw new UpstreamError('Failed to upload to S3', { originalError: String(error) });
    }
  }

  async uploadJson(key: string, data: unknown): Promise<void> {
    await this.upload(key, Buffer.from(JSON.stringify(data)), 'application/json');
  }

  async downloadToFile(key: string, destPath: string): Promise<void> {
    try {
      const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      const stream = res.Body as Readable;
      await new Promise<void>((resolve, reject) => {
        const w = fs.createWriteStream(destPath);
        stream.pipe(w);
        w.on('finish', () => resolve());
        w.on('error', reject);
        stream.on('error', reject);
      });
    } catch (error) {
      logger.error({ err: error, key }, 'S3 download failed');
      throw new UpstreamError('Failed to download from S3', { originalError: String(error) });
    }
  }

  async downloadJson<T>(key: string): Promise<T> {
    const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    const body = await res.Body?.transformToString();
    if (!body) throw new UpstreamError('Empty S3 object');
    return JSON.parse(body) as T;
  }

  async headObject(key: string) {
    try {
      const res = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return {
        contentLength: Number(res.ContentLength ?? 0),
        contentType: res.ContentType,
        etag: res.ETag?.replace(/"/g, ''),
      };
    } catch (error) {
      if (error instanceof NotFound || (error as { name?: string }).name === 'NotFound') {
        return null;
      }
      logger.error({ err: error, key }, 'S3 headObject failed');
      throw new UpstreamError('Failed to head S3 object', { originalError: String(error) });
    }
  }

  async getPresignedGetUrl(key: string, ttlSec: number, opts?: { disposition?: string }): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ResponseContentDisposition: opts?.disposition,
    });
    return getSignedUrl(this.client, command, { expiresIn: ttlSec });
  }

  async getPresignedPutUrl(
    key: string,
    ttlSec: number,
    opts: { contentType: string; contentLength: number }
  ): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: opts.contentType,
      ContentLength: opts.contentLength,
    });
    return getSignedUrl(this.client, command, { expiresIn: ttlSec });
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}
