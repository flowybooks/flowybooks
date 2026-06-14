import { fetchAuthorityPage } from './authority-fetcher';

const MAX_AUTHORITY_PAGES = 3;

export function extractAuthorityUrls(message: string): string[] {
  const matches = message.match(/https:\/\/[^\s)>"']+/g) ?? [];
  return Array.from(new Set(matches)).slice(0, MAX_AUTHORITY_PAGES);
}

export async function fetchAuthorityPages(urls: string[]) {
  const pages = [];
  for (const url of urls.slice(0, MAX_AUTHORITY_PAGES)) {
    try {
      pages.push(await fetchAuthorityPage(url));
    } catch (error) {
      pages.push({
        url,
        finalUrl: url,
        contentType: 'text/plain',
        text: `Authority fetch failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        bytesRead: 0,
      });
    }
  }
  return pages;
}
