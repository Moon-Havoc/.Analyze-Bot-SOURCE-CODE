/**
 * Anti Link Filter
 * Detects and blocks external links.
 * 
 * Filter interface:
 * - id: Unique identifier for the filter
 * - displayName: Human-readable name for UI
 * - defaultConfig: Default configuration options for this filter
 * - check: Async function that evaluates messages
 * 
 * @returns {{triggered: boolean, reason?: string, detectedUrl?: string}}
 */

// Discord invite pattern - these should be ignored by this filter
const DISCORD_INVITE_PATTERN = /(?:https?:\/\/)?(?:www\.)?(?:discord(?:app)?\.(?:gg|io|me|li)|discord\.com\/invite)\/[a-zA-Z0-9-]+/gi;

// Common TLDs for URL detection
const COMMON_TLDS = [
  'com', 'net', 'org', 'io', 'gg', 'dev', 'xyz', 'app', 'tech', 'me',
  'co', 'us', 'uk', 'ca', 'au', 'de', 'fr', 'es', 'it', 'nl', 'ru',
  'jp', 'kr', 'cn', 'in', 'br', 'mx', 'ar', 'cl', 'pe', 'co', 'tv',
  'biz', 'info', 'name', 'pro', 'aero', 'museum', 'asia', 'cat',
  'jobs', 'mobi', 'tel', 'travel', 'xxx', 'post', 'arpa', 'root',
  'onion', 'i2p', 'bit', 'bbs', 'club', 'online', 'site', 'top',
  'space', 'store', 'shop', 'live', 'news', 'media', 'zone', 'fun',
  'games', 'stream', 'video', 'music', 'art', 'design', 'photo',
  'pics', 'images', 'cloud', 'host', 'server', 'network', 'systems',
  'services', 'solutions', 'agency', 'company', 'group', 'team',
];

// URL pattern - matches http://, https://, www., and domains with common TLDs
// Must have at least 2 characters before the dot to avoid matching short words
// Compiled once for performance
const URL_PATTERN = new RegExp(
  `(?:https?:\/\/|www\.)?[a-zA-Z0-9][a-zA-Z0-9-]{1,61}\.(?:${COMMON_TLDS.join('|')})(?:\/\S*)?`,
  'gi'
);

// Common URL shorteners
const SHORTENER_DOMAINS = [
  'bit.ly', 'tinyurl.com', 'goo.gl', 't.co', 'ow.ly', 'is.gd',
  'buff.ly', 'rebrand.ly', 'lnkd.in', 'fb.me', 'youtu.be',
  'short.link', 'cutt.ly', 'tiny.cc', 'bl.ink', 'soo.gd',
];

/**
 * Extracts the domain from a URL.
 * @param {string} url - URL to extract domain from
 * @returns {string|null} Domain or null if not found
 */
function extractDomain(url) {
  try {
    // Add protocol if missing for URL parsing
    const withProtocol = url.startsWith('http') ? url : `https://${url}`;
    const urlObj = new URL(withProtocol);
    return urlObj.hostname.toLowerCase();
  } catch {
    // Fallback: extract domain manually
    const match = url.match(/(?:https?:\/\/|www\.)?([^\/\s]+)/i);
    if (match) {
      return match[1].toLowerCase();
    }
    return null;
  }
}

/**
 * Checks if a domain is in the whitelist.
 * @param {string} domain - Domain to check
 * @param {Set<string>} whitelist - Whitelisted domains
 * @returns {boolean} True if domain is whitelisted
 */
function isDomainWhitelisted(domain, whitelist) {
  if (whitelist.size === 0) return false;
  const lowerDomain = domain.toLowerCase();
  
  // Check exact match
  if (whitelist.has(lowerDomain)) return true;
  
  // Check subdomain match (e.g., sub.example.com matches example.com)
  for (const whitelisted of whitelist) {
    if (lowerDomain.endsWith(`.${whitelisted}`)) return true;
  }
  
  return false;
}

const antiLinkFilter = {
  id: 'anti-link',
  displayName: 'Anti Link',
  defaultConfig: {
    allowWhitelistedDomains: [],
    allowAdminLinks: false,
    allowBotLinks: false,
  },

  /**
   * Checks if a message contains external links.
   * @param {Message} message - Discord message object
   * @param {object} config - Filter configuration
   * @param {Set<string>} config.allowWhitelistedDomains - Set of allowed domains
   * @param {boolean} config.allowAdminLinks - Whether to allow admins to post links
   * @param {boolean} config.allowBotLinks - Whether to allow bots to post links
   * @returns {Promise<{triggered: boolean, reason?: string, detectedUrl?: string}>}
   */
  async check(message, config) {
    console.log(`[Anti-Link Filter] Checking message ${message.id}, content: "${message.content}"`);
    const content = message.content;
    if (!content) {
      console.log(`[Anti-Link Filter] No content, returning false`);
      return { triggered: false };
    }

    // First, remove Discord invite links - these are handled by Anti Invite module
    const withoutInvites = content.replace(DISCORD_INVITE_PATTERN, '');
    if (!withoutInvites.trim()) {
      console.log(`[Anti-Link Filter] Only Discord invites present, returning false`);
      return { triggered: false };
    }

    // Check for URLs in the message
    const matches = withoutInvites.match(URL_PATTERN);
    if (!matches) {
      console.log(`[Anti-Link Filter] No URL pattern matches, returning false`);
      return { triggered: false };
    }

    console.log(`[Anti-Link Filter] Found URL matches: ${matches.join(', ')}`);

    // Check if user is allowed to post links based on config
    if (config.allowAdminLinks) {
      const member = await message.guild.members.fetch(message.author.id).catch(() => null);
      if (member && member.permissions.has('Administrator')) {
        console.log(`[Anti-Link Filter] User is admin, allowing link`);
        return { triggered: false };
      }
    }

    if (config.allowBotLinks && message.author.bot) {
      console.log(`[Anti-Link Filter] User is bot, allowing link`);
      return { triggered: false };
    }

    // Convert whitelist to Set if it's an array
    const whitelist = config.allowWhitelistedDomains instanceof Set 
      ? config.allowWhitelistedDomains 
      : new Set(config.allowWhitelistedDomains || []);

    console.log(`[Anti-Link Filter] Whitelist size: ${whitelist.size}`);

    // Check each detected URL
    for (const match of matches) {
      const domain = extractDomain(match);
      if (!domain) continue;

      console.log(`[Anti-Link Filter] Matched URL: ${match}`);
      console.log(`[Anti-Link Filter] Matched domain: ${domain}`);

      // Skip if domain is whitelisted
      if (isDomainWhitelisted(domain, whitelist)) {
        console.log(`[Anti-Link Filter] Domain ${domain} is whitelisted, skipping`);
        continue;
      }

      // URL detected and not whitelisted
      console.log(`[Anti-Link Filter] URL detected and not whitelisted, returning triggered=true`);
      return {
        triggered: true,
        reason: `External link detected: ${match}`,
        detectedUrl: match,
      };
    }

    // All URLs were whitelisted
    console.log(`[Anti-Link Filter] All URLs whitelisted, returning false`);
    return { triggered: false };
  },
};

module.exports = { antiLinkFilter };
