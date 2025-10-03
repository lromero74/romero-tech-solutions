import express from 'express';
import fetch from 'node-fetch';

const router = express.Router();

/**
 * POST /api/validate-email-domain
 * Proxy DNS validation to avoid CORS issues
 */
router.post('/validate-email-domain', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email || typeof email !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Email address is required'
      });
    }

    // Extract domain from email
    const emailParts = email.trim().toLowerCase().split('@');
    if (emailParts.length !== 2) {
      return res.status(400).json({
        success: false,
        error: 'Invalid email format'
      });
    }

    const domain = emailParts[1];

    // Validate domain format
    const domainPattern = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;
    if (!domainPattern.test(domain)) {
      return res.json({
        success: false,
        isValid: false,
        error: 'Invalid domain format'
      });
    }

    // Popular domains that we trust
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
      'att.net',
      'sbcglobal.net',
      'cox.net',
      'earthlink.net',
      'me.com',
      'mac.com',
      'ymail.com',
      'rocketmail.com'
    ];

    // If it's a popular domain, skip DNS check
    if (POPULAR_DOMAINS.includes(domain)) {
      return res.json({
        success: true,
        isValid: true,
        domainInfo: {
          isReal: true,
          hasValidDNS: true,
          hasMXRecord: true,
          isPopularDomain: true
        }
      });
    }

    // Perform DNS lookup using Cloudflare DNS over HTTPS
    try {
      const [aResponse, mxResponse] = await Promise.all([
        fetch(`https://cloudflare-dns.com/dns-query?name=${domain}&type=A`, {
          headers: { 'Accept': 'application/dns-json' },
          timeout: 5000
        }),
        fetch(`https://cloudflare-dns.com/dns-query?name=${domain}&type=MX`, {
          headers: { 'Accept': 'application/dns-json' },
          timeout: 5000
        })
      ]);

      if (!aResponse.ok || !mxResponse.ok) {
        console.warn(`DNS lookup failed for ${domain} - HTTP error`);
        return res.json({
          success: true,
          isValid: true, // Allow on DNS failure
          domainInfo: {
            isReal: false,
            hasValidDNS: false,
            hasMXRecord: false
          },
          message: 'Could not verify domain (network issue), but allowing registration'
        });
      }

      const aData = await aResponse.json();
      const mxData = await mxResponse.json();

      const hasValidDNS = aData.Status === 0 && aData.Answer && aData.Answer.length > 0;
      const hasMXRecord = mxData.Status === 0 && mxData.Answer && mxData.Answer.length > 0;

      if (!hasValidDNS) {
        return res.json({
          success: false,
          isValid: false,
          error: 'Domain does not exist or is not reachable',
          domainInfo: {
            isReal: false,
            hasValidDNS: false,
            hasMXRecord: false
          }
        });
      }

      return res.json({
        success: true,
        isValid: true,
        domainInfo: {
          isReal: hasValidDNS,
          hasValidDNS,
          hasMXRecord
        }
      });

    } catch (error) {
      console.error('DNS lookup error:', error);
      // On error, allow the email (don't block user)
      return res.json({
        success: true,
        isValid: true,
        domainInfo: {
          isReal: false,
          hasValidDNS: false,
          hasMXRecord: false
        },
        message: 'Could not verify domain (network issue), but allowing registration'
      });
    }

  } catch (error) {
    console.error('Email validation error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error during email validation'
    });
  }
});

export default router;
