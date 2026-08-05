# ng-signal-query — website

Landing page, docs and the interactive marble playground for
[ng-signal-query](https://github.com/Ali7040/ng-signal-query).

Live at **[ng-signal-query.js.org](https://ng-signal-query.js.org)**.

## Why this is a separate repo

The site depends on `@ali7040/ng-signal-query` **from npm**, exactly as a user
would. If a published release is broken, this site breaks first — which makes it
a smoke test for the package, not just a brochure. It also keeps the library's
commit history free of design churn.

## Develop

```bash
npm install
npm start          # http://localhost:4200
npm run build      # prerenders to dist/ng-signal-query-site/browser
```

## Stack

- Angular 21, standalone, prerendered (`outputMode: static`) — ships static HTML
- anime.js for the entrance sequence and toast
- No CSS framework; the design system lives in `src/styles.css`

## Deploy

Pushing to `main` builds and publishes to GitHub Pages via
`.github/workflows/deploy.yml`. `public/CNAME` holds the custom domain.
