# NotchIsland website

Static site + a Cloudflare Worker that serves the installer from R2.

```bash
node build.cjs ../dist/NotchIsland-Setup-<version>.exe   # copies the real UI (for the live demo), screenshots and release info into public/
npx wrangler r2 bucket create notchisland-downloads
npx wrangler r2 object put notchisland-downloads/NotchIsland-Setup-<version>.exe --file ../dist/NotchIsland-Setup-<version>.exe --remote
npx wrangler deploy
```

The live demo in the page is the *real* island UI (`../src/island`) running in an iframe on top of a fake system (`src/shim.js`).

## Deploy on Cloudflare Pages (notch-island.pages.dev)

Copy `public/` to a folder, keep `robots.txt`, `sitemap.xml`, `_redirects` and the Google verification file, set `"url"` in `release.json` to the GitHub release asset, then `npx wrangler pages deploy <folder> --project-name notch-island --branch main`.
