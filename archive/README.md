This folder documents the R2 archive prefix used by admin product archiving.

- Runtime archive location in Cloudflare R2: `archive/`
- When an admin archives a product, files are copied from `<key>` to `archive/<key>` and then removed from the original path.
- Purchased users can still download archived PDFs via the download API fallback.
