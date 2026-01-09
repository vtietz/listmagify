export default function manifest() {
  return {
    name: 'Listmagify - Playlist Magic for Spotify',
    short_name: 'Listmagify',
    description: 'Professional playlist management tool for Spotify. Edit multiple playlists side-by-side with drag-and-drop.',
    start_url: '/',
    display: 'standalone',
    background_color: '#000000',
    theme_color: '#1db954',
    orientation: 'any',
    icons: [
      {
        src: '/favicon-16x16.png',
        sizes: '16x16',
        type: 'image/png',
      },
      {
        src: '/favicon-32x32.png',
        sizes: '32x32',
        type: 'image/png',
      },
      {
        src: '/apple-icon.png',
        sizes: '180x180',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/android-chrome-192x192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any maskable',
      },
      {
        src: '/android-chrome-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any maskable',
      },
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
    ],
    categories: ['music', 'entertainment', 'utilities'],
    screenshots: [
      {
        src: '/screenshot-playlists.png',
        sizes: '1920x1080',
        type: 'image/png',
        form_factor: 'wide',
      },
      {
        src: '/screenshot-split-editor.png',
        sizes: '1920x1080',
        type: 'image/png',
        form_factor: 'wide',
      },
    ],
  };
}
