import type AdmZip from 'adm-zip';
import iconv from 'iconv-lite';

import { decodeZipEntryName } from '../src/shared/utils/zipEntryName';
import { buildContentDisposition } from '../src/shared/utils/contentDisposition';

const GPBF_UTF8 = 0x0800;

function mockZipEntry(
  rawName: Buffer,
  flags: number,
  fallbackEntryName: string
): AdmZip.IZipEntry {
  return {
    entryName: fallbackEntryName,
    header: {
      flags,
    },
    rawEntryName: rawName,
  } as unknown as AdmZip.IZipEntry;
}

describe('decodeZipEntryName', () => {
  it('UTF-8 플래그가 켜진 ZIP 엔트리에서 한글 파일명을 복원한다', () => {
    const name = '스크린샷.png';
    const raw = Buffer.from(name, 'utf8');
    const entry = mockZipEntry(raw, GPBF_UTF8, name);

    expect(decodeZipEntryName(entry)).toBe('스크린샷.png');
  });

  it('CP437(플래그 없음) ZIP 엔트리에서 Latin-1 확장 파일명을 복원한다', () => {
    const name = 'niño.txt';
    const raw = iconv.encode(name, 'cp437');
    const entry = mockZipEntry(raw, 0, raw.toString('utf8'));

    expect(decodeZipEntryName(entry)).toBe('niño.txt');
  });

  it('EFS 플래그 없이 UTF-8 바이트만 있는 ZIP(플래그 누락)도 한글을 복원한다', () => {
    const name = '사진.jpg';
    const raw = Buffer.from(name, 'utf8');
    const entry = mockZipEntry(raw, 0, raw.toString('utf8'));

    expect(decodeZipEntryName(entry)).toBe('사진.jpg');
  });

  it('백슬래시 경로를 슬래시로 정규화한다', () => {
    const raw = Buffer.from('folder\\file.txt', 'utf8');
    const entry = mockZipEntry(raw, GPBF_UTF8, 'folder\\file.txt');

    expect(decodeZipEntryName(entry)).toBe('folder/file.txt');
  });
});

describe('buildContentDisposition', () => {
  it('한글 파일명에 RFC 5987 filename* 를 포함한다', () => {
    const header = buildContentDisposition('보고서.pdf', 'attachment');

    expect(header).toContain('attachment;');
    expect(header).toContain('filename="');
    expect(header).toContain("filename*=UTF-8''");
    expect(header).toContain(encodeURIComponent('보고서.pdf'));
  });
});
