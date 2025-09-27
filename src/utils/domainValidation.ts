interface DomainValidationResult {
  isValid: boolean;
  error?: string;
  suggestions?: string[];
  domainInfo?: {
    isReal: boolean;
    hasValidDNS: boolean;
    hasMXRecord: boolean;
  };
}

interface DNSRecord {
  type: string;
  value: string;
}

interface CloudflareDNSAnswer {
  type: number;
  data: string;
}

// Removed unused interface CloudflareDNSResponse

// Common domain typos and their corrections
const COMMON_DOMAIN_CORRECTIONS: Record<string, string> = {
  'gmial.com': 'gmail.com',
  'gmai.com': 'gmail.com',
  'yahooo.com': 'yahoo.com',
  'hotmial.com': 'hotmail.com',
  'outlok.com': 'outlook.com',
  'hotmailcom': 'hotmail.com',
  'yahocom': 'yahoo.com',
  'gmailcom': 'gmail.com',
};

// Popular email domains for suggestions
const POPULAR_DOMAINS = [
  'gmail.com',
  'yahoo.com',
  'hotmail.com',
  'outlook.com',
  'aol.com',
  'icloud.com',
  'protonmail.com',
  'live.com',
  'msn.com',
  'comcast.net',
  'verizon.net',
];

/**
 * Validates domain format using comprehensive regex
 */
export function validateDomainFormat(domain: string): { isValid: boolean; error?: string } {
  if (!domain || typeof domain !== 'string') {
    return { isValid: false, error: 'Domain is required' };
  }

  // Remove whitespace and convert to lowercase
  const cleanDomain = domain.trim().toLowerCase();

  if (cleanDomain.length === 0) {
    return { isValid: false, error: 'Domain cannot be empty' };
  }

  if (cleanDomain.length > 253) {
    return { isValid: false, error: 'Domain name too long (max 253 characters)' };
  }

  // Check for basic format violations
  if (cleanDomain.startsWith('.') || cleanDomain.endsWith('.')) {
    return { isValid: false, error: 'Domain cannot start or end with a dot' };
  }

  if (cleanDomain.includes('..')) {
    return { isValid: false, error: 'Domain cannot contain consecutive dots' };
  }

  // Comprehensive domain regex pattern
  const domainPattern = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;

  if (!domainPattern.test(cleanDomain)) {
    return { isValid: false, error: 'Invalid domain format' };
  }

  // Check each label (part between dots)
  const labels = cleanDomain.split('.');

  if (labels.length < 2) {
    return { isValid: false, error: 'Domain must have at least two parts (e.g., example.com)' };
  }

  // Validate each label
  for (const label of labels) {
    if (label.length === 0) {
      return { isValid: false, error: 'Empty label in domain' };
    }

    if (label.length > 63) {
      return { isValid: false, error: 'Domain label too long (max 63 characters)' };
    }

    if (label.startsWith('-') || label.endsWith('-')) {
      return { isValid: false, error: 'Domain labels cannot start or end with hyphens' };
    }
  }

  // Check TLD validity (last label)
  const tld = labels[labels.length - 1];
  if (tld.length < 2) {
    return { isValid: false, error: 'Top-level domain too short (minimum 2 characters)' };
  }

  // Check for numeric-only TLD (not allowed)
  if (/^\d+$/.test(tld)) {
    return { isValid: false, error: 'Top-level domain cannot be numeric only' };
  }

  return { isValid: true };
}

/**
 * Performs real DNS lookup for domain verification using DNS over HTTPS
 */
async function performRealDNSLookup(domain: string): Promise<{
  hasValidDNS: boolean;
  hasMXRecord: boolean;
  records?: DNSRecord[];
}> {
  try {
    console.log(`🔍 Performing real DNS lookup for: ${domain}`);

    // Use Cloudflare's DNS over HTTPS service for DNS resolution
    const dnsPromises = [
      // Check for A record (basic domain existence)
      fetch(`https://cloudflare-dns.com/dns-query?name=${domain}&type=A`, {
        headers: { 'Accept': 'application/dns-json' }
      }),
      // Check for MX record (email capability)
      fetch(`https://cloudflare-dns.com/dns-query?name=${domain}&type=MX`, {
        headers: { 'Accept': 'application/dns-json' }
      })
    ];

    const [aResponse, mxResponse] = await Promise.all(dnsPromises);

    if (!aResponse.ok || !mxResponse.ok) {
      console.warn(`DNS lookup failed - HTTP error for ${domain}`);
      return { hasValidDNS: false, hasMXRecord: false };
    }

    const aData = await aResponse.json();
    const mxData = await mxResponse.json();

    console.log(`🔍 DNS results for ${domain}:`, { aData, mxData });

    // Check if domain has A records (basic DNS resolution)
    const hasValidDNS = aData.Status === 0 && aData.Answer && aData.Answer.length > 0;

    // Check if domain has MX records (email capability)
    const hasMXRecord = mxData.Status === 0 && mxData.Answer && mxData.Answer.length > 0;

    const records: DNSRecord[] = [];

    // Parse A records
    if (hasValidDNS && aData.Answer) {
      aData.Answer.forEach((record: CloudflareDNSAnswer) => {
        if (record.type === 1) { // A record
          records.push({ type: 'A', value: record.data });
        }
      });
    }

    // Parse MX records
    if (hasMXRecord && mxData.Answer) {
      mxData.Answer.forEach((record: CloudflareDNSAnswer) => {
        if (record.type === 15) { // MX record
          records.push({ type: 'MX', value: record.data });
        }
      });
    }

    console.log(`✅ DNS lookup complete for ${domain}:`, { hasValidDNS, hasMXRecord, recordCount: records.length });

    return {
      hasValidDNS,
      hasMXRecord,
      records: records.length > 0 ? records : undefined
    };

  } catch (error) {
    console.error(`❌ DNS lookup error for ${domain}:`, error);
    return { hasValidDNS: false, hasMXRecord: false };
  }
}

