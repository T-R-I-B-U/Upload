import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Output standalone pour Docker (inclut uniquement les fichiers nécessaires)
  output: 'standalone',

  // Nécessaire pour que R3F partage la même instance React que l'app
  transpilePackages: ['three', '@react-three/fiber', '@react-three/drei', '@react-three/postprocessing', 'postprocessing'],

  // Augmenter la taille max des réponses pour les gros fichiers
  // Note : la limite d'upload est gérée par le proxy Nginx (client_max_body_size 500M dans Coolify)
  experimental: {
    serverActions: {
      bodySizeLimit: '2gb',
    },
  },
}

export default nextConfig
