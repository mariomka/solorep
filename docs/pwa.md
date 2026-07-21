# PWA and Offline Behavior

## How It Works

- `vite-plugin-pwa` generates the service worker and `site.webmanifest` during production builds. Registration uses `autoUpdate`.
- The application shell, bundled instructions, fonts, manifest, and install icons are precached. Icon sources live in `public/`.
- Exercise GIFs stay external because they are GymVisual assets. `src/lib/exercise-media.ts` resolves `datasetId` values to pinned jsDelivr URLs.
- Viewed exercise GIFs are stored in a Workbox runtime cache. Offline mode can replay cached GIFs; it cannot fetch exercises the user has never viewed.

## Exercise GIF Cache

- The route matches only GIFs under the pinned `hasaneyldrm/exercises-dataset` jsDelivr path.
- Strategy: `CacheFirst`.
- Cacheable responses: status `200` and opaque cross-origin status `0`.
- Expiration: at most 150 GIFs, retained for up to one year.
- Quota pressure purges the runtime cache instead of breaking future writes.

The cache rule lives in `vite.config.ts`. Do not broaden it to all jsDelivr requests.

## Updating the Dataset Pin

Run `bun scripts/generate-media-map.ts [commit]` to regenerate both media and Spanish instruction maps. The generated URLs include the commit SHA, so an upstream force-push cannot change cached content.

## Verification

- `bun run build` must generate `dist/sw.js` without Workbox warnings.
- Verify the generated worker contains the `solorep-exercise-gifs` `CacheFirst` route.
- Runtime caching is a production service-worker behavior. Do not expect it under the normal `bun run dev` server.