/**
 * Suggests corrections for common domain typos
 */
function suggestDomainCorrections(domain: string): string[] {
  const cleanDomain = domain.trim().toLowerCase();
  const suggestions: string[] = [];

  // Check exact matches in corrections
  if (COMMON_DOMAIN_CORRECTIONS[cleanDomain]) {
    suggestions.push(COMMON_DOMAIN_CORRECTIONS[cleanDomain]);
    return suggestions;
  }

  // Check for partial matches and suggest popular domains
  const domainParts = cleanDomain.split('.');
  if (domainParts.length >= 2) {
    const baseNamePattern = domainParts[0];

    // Look for similar popular domains
    for (const popularDomain of POPULAR_DOMAINS) {
      const popularParts = popularDomain.split('.');
      if (popularParts[0].includes(baseNamePattern.substring(0, 3)) ||
          baseNamePattern.includes(popularParts[0].substring(0, 3))) {
        suggestions.push(popularDomain);
      }
    }
  }

  // If no suggestions yet, add most popular domains
  if (suggestions.length === 0) {
    suggestions.push(...POPULAR_DOMAINS.slice(0, 3));
  }

  return suggestions.slice(0, 5); // Limit to 5 suggestions
}

/**
 * Comprehensive domain validation with format check and DNS verification
 */
export async function validateDomain(domain: string, options: {
  checkDNS?: boolean;
  timeout?: number;
} = {}): Promise<DomainValidationResult> {
  const { checkDNS = true, timeout = 5000 } = options;

  // First, validate format
  const formatResult = validateDomainFormat(domain);
  if (!formatResult.isValid) {
    return {
      isValid: false,
      error: formatResult.error,
      suggestions: suggestDomainCorrections(domain)
    };
  }

  const cleanDomain = domain.trim().toLowerCase();

  // If DNS checking is disabled, return format validation only
  if (!checkDNS) {
    return { isValid: true };
  }

  try {
    // Perform real DNS lookup with timeout
    const dnsPromise = performRealDNSLookup(cleanDomain);
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('DNS lookup timeout')), timeout)
    );

    const dnsResult = await Promise.race([dnsPromise, timeoutPromise]);

    const domainInfo = {
      isReal: dnsResult.hasValidDNS,
      hasValidDNS: dnsResult.hasValidDNS,
      hasMXRecord: dnsResult.hasMXRecord
    };

    if (!dnsResult.hasValidDNS) {
      return {
        isValid: false,
        error: 'Domain does not exist or is not reachable',
        suggestions: suggestDomainCorrections(domain),
        domainInfo
      };
    }

    // Warn if no MX record (can still receive email via A record)
    if (!dnsResult.hasMXRecord) {
      console.warn(`Domain ${cleanDomain} has no MX record but may still accept email`);
    }

    return {
      isValid: true,
      domainInfo
    };

  } catch (error) {
    console.warn(`DNS verification failed for ${cleanDomain}:`, error);

    // On DNS error, allow the domain but note the issue
    return {
      isValid: true, // Don't block on DNS failures
      error: 'Could not verify domain existence (network issue)',
      domainInfo: {
        isReal: false,
        hasValidDNS: false,
        hasMXRecord: false
      }
    };
  }
}

/**
 * Validates email address format and domain
 */
export async function validateEmailDomain(email: string, options: {
  checkDNS?: boolean;
  timeout?: number;
} = {}): Promise<DomainValidationResult & { emailValid: boolean }> {
  if (!email || typeof email !== 'string') {
    return {
      isValid: false,
      emailValid: false,
      error: 'Email address is required'
    };
  }

  const cleanEmail = email.trim().toLowerCase();

  // Basic email format validation
  const emailPattern = /^[^\s@]+@[^\s@]+$/;
  if (!emailPattern.test(cleanEmail)) {
    return {
      isValid: false,
      emailValid: false,
      error: 'Invalid email format'
    };
  }

  const [, domain] = cleanEmail.split('@');

  if (!domain) {
    return {
      isValid: false,
      emailValid: false,
      error: 'Email must contain a domain'
    };
  }

  const domainResult = await validateDomain(domain, options);

  return {
    ...domainResult,
    emailValid: domainResult.isValid
  };
}

/**
 * Validates multiple domains in batch
 */
export async function validateDomainsAsync(domains: string[], options: {
  checkDNS?: boolean;
  timeout?: number;
  maxConcurrent?: number;
} = {}): Promise<Map<string, DomainValidationResult>> {
  const { maxConcurrent = 5 } = options;
  const results = new Map<string, DomainValidationResult>();

  // Process domains in batches to avoid overwhelming the system
  for (let i = 0; i < domains.length; i += maxConcurrent) {
    const batch = domains.slice(i, i + maxConcurrent);
    const batchPromises = batch.map(async domain => {
      const result = await validateDomain(domain, options);
      return { domain, result };
    });

    const batchResults = await Promise.all(batchPromises);
    batchResults.forEach(({ domain, result }) => {
      results.set(domain, result);
    });
  }

  return results;
}

/**
 * Quick synchronous domain format validation (no DNS check)
 */
export function validateDomainSync(domain: string): DomainValidationResult {
  const formatResult = validateDomainFormat(domain);
  return {
    isValid: formatResult.isValid,
    error: formatResult.error,
    suggestions: formatResult.isValid ? undefined : suggestDomainCorrections(domain)
  };
}