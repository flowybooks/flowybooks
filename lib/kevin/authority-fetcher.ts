// Fetches authority-source text through a constrained, allowlisted HTTP client.
// Treat returned content as untrusted evidence; it never controls tool permissions.
import 'server-only';

import { assertAllowedAuthorityUrl, isAllowedAuthorityHostname } from './source-tiers';

const MAX_PAGE_BYTES = 1_000_000;
const MAX_REDIRECTS = 3;
const MIN_HOST_INTERVAL_MS = 1_000;
const DEFAULT_USER_AGENT = 'flowybooks-local/0.1';
const ALLOWED_CONTENT_TYPES = [
  'text/html',
  'text/plain',
  'application/xhtml+xml',
  'application/pdf',
];
const ALLOWED_EXTENSIONS = ['', '.html', '.htm', '.txt', '.pdf'];

type FetchAuthorityOptions = {
  maxBytes?: number;
  respectRobots?: boolean;
};

export type AuthorityFetchResult = {
  url: string;
  finalUrl: string;
  contentType: string;
  text: string;
  bytesRead: number;
};

const lastHostFetchAt = new Map<string, number>();
const robotsCache = new Map<string, Promise<string>>();

function getUserAgent(): string {
  return process.env.FLOWYBOOKS_USER_AGENT?.trim() || DEFAULT_USER_AGENT;
}

function hasAllowedExtension(url: URL): boolean {
  const pathname = url.pathname.toLowerCase();
  const lastDot = pathname.lastIndexOf('.');
  const extension = lastDot === -1 ? '' : pathname.slice(lastDot);
  return ALLOWED_EXTENSIONS.includes(extension);
}

function assertAllowedDownloadShape(url: URL, contentType: string) {
  const normalizedContentType = contentType.split(';', 1)[0]?.trim().toLowerCase() ?? '';

  if (!ALLOWED_CONTENT_TYPES.includes(normalizedContentType)) {
    throw new Error(`Unsupported authority content type: ${contentType || 'unknown'}`);
  }

  if (!hasAllowedExtension(url)) {
    throw new Error(`Unsupported authority file extension: ${url.pathname}`);
  }
}

async function enforceHostRateLimit(hostname: string) {
  const now = Date.now();
  const last = lastHostFetchAt.get(hostname) ?? 0;
  const waitMs = Math.max(0, MIN_HOST_INTERVAL_MS - (now - last));
  if (waitMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
  lastHostFetchAt.set(hostname, Date.now());
}

function robotsUrlFor(url: URL): string {
  return `${url.origin}/robots.txt`;
}

function parseRobotsDisallow(robotsText: string): string[] {
  const disallow: string[] = [];
  let applies = false;

  for (const line of robotsText.split(/\r?\n/)) {
    const stripped = line.replace(/#.*/, '').trim();
    if (!stripped) continue;

    const [rawKey, ...rawValue] = stripped.split(':');
    if (!rawKey) continue;
    const key = rawKey.trim().toLowerCase();
    const value = rawValue.join(':').trim();

    if (key === 'user-agent') {
      applies = value === '*' || value.toLowerCase().includes('flowybooks');
      continue;
    }

    if (applies && key === 'disallow' && value) {
      disallow.push(value);
    }
  }

  return disallow;
}

async function fetchRobots(url: URL): Promise<string> {
  const robotsUrl = robotsUrlFor(url);
  let cached = robotsCache.get(robotsUrl);
  if (!cached) {
    cached = fetch(robotsUrl, {
      method: 'GET',
      redirect: 'manual',
      credentials: 'omit',
      headers: {
        'User-Agent': getUserAgent(),
        Accept: 'text/plain',
      },
      signal: AbortSignal.timeout(10_000),
    })
      .then((response) => (response.ok ? response.text() : ''))
      .catch(() => '');
    robotsCache.set(robotsUrl, cached);
  }
  return cached;
}

async function assertRobotsAllowed(url: URL) {
  const robotsText = await fetchRobots(url);
  if (!robotsText) return;

  const disallow = parseRobotsDisallow(robotsText);
  if (disallow.some((path) => path !== '/' && url.pathname.startsWith(path))) {
    throw new Error(`robots.txt disallows fetching ${url.pathname}`);
  }
  if (disallow.includes('/')) {
    throw new Error(`robots.txt disallows fetching ${url.hostname}`);
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

async function readLimitedText(
  response: Response,
  maxBytes: number,
): Promise<{
  text: string;
  bytesRead: number;
}> {
  const reader = response.body?.getReader();
  if (!reader) {
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > maxBytes) {
      throw new Error('Authority page exceeds maximum size');
    }
    return { text, bytesRead: new TextEncoder().encode(text).byteLength };
  }

  const chunks: Uint8Array[] = [];
  let bytesRead = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    bytesRead += value.byteLength;
    if (bytesRead > maxBytes) {
      throw new Error('Authority page exceeds maximum size');
    }
    chunks.push(value);
  }

  return {
    text: new TextDecoder('utf-8', { fatal: false }).decode(Buffer.concat(chunks)),
    bytesRead,
  };
}

export async function fetchAuthorityPage(
  rawUrl: string,
  options: FetchAuthorityOptions = {},
): Promise<AuthorityFetchResult> {
  const maxBytes = options.maxBytes ?? MAX_PAGE_BYTES;
  let url = assertAllowedAuthorityUrl(rawUrl);

  if (!hasAllowedExtension(url)) {
    throw new Error(`Unsupported authority file extension: ${url.pathname}`);
  }

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    if (options.respectRobots !== false) {
      await assertRobotsAllowed(url);
    }

    await enforceHostRateLimit(url.hostname);

    const response = await fetch(url, {
      method: 'GET',
      redirect: 'manual',
      credentials: 'omit',
      headers: {
        'User-Agent': getUserAgent(),
        Accept: 'text/html,text/plain,application/xhtml+xml,application/pdf;q=0.7',
      },
      signal: AbortSignal.timeout(20_000),
    });

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (!location) {
        throw new Error('Authority redirect is missing a Location header');
      }
      const nextUrl = new URL(location, url);
      if (!isAllowedAuthorityHostname(nextUrl.hostname)) {
        throw new Error(`Authority redirect target is not allowed: ${nextUrl.hostname}`);
      }
      if (nextUrl.protocol !== 'https:') {
        throw new Error('Authority redirect target must use HTTPS');
      }
      url = nextUrl;
      continue;
    }

    if (!response.ok) {
      throw new Error(`Authority fetch failed with status ${response.status}`);
    }

    const contentType = response.headers.get('content-type') ?? '';
    assertAllowedDownloadShape(url, contentType);

    const { text, bytesRead } = await readLimitedText(response, maxBytes);
    const normalizedContentType = contentType.split(';', 1)[0]?.trim().toLowerCase() ?? '';

    return {
      url: rawUrl,
      finalUrl: url.toString(),
      contentType,
      text:
        normalizedContentType === 'text/html' || normalizedContentType === 'application/xhtml+xml'
          ? stripHtml(text)
          : text,
      bytesRead,
    };
  }

  throw new Error('Authority fetch exceeded maximum redirect count');
}
