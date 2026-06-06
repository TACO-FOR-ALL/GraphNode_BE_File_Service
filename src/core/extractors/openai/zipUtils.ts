/**
 * ZIP 해제 유틸 — 1단 + 중첩 ZIP 재귀 해제 (BFS).
 */
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import AdmZip from 'adm-zip';

import { InvalidArchiveError } from '../../../shared/errors/domain';
import { decodeZipEntryName } from '../../../shared/utils/zipEntryName';
import type { ExtractedFileEntry, ZipExtractLimits } from '../types';

const DEFAULT_LIMITS: ZipExtractLimits = {
  maxZipBytes: 5_368_709_120,
  maxZipDepth: 3,
  maxNestedZips: 50,
  maxEntries: 100_000,
  maxUncompressedBytes: 16_106_127_360,
};

export interface RecursiveUnzipResult {
  files: ExtractedFileEntry[];
  nestedZipCount: number;
  maxZipDepth: number;
  totalUncompressedBytes: number;
}

/** 단일 ZIP을 workDir에 해제하고 파일 목록 반환 (비재귀) */
export function unzipFlat(zipPath: string, destDir: string, limits: ZipExtractLimits): ExtractedFileEntry[] {
  if (!fs.existsSync(zipPath)) {
    throw new InvalidArchiveError('ZIP file not found');
  }
  const stat = fs.statSync(zipPath);
  if (stat.size > limits.maxZipBytes) {
    throw new InvalidArchiveError(`ZIP exceeds max size (${limits.maxZipBytes} bytes)`);
  }

  fs.mkdirSync(destDir, { recursive: true });
  const zip = new AdmZip(zipPath);
  const entries = zip.getEntries();
  const files: ExtractedFileEntry[] = [];

  for (const entry of entries) {
    if (entry.isDirectory) continue;
    // CP437 / UTF-8 ZIP 파일명을 올바르게 복원 (adm-zip 기본 decoder 보정)
    const entryName = decodeZipEntryName(entry);
    if (entryName.includes('..') || path.isAbsolute(entryName)) {
      throw new InvalidArchiveError('ZIP path traversal detected');
    }

    const dest = path.join(destDir, entryName);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const data = entry.getData();
    fs.writeFileSync(dest, data);

    files.push({
      relativePath: entryName,
      absolutePath: dest,
      originalName: path.basename(entryName),
      sizeBytes: data.length,
      sha256: crypto.createHash('sha256').update(data).digest('hex'),
    });
  }

  return files;
}

/**
 * outer ZIP + 내부 .zip 을 BFS로 풀어 플랫 파일 목록 생성.
 * @param prefix relativePath 접두사 (중첩 zip 내부 경로)
 */
export function unzipRecursively(
  rootZipPath: string,
  workDir: string,
  limits: Partial<ZipExtractLimits> = {}
): RecursiveUnzipResult {
  const L: ZipExtractLimits = { ...DEFAULT_LIMITS, ...limits };
  let totalEntries = 0;
  let totalBytes = 0;
  let nestedZipCount = 0;
  let maxDepthReached = 0;

  const allFiles: ExtractedFileEntry[] = [];

  type QueueItem = { zipPath: string; destDir: string; depth: number; prefix: string };
  const queue: QueueItem[] = [{ zipPath: rootZipPath, destDir: workDir, depth: 0, prefix: '' }];

  while (queue.length > 0) {
    const item = queue.shift()!;
    maxDepthReached = Math.max(maxDepthReached, item.depth);

    if (item.depth > L.maxZipDepth) {
      throw new InvalidArchiveError(`ZIP nesting exceeds max depth (${L.maxZipDepth})`);
    }

    const extracted = unzipFlat(item.zipPath, item.destDir, L);

    for (const f of extracted) {
      const rel = (item.prefix ? `${item.prefix}/${f.relativePath}` : f.relativePath).replace(/\\/g, '/');
      const isNestedZip =
        f.originalName.toLowerCase().endsWith('.zip') && item.depth < L.maxZipDepth;

      if (isNestedZip) {
        if (nestedZipCount >= L.maxNestedZips) {
          throw new InvalidArchiveError(`Too many nested ZIP files (max ${L.maxNestedZips})`);
        }
        nestedZipCount++;
        const nestedId = crypto.createHash('md5').update(rel).digest('hex').slice(0, 12);
        const nestedDest = path.join(workDir, '_nested', nestedId);
        /** .zip 파일명을 디렉터리로 쓰지 않음 (Windows ENOTDIR 방지) */
        const contentPrefix = rel.replace(/\.zip$/i, '');
        queue.push({
          zipPath: f.absolutePath,
          destDir: nestedDest,
          depth: item.depth + 1,
          prefix: contentPrefix,
        });
        continue;
      }

      totalBytes += f.sizeBytes;
      totalEntries += 1;
      if (totalEntries > L.maxEntries) {
        throw new InvalidArchiveError(`ZIP has too many entries (max ${L.maxEntries})`);
      }
      if (totalBytes > L.maxUncompressedBytes) {
        throw new InvalidArchiveError(`Uncompressed size exceeds limit (${L.maxUncompressedBytes})`);
      }

      const abs = path.join(workDir, rel.replace(/\//g, path.sep));
      ensureParentDir(abs);
      if (f.absolutePath !== abs) {
        fs.renameSync(f.absolutePath, abs);
      }

      allFiles.push({
        relativePath: rel,
        absolutePath: abs,
        originalName: f.originalName,
        sizeBytes: f.sizeBytes,
        sha256: f.sha256,
      });
    }
  }

  return {
    files: allFiles,
    nestedZipCount,
    maxZipDepth: maxDepthReached,
    totalUncompressedBytes: totalBytes,
  };
}

function ensureParentDir(filePath: string): void {
  const dir = path.dirname(filePath);
  if (dir === filePath || fs.existsSync(dir)) return;
  ensureParentDir(dir);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir);
  }
}

export function findFileByBasename(files: ExtractedFileEntry[], hints: string[]): string | null {
  for (const hint of hints) {
    if (!hint) continue;
    const lower = hint.toLowerCase();
    const match = files.find(
      (f) =>
        f.relativePath.toLowerCase().includes(lower) ||
        f.originalName.toLowerCase() === lower ||
        f.relativePath.toLowerCase().endsWith(`/${lower}`)
    );
    if (match) return match.absolutePath;
  }
  return null;
}
