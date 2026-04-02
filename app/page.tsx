import UploadZone from '@/components/UploadZone'

export default function Home() {
  return (
    <main className="min-h-screen bg-surface-soft flex flex-col items-center justify-center p-6">
      {/* Header */}
      <div className="w-full max-w-2xl mb-10 text-center">
        <div className="inline-flex items-center gap-2 mb-4 px-3 py-1 rounded-full bg-brand-100 border border-brand-200 text-brand-600 text-xs font-medium uppercase tracking-widest">
          <span className="w-1.5 h-1.5 rounded-full bg-brand-500 animate-pulse" />
          Git LFS · Déploiement continu
        </div>
        <h1 className="text-4xl font-bold tracking-tight mb-3">
          <span className="text-gradient">Asset Bridge 3D</span>
        </h1>
        <p className="text-gray-500 text-base leading-relaxed">
          Déposez vos fichiers 3D — ils seront automatiquement versionnés
          <br />et poussés sur le dépôt GitHub via Git LFS.
        </p>
      </div>

      {/* Upload Zone */}
      <UploadZone />

      {/* Footer */}
      <footer className="mt-10 text-gray-400 text-xs text-center">
        Modèles : <span className="font-mono text-gray-500">.glb · .gltf · .fbx</span>
        <span className="mx-2">·</span>
        Textures : <span className="font-mono text-gray-500">.png · .jpg · .webp · .ktx2</span>
        <span className="mx-2">·</span>
        Taille max : <span className="font-mono text-gray-500">1 GB</span>
      </footer>
    </main>
  )
}
