import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Output standalone pour Docker (inclut uniquement les fichiers nécessaires)
  output: 'standalone',

  // Ne pas bundler sharp au build : chargé en externe au runtime uniquement.
  // Évite le crash SIGILL quand le binaire natif est compilé pour une autre archi.
  serverExternalPackages: ['sharp'],

  // Inclure sharp dans le bundle standalone pour le runner Docker
  outputFileTracingIncludes: {
    '/api/upload': ['./node_modules/sharp/**/*'],
  },

  // Augmenter la taille max des réponses pour les gros fichiers
  // Note : la limite d'upload est gérée par le proxy Nginx (client_max_body_size 500M dans Coolify)
  experimental: {
    serverActions: {
      bodySizeLimit: '2gb',
    },
  },
}

export default nextConfig
