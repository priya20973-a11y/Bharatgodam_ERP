import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Bharatgodam ERP',
    short_name: 'Bharatgodam',
    description: 'Bharatgodam Warehouse Management System',
    start_url: '/',
    display: 'standalone',
    background_color: '#f8fafc',
    theme_color: '#1d4ed8',
    icons: [
      {
        src: '/bharatgodam-logo.png',
        sizes: 'any',
        type: 'image/png',
      },
    ],
  };
}
