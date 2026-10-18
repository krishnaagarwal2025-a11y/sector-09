# Google Search setup

Production URL: https://sector-09.vercel.app/

## Prepared on the site

- Public `robots.txt` allows crawling and advertises the sitemap.
- `sitemap.xml` lists the canonical home, game and controls-guide URLs.
- Those pages include unique titles/descriptions and canonical links.
- The home page includes factual VideoGame structured data without invented reviews or ratings.
- Utility settings, sound, exit and 404 pages use `noindex, follow`. They remain crawlable so Google can read that directive.

These changes support discovery; they do not constitute a completed Google submission or guarantee indexing, ranking, or a search appearance date.

## Finish ownership verification and request indexing

1. Open https://search.google.com/search-console/ and sign in to your Google account.
2. Add a **URL-prefix** property for `https://sector-09.vercel.app/`.
3. Choose the **HTML tag** verification option. A Vercel subdomain is hosted under a domain you do not manage, so do not assume you can verify the parent `vercel.app` DNS domain.
4. Copy Google's complete `google-site-verification` meta tag. Add it inside `public/index.html`'s `<head>` and deploy. The tag must be the real value from the intended Google account, not an example token.
5. Return to Search Console and select **Verify**. Keep the verification tag deployed afterward.
6. In **Sitemaps**, submit `https://sector-09.vercel.app/sitemap.xml`.
7. Inspect `https://sector-09.vercel.app/` using **URL Inspection** and request indexing if available. Repeat for the game URL if needed.

Do not share your Google password or one-time login codes. The HTML verification tag is intended to be published on the website.

Use Search Console's Page indexing and URL Inspection reports to check progress. A missing result in a `site:` query is not conclusive evidence that a URL is absent from the index.

Official references:

- https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap
- https://developers.google.com/search/docs/crawling-indexing/ask-google-to-recrawl
- https://support.google.com/webmasters/answer/9008080
