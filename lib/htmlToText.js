/* lib/htmlToText.js — Strip HTML to readable plain text (Vercel + Netlify) */
'use strict';

function htmlToText(html) {
  return html
    // Remove non-content blocks entirely
    .replace(/<script[\s\S]*?<\/script>/gi,   ' ')
    .replace(/<style[\s\S]*?<\/style>/gi,     ' ')
    .replace(/<nav[\s\S]*?<\/nav>/gi,         ' ')
    .replace(/<header[\s\S]*?<\/header>/gi,   ' ')
    .replace(/<footer[\s\S]*?<\/footer>/gi,   ' ')
    .replace(/<aside[\s\S]*?<\/aside>/gi,     ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi,' ')
    // Convert structural tags to whitespace
    .replace(/<br\s*\/?>/gi,  '\n')
    .replace(/<\/p>/gi,       '\n\n')
    .replace(/<\/h[1-6]>/gi,  '\n\n')
    .replace(/<\/li>/gi,      '\n')
    .replace(/<\/tr>/gi,      '\n')
    .replace(/<\/div>/gi,     '\n')
    .replace(/<\/article>/gi, '\n\n')
    // Strip remaining tags
    .replace(/<[^>]+>/g, '')
    // Decode HTML entities
    .replace(/&amp;/g,  '&')
    .replace(/&lt;/g,   '<')
    .replace(/&gt;/g,   '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g,  "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    // Normalize whitespace
    .replace(/[ \t]+/g,  ' ')
    .replace(/\n{3,}/g,  '\n\n')
    .trim();
}

module.exports = { htmlToText };
