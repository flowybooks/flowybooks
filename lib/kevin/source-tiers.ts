// Defines the authority allowlist and answer-label validation for Kevin.
// Tax, GAAP, and CPA answers fail closed when required sources are missing.
import { z } from 'zod';

export const SOURCE_TIERS = {
  federalTaxPrimary: [
    'uscode.house.gov',
    'congress.gov',
    'ecfr.gov',
    'federalregister.gov',
    'irs.gov',
    'home.treasury.gov',
    'ustaxcourt.gov',
  ],

  taxSecondaryTrusted: ['taxpayeradvocate.irs.gov'],

  gaapPrimary: ['asc.fasb.org', 'fasb.org'],

  publicCompanyAccountingAndAudit: ['sec.gov', 'pcaobus.org'],

  cpaExamAndLicensure: ['aicpa-cima.com', 'nasba.org'],
} as const;

export const ALLOWED_DOMAINS = [
  'irs.gov',
  'www.irs.gov',
  'uscode.house.gov',
  'congress.gov',
  'www.congress.gov',
  'ecfr.gov',
  'www.ecfr.gov',
  'federalregister.gov',
  'www.federalregister.gov',
  'home.treasury.gov',
  'ustaxcourt.gov',
  'www.ustaxcourt.gov',
  'taxpayeradvocate.irs.gov',
  'asc.fasb.org',
  'fasb.org',
  'www.fasb.org',
  'sec.gov',
  'www.sec.gov',
  'pcaobus.org',
  'www.pcaobus.org',
  'aicpa-cima.com',
  'www.aicpa-cima.com',
  'nasba.org',
  'www.nasba.org',
] as const;

export const answerTypes = ['tax', 'gaap', 'cpa_exam', 'bookkeeping', 'advisory'] as const;

export const authorityLevels = [
  'primary',
  'official_guidance',
  'professional_guidance',
  'educational',
] as const;

export const KevinAnswerLabelSchema = z.object({
  answer_type: z.enum(answerTypes),
  authority_level: z.enum(authorityLevels),
  sources_used: z.array(z.string()),
  cannot_answer_from_allowlist: z.boolean(),
});

export type KevinAnswerLabel = z.infer<typeof KevinAnswerLabelSchema>;

const allowedDomainSet: Set<string> = new Set(ALLOWED_DOMAINS);

export function normalizeAuthorityHostname(hostname: string): string {
  return hostname.toLowerCase().replace(/\.$/, '');
}

export function isAllowedAuthorityHostname(hostname: string): boolean {
  return allowedDomainSet.has(normalizeAuthorityHostname(hostname));
}

export function assertAllowedAuthorityUrl(rawUrl: string): URL {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error('Authority URL is invalid');
  }

  if (url.protocol !== 'https:') {
    throw new Error('Authority fetcher only allows HTTPS URLs');
  }

  if (!isAllowedAuthorityHostname(url.hostname)) {
    throw new Error(`Authority domain is not allowed: ${url.hostname}`);
  }

  if (url.username || url.password) {
    throw new Error('Authority URLs must not include credentials');
  }

  return url;
}

export function isValidUrlString(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

function validSourceUrls(sources: string[]): string[] {
  return sources.filter(isValidUrlString);
}

function hostnameMatchesTier(hostname: string, domains: readonly string[]): boolean {
  const normalized = normalizeAuthorityHostname(hostname).replace(/^www\./, '');
  return domains.some((domain) => normalized === domain || normalized.endsWith(`.${domain}`));
}

export function isTaxSource(url: string): boolean {
  if (!isValidUrlString(url)) return false;
  const hostname = normalizeAuthorityHostname(new URL(url).hostname);
  return (
    hostnameMatchesTier(hostname, SOURCE_TIERS.federalTaxPrimary) ||
    hostnameMatchesTier(hostname, SOURCE_TIERS.taxSecondaryTrusted)
  );
}

export function isIrsSource(url: string): boolean {
  if (!isValidUrlString(url)) return false;
  const hostname = normalizeAuthorityHostname(new URL(url).hostname);
  return hostnameMatchesTier(hostname, ['irs.gov', 'taxpayeradvocate.irs.gov']);
}

export function isCongressSource(url: string): boolean {
  if (!isValidUrlString(url)) return false;
  const hostname = normalizeAuthorityHostname(new URL(url).hostname);
  return hostnameMatchesTier(hostname, ['congress.gov', 'uscode.house.gov']);
}

export function isGaapSource(url: string): boolean {
  if (!isValidUrlString(url)) return false;
  const hostname = normalizeAuthorityHostname(new URL(url).hostname);
  return hostnameMatchesTier(hostname, SOURCE_TIERS.gaapPrimary);
}

export function isCpaExamSource(url: string): boolean {
  if (!isValidUrlString(url)) return false;
  const hostname = normalizeAuthorityHostname(new URL(url).hostname);
  return hostnameMatchesTier(hostname, SOURCE_TIERS.cpaExamAndLicensure);
}

export function validateAnswerLabelForSources(label: KevinAnswerLabel): KevinAnswerLabel {
  const normalizedLabel = {
    ...label,
    sources_used: validSourceUrls(label.sources_used),
  };

  if (
    (normalizedLabel.answer_type === 'bookkeeping' || normalizedLabel.answer_type === 'advisory') &&
    normalizedLabel.sources_used.length === 0
  ) {
    return { ...normalizedLabel, authority_level: 'educational' };
  }

  if (normalizedLabel.cannot_answer_from_allowlist) {
    return normalizedLabel;
  }

  if (
    normalizedLabel.answer_type === 'tax' &&
    (!normalizedLabel.sources_used.some(isTaxSource) ||
      !normalizedLabel.sources_used.some(isIrsSource) ||
      !normalizedLabel.sources_used.some(isCongressSource))
  ) {
    return { ...normalizedLabel, cannot_answer_from_allowlist: true };
  }

  if (normalizedLabel.answer_type === 'gaap' && !normalizedLabel.sources_used.some(isGaapSource)) {
    return { ...normalizedLabel, cannot_answer_from_allowlist: true };
  }

  if (
    normalizedLabel.answer_type === 'cpa_exam' &&
    !normalizedLabel.sources_used.some(isCpaExamSource)
  ) {
    return { ...normalizedLabel, cannot_answer_from_allowlist: true };
  }

  return normalizedLabel;
}
