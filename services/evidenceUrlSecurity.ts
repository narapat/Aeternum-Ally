import type { StorageType } from '../types';

export type ExternalEvidenceStorageType = Exclude<
  StorageType,
  'supabase_storage' | 's3'
>;

export const MAX_EVIDENCE_URL_LENGTH = 2048;

const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

function isSameOrSubdomain(hostname: string, domain: string): boolean {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

function isPrivateIpv4(hostname: string): boolean {
  const octets = hostname.split('.').map(Number);
  if (
    octets.length !== 4
    || octets.some(octet => !Number.isInteger(octet) || octet < 0 || octet > 255)
  ) {
    return false;
  }

  const [first, second, third] = octets;
  return first === 0
    || first === 10
    || first === 127
    || (first === 100 && second >= 64 && second <= 127)
    || (first === 169 && second === 254)
    || (first === 172 && second >= 16 && second <= 31)
    || (first === 192 && second === 0 && third === 0)
    || (first === 192 && second === 0 && third === 2)
    || (first === 192 && second === 168)
    || (first === 198 && (second === 18 || second === 19))
    || (first === 198 && second === 51 && third === 100)
    || (first === 203 && second === 0 && third === 113)
    || first >= 224;
}

function isPrivateIpv6(hostname: string): boolean {
  const address = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  return address === '::'
    || address === '::1'
    || address === '0:0:0:0:0:0:0:1'
    || address.startsWith('fc')
    || address.startsWith('fd')
    || /^fe[89ab]/.test(address)
    || address.startsWith('::ffff:');
}

function isLocalOrPrivateHost(hostname: string): boolean {
  return hostname === 'localhost'
    || hostname.endsWith('.localhost')
    || hostname.endsWith('.local')
    || hostname.endsWith('.internal')
    || isPrivateIpv4(hostname)
    || (hostname.includes(':') && isPrivateIpv6(hostname));
}

function isAllowedProviderHost(
  storageType: ExternalEvidenceStorageType,
  hostname: string,
): boolean {
  switch (storageType) {
    case 'google_drive':
      return hostname === 'drive.google.com' || hostname === 'docs.google.com';
    case 'onedrive':
      return hostname === '1drv.ms'
        || hostname === 'onedrive.live.com'
        || isSameOrSubdomain(hostname, 'sharepoint.com');
    case 'dropbox':
      return isSameOrSubdomain(hostname, 'dropbox.com')
        || isSameOrSubdomain(hostname, 'dropboxusercontent.com');
    case 'url':
      return true;
  }
}

/** Validate and canonicalize an external evidence URL before it is stored. */
export function normalizeEvidenceUrl(
  value: string,
  storageType: ExternalEvidenceStorageType,
): string {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (
    trimmed.length === 0
    || trimmed.length > MAX_EVIDENCE_URL_LENGTH
    || CONTROL_CHARACTERS.test(trimmed)
  ) {
    throw new Error('Enter a valid HTTPS URL.');
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error('Enter a valid HTTPS URL.');
  }

  if (parsed.protocol !== 'https:' || !parsed.hostname) {
    throw new Error('Evidence links must use HTTPS.');
  }
  if (parsed.username || parsed.password) {
    throw new Error('URLs containing usernames or passwords are not allowed.');
  }

  const hostname = parsed.hostname.toLowerCase().replace(/\.$/, '');
  if (isLocalOrPrivateHost(hostname)) {
    throw new Error('Local or private network URLs are not allowed.');
  }
  if (!isAllowedProviderHost(storageType, hostname)) {
    throw new Error('The URL is not hosted by the selected provider.');
  }

  if (parsed.hostname.endsWith('.')) parsed.hostname = hostname;
  return parsed.href;
}

/** Return only a URL that is safe to place in href/src. */
export function getSafeEvidenceUrl(
  value: string | null | undefined,
  storageType: ExternalEvidenceStorageType,
): string | null {
  if (!value) return null;
  try {
    return normalizeEvidenceUrl(value, storageType);
  } catch {
    return null;
  }
}

/** Generic URLs are never fetched automatically as image previews. */
export function canAutoLoadEvidencePreview(
  storageType: ExternalEvidenceStorageType,
): boolean {
  return storageType !== 'url';
}
