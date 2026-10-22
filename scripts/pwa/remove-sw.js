// A service worker that removes itself (D-141). Served as /sw.js, it replaces the pool's worker
// on every phone that has it: it deletes the cached files, unregisters, and reloads open tabs so
// they come from the network again. Used by the old address's forwarding site at the move
// (docs/MIGRATION.md Part 2, step 7). For the live site, set `selfDestroying: true` in
// vite.config.ts's VitePWA options instead and deploy: the plugin then writes the same thing.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) await caches.delete(key);
      await self.registration.unregister();
      for (const client of await self.clients.matchAll({ type: 'window' }))
        client.navigate(client.url);
    })(),
  );
});
