import UploadZone from '@/components/UploadZone'

export default function Home() {
  return (
    <main className="min-h-screen bg-gray-950 flex flex-col items-center justify-center p-6">
      {/* Header */}
      <div className="w-full max-w-2xl mb-10 text-center">
        <div className="inline-flex items-center gap-2 mb-4 px-3 py-1 rounded-full bg-brand-500/10 border border-brand-500/20 text-brand-500 text-xs font-medium uppercase tracking-widest">
          <span className="w-1.5 h-1.5 rounded-full bg-brand-500 animate-pulse" />
          Git LFS · Déploiement continu
        </div>
        <h1 className="text-4xl font-bold tracking-tight mb-3">
          <span className="text-gradient">Asset Bridge 3D</span>
        </h1>
        <p className="text-gray-400 text-base leading-relaxed">
          Déposez vos fichiers 3D — ils seront automatiquement versionnés
          <br />et poussés sur le dépôt GitHub via Git LFS.
        </p>
      </div>

      {/* Upload Zone */}
      <UploadZone />

      {/* Footer */}
      <footer className="mt-10 text-gray-600 text-xs text-center">
        Formats acceptés : <span className="font-mono text-gray-500">.glb · .gltf · .fbx</span>
        <span className="mx-2">·</span>
        Taille max : <span className="font-mono text-gray-500">1 GB</span>
      </footer>
    </main>
  )
}
