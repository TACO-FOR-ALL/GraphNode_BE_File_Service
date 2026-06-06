/**
 * S3 presigned GET ResponseContentDisposition 헤더 값 생성.
 *
 * RFC 5987: filename*=UTF-8''... 로 비ASCII 파일명을 안전하게 전달.
 * 구형 클라이언트용 ASCII fallback(filename=)도 함께 포함.
 */
export function buildContentDisposition(
  originalFilename: string,
  disposition: 'inline' | 'attachment'
): string {
  const asciiFallback =
    originalFilename.replace(/[^\x20-\x7E]/g, '_').trim() || 'file';
  const encoded = encodeURIComponent(originalFilename);
  return `${disposition}; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
}
