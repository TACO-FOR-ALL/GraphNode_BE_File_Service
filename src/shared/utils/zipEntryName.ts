/**
 * ZIP 엔트리 파일명 디코딩.
 *
 * ZIP 명세:
 * - GPBF bit 11 (0x0800, EFS): UTF-8 파일명
 * - 플래그 없음: IBM CP437 (레거시)
 *
 * adm-zip 기본 decoder는 항상 UTF-8로 해석해 CP437 ZIP에서 한글 등이 깨질 수 있음.
 * rawEntryName 바이트 + EFS 플래그로 올바르게 복원한다.
 */
import type AdmZip from 'adm-zip';
import iconv from 'iconv-lite';

/** General Purpose Bit Flag — language encoding flag (UTF-8) */
const GPBF_UTF8 = 0x0800;

type ZipEntryWithRaw = AdmZip.IZipEntry & { rawEntryName?: Buffer };

/** ZIP 엔트리의 상대 경로(슬래시 구분)를 UTF-8 문자열로 반환 */
export function decodeZipEntryName(entry: AdmZip.IZipEntry): string {
  const raw = (entry as ZipEntryWithRaw).rawEntryName;
  if (!raw || raw.length === 0) {
    return normalizeZipPath(entry.entryName);
  }

  const flags = entry.header?.flags ?? 0;
  const hasUtf8Flag = (flags & GPBF_UTF8) !== 0;

  if (hasUtf8Flag) {
    return normalizeZipPath(raw.toString('utf8'));
  }

  const cp437Name = iconv.decode(raw, 'cp437');

  // EFS 플래그 없이 UTF-8로만 저장된 ZIP(일부 exporter) — 유효 UTF-8이면 UTF-8 우선
  if (isValidUtf8(raw) && looksLikeMojibake(cp437Name, raw.toString('utf8'))) {
    return normalizeZipPath(raw.toString('utf8'));
  }

  return normalizeZipPath(cp437Name);
}

function normalizeZipPath(name: string): string {
  return name.replace(/\\/g, '/');
}

/** 버퍼가 손상 없이 UTF-8로 디코딩 가능한지 검사 */
function isValidUtf8(buf: Buffer): boolean {
  try {
    const decoded = buf.toString('utf8');
    return Buffer.from(decoded, 'utf8').equals(buf);
  } catch {
    return false;
  }
}

/**
 * CP437 디코딩 결과가 깨진 것처럼 보이고 UTF-8 대안이 더 자연스러운지 휴리스틱.
 * (플래그 누락 UTF-8 ZIP 대응)
 */
function looksLikeMojibake(cp437Decoded: string, utf8Decoded: string): boolean {
  if (cp437Decoded === utf8Decoded) return false;
  // 한글·CJK·일반적인 비ASCII가 UTF-8 쪽에만 있으면 UTF-8 채택
  const hasCjkUtf8 = /[\u3000-\u9fff\uac00-\ud7af]/.test(utf8Decoded);
  const hasCjkCp437 = /[\u3000-\u9fff\uac00-\ud7af]/.test(cp437Decoded);
  if (hasCjkUtf8 && !hasCjkCp437) return true;
  // CP437 결과에 흔한 mojibake 문자(Ã, Â, æ 등)가 많으면 UTF-8 우선
  const mojibakeScore = (cp437Decoded.match(/[ÃÂÆÐÑÒÓÔÕÖ×ØÙÚÛÜÝÞßàáâãäåæçèéêë]/g) ?? []).length;
  return mojibakeScore >= 2 && utf8Decoded.length > 0;
}
