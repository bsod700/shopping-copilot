This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Known Limitations

### Lighthouse scores (dev build, `npm run dev` against `localhost:3000`)

| Category | Score |
|---|---|
| Performance | 64 |
| Accessibility | 95 |
| Best Practices | 100 |
| SEO | 100 |

Key metrics (dev mode): FCP 1.0 s · LCP 9.0 s · TBT 440 ms · CLS 0 · Speed Index 1.2 s.

Performance score in dev is artificially low — Next.js dev mode ships unminified JS (~675 KiB unused + ~372 KiB unminified) that wouldn't exist in a production build. The LCP cost is almost entirely that bundle, not render-blocking resources or large images. A `next build && next start` run would score significantly higher.

Accessibility issue fixed: the cart-badge count span was triggering a label/content-name mismatch (visible text "0" vs aria-label "Open cart") — resolved by adding `aria-hidden="true"` to the count span.
