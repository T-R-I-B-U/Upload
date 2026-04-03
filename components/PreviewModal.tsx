'use client'

import { useEffect, useMemo } from 'react'
import dynamic from 'next/dynamic'
import { getFileType } from '@/lib/upload'

const WatercolorViewer = dynamic(() => import('@/components/WatercolorViewer'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-64">
      <svg className="w-6 h-6 text-brand-500 animate-spin" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
      </svg>
    </div>
  ),
})

interface PreviewModalProps {
  file: File
  onClose: () => void
}

export default function PreviewModal({ file, onClose }: PreviewModalProps) {
  const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase()
  const fileType = getFileType(file.name)

  const isImage = fileType === 'texture' && ext !== '.ktx2'
  const isGltf = fileType === 'model' && (ext === '.glb' || ext === '.gltf')
  const isUnsupported = ext === '.fbx' || ext === '.ktx2'

  const objectUrl = useMemo(() => URL.createObjectURL(file), [file])
  useEffect(() => () => URL.revokeObjectURL(objectUrl), [objectUrl])

  // Fermeture par touche Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 backdrop-blur-sm p-6 pt-16"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl bg-white rounded-2xl shadow-card overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-surface-border">
          <span className="text-sm font-mono text-gray-600 truncate">{file.name}</span>
          <button
            onClick={onClose}
            className="shrink-0 ml-3 text-gray-400 hover:text-gray-600 transition"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Contenu */}
        <div className="bg-surface-soft">
          {isImage && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={objectUrl}
              alt={file.name}
              className="w-full max-h-[70vh] object-contain"
            />
          )}

          {isGltf && <WatercolorViewer file={file} />}

          {isUnsupported && (
            <div className="flex flex-col items-center justify-center h-48 gap-2 text-gray-400">
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
              </svg>
              <p className="text-sm">Prévisualisation non disponible pour <span className="font-mono">{ext}</span></p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
