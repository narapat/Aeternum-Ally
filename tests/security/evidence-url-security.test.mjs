import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  MAX_EVIDENCE_URL_LENGTH,
  canAutoLoadEvidencePreview,
  getSafeEvidenceUrl,
  normalizeEvidenceUrl,
} from '../../services/evidenceUrlSecurity.ts';

test('evidence URLs accept and canonicalize public HTTPS destinations', () => {
  assert.equal(
    normalizeEvidenceUrl(' HTTPS://Example.COM/report.pdf ', 'url'),
    'https://example.com/report.pdf',
  );
  assert.equal(
    normalizeEvidenceUrl('https://drive.google.com./open?id=file-1', 'google_drive'),
    'https://drive.google.com/open?id=file-1',
  );
  assert.equal(
    normalizeEvidenceUrl('https://tenant.sharepoint.com/report', 'onedrive'),
    'https://tenant.sharepoint.com/report',
  );
  assert.equal(
    normalizeEvidenceUrl('https://www.dropbox.com/s/file-1/report', 'dropbox'),
    'https://www.dropbox.com/s/file-1/report',
  );
});

test('unsafe schemes, malformed URLs, credentials, and local networks are rejected', () => {
  const rejected = [
    'javascript:alert(1)',
    'data:text/html,unsafe',
    'file:///etc/passwd',
    'blob:https://example.com/id',
    'http://example.com/report',
    'not a url',
    'https://user:secret@example.com/report',
    'https://localhost/report',
    'https://service.local/report',
    'https://127.0.0.1/report',
    'https://2130706433/report',
    'https://10.0.0.1/report',
    'https://172.16.0.1/report',
    'https://192.168.1.1/report',
    'https://[::1]/report',
    `https://example.com/${'a'.repeat(MAX_EVIDENCE_URL_LENGTH)}`,
  ];

  for (const value of rejected) {
    assert.throws(() => normalizeEvidenceUrl(value, 'url'));
    assert.equal(getSafeEvidenceUrl(value, 'url'), null);
  }
});

test('provider allowlists resist suffix and userinfo hostname bypasses', () => {
  assert.throws(() => normalizeEvidenceUrl(
    'https://drive.google.com.attacker.example/report',
    'google_drive',
  ));
  assert.throws(() => normalizeEvidenceUrl(
    'https://drive.google.com@attacker.example/report',
    'google_drive',
  ));
  assert.throws(() => normalizeEvidenceUrl(
    'https://drive.google.com%2eattacker.example/report',
    'google_drive',
  ));
  assert.throws(() => normalizeEvidenceUrl(
    'https://attacker.example/report',
    'onedrive',
  ));
  assert.throws(() => normalizeEvidenceUrl(
    'https://dropbox.com.attacker.example/report',
    'dropbox',
  ));
});

test('generic URLs are never eligible for automatic remote previews', () => {
  assert.equal(canAutoLoadEvidencePreview('url'), false);
  assert.equal(canAutoLoadEvidencePreview('google_drive'), true);
});

test('service, renderer, and database migration enforce the shared policy', async () => {
  const [serviceSource, componentSource, migrationSource] = await Promise.all([
    readFile(new URL('../../services/evidenceService.ts', import.meta.url), 'utf8'),
    readFile(new URL('../../components/EvidenceBadge.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../supabase/migrations/023_validate_evidence_external_urls.sql', import.meta.url), 'utf8'),
  ]);

  const linkFunction = serviceSource.match(
    /export async function linkExternalEvidence[\s\S]+?return fromDbRow\(data\);\n}/,
  );
  assert.ok(linkFunction);
  assert.match(linkFunction[0], /normalizeEvidenceUrl\([\s\S]+payload\.external_url/);
  assert.ok(
    linkFunction[0].indexOf('normalizeEvidenceUrl(')
      < linkFunction[0].indexOf(".from('evidence_attachments')"),
  );
  assert.match(componentSource, /getSafeEvidenceUrl\(/);
  assert.match(componentSource, /canAutoLoadEvidencePreview\(/);
  assert.match(componentSource, /window\.confirm\(/);
  assert.match(componentSource, /Unsafe or invalid external link blocked/);
  assert.match(migrationSource, /evidence_external_url_https/);
  assert.match(migrationSource, /NOT VALID/);
  assert.ok(migrationSource.includes("external_url !~* '^https://[^/?#]*@'"));
});
