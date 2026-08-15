import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Fitness OS',
    short_name: 'Fitness OS',
    description: 'Engineering foundation ready.',
    start_url: '/',
    display: 'standalone',
    background_color: '#f4f1eb',
    theme_color: '#f4f1eb',
    icons: [
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
    ],
  };
}
