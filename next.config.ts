import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Output standalone pour Docker (inclut uniquement les fichiers nécessaires)
  output: 'standalone',

  // Augmenter la taille max des réponses pour les gros fichiers
  // Note : la limite d'upload est gérée par le proxy Nginx (client_max_body_size 500M dans Coolify)
  experimental: {
    serverActions: {
      bodySizeLimit: '1gb',
    },
  },
}

export default nextConfig
