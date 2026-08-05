# ng-signal-query — website

Landing page, docs and the interactive concurrency playground for
[ng-signal-query](https://github.com/Ali7040/ng-signal-query).

Live at **[ali7040.github.io/ng-signal-query-site](https://ali7040.github.io/ng-signal-query-site/)**.

## Why this is a separate repo

The site installs `@ali7040/ng-signal-query` **from npm**, exactly as a user
would. If a published release is broken, this site breaks first — so it doubles
as a smoke test for the package rather than being only a brochure. It also keeps
the library's commit history free of design churn.

## Develop

```bash
npm install
npm start        # http://localhost:4200
npm run build    # prerenders to dist/ng-signal-query-site/browser
```

## Notes

- Angular 21, standalone, prerendered (`outputMode: static`) — ships static HTML,
  so the landing page paints without waiting on JavaScript.
- The playground is a real simulator: `src/app/playground/simulate.ts` implements
  the same merge/concat/switch/exhaust semantics as the library, generalised to
  arbitrary call times. The diagram cannot drift from the behaviour it documents.
- anime.js drives the hero entrance and the copy toast. Everything else is CSS,
  including scroll-driven reveals via `animation-timeline: view()`.
- Three colours only: a neutral ramp, `--accent` for input, `--data` for output.
  The four strategies are told apart by the shape of their timeline, not by hue.

## Deploy

Pushing to `main` builds and publishes to GitHub Pages via
`.github/workflows/deploy.yml`. *Settings → Pages → Source* is set to **GitHub
Actions**.

The site is served from the default `github.io` address. To move it to a custom
domain later, add a `public/CNAME` file containing the hostname and set the same
value under *Settings → Pages → Custom domain*.
