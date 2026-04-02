'use client'

import { useCallback, useRef, useState } from 'react'
import { useDropzone, FileRejection } from 'react-dropzone'

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────
type FileStatus = 'pending' | 'uploading' | 'success' | 'error'

interface FileEntry {
  file: File
  status: FileStatus
  progress: number
  error?: string
  filename?: string
}

interface UploadResult {
  success: boolean
  filename?: string
  message?: string
  error?: string
  gitOutput?: string
  gitError?: string
}

// ─────────────────────────────────────────────
// Formats acceptés
// ─────────────────────────────────────────────
const ACCEPTED_FORMATS = {
  'model/gltf-binary': ['.glb'],
  'model/gltf+json': ['.gltf'],
  'application/octet-stream': ['.fbx'],
  'image/png': ['.png'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/webp': ['.webp'],
  'image/ktx2': ['.ktx2'],
}

const MODEL_EXTENSIONS = ['.glb', '.gltf', '.fbx']
const TEXTURE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.ktx2']
const ALL_EXTENSIONS = [...MODEL_EXTENSIONS, ...TEXTURE_EXTENSIONS]

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

function getFileType(filename: string): 'model' | 'texture' | null {
  const ext = filename.slice(filename.lastIndexOf('.')).toLowerCase()
  if (MODEL_EXTENSIONS.includes(ext)) return 'model'
  if (TEXTURE_EXTENSIONS.includes(ext)) return 'texture'
  return null
}

function uploadSingleFile(
  file: File,
  secret: string,
  assetName: string,
  onProgress: (pct: number) => void,
  xhrRef: { current: XMLHttpRequest | null }
): Promise<UploadResult> {
  return new Promise((resolve) => {
    const formData = new FormData()
    formData.append('file', file)
    if (assetName.trim()) formData.append('assetName', assetName.trim())

    const xhr = new XMLHttpRequest()
    xhrRef.current = xhr

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100))
    }

    xhr.onload = () => {
      try {
        resolve(JSON.parse(xhr.responseText))
      } catch {
        resolve({ success: false, error: `Réponse inattendue (HTTP ${xhr.status})` })
      }
    }

    xhr.onerror = () => resolve({ success: false, error: 'Erreur réseau.' })
    xhr.onabort = () => resolve({ success: false, error: 'Annulé.' })

    xhr.open('POST', '/api/upload')
    xhr.setRequestHeader('x-upload-secret', secret.trim())
    xhr.send(formData)
  })
}

// ─────────────────────────────────────────────
// Composant principal
// ─────────────────────────────────────────────
export default function UploadZone() {
  const [files, setFiles] = useState<FileEntry[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const [secret, setSecret] = useState('')
  const [secretVisible, setSecretVisible] = useState(false)
  const [assetName, setAssetName] = useState('')
  const [globalError, setGlobalError] = useState<string | null>(null)
  const xhrRef = useRef<XMLHttpRequest | null>(null)

  const updateFile = (index: number, patch: Partial<FileEntry>) => {
    setFiles((prev) => prev.map((f, i) => i === index ? { ...f, ...patch } : f))
  }

  // ── Upload séquentiel de tous les fichiers ──
  const handleUpload = useCallback(async () => {
    if (!secret.trim()) {
      setGlobalError('Veuillez saisir la clé d\'accès avant d\'uploader.')
      return
    }
    if (files.length === 0) return

    setIsUploading(true)
    setGlobalError(null)

    for (let i = 0; i < files.length; i++) {
      if (files[i].status === 'success') continue

      updateFile(i, { status: 'uploading', progress: 0, error: undefined })

      const result = await uploadSingleFile(
        files[i].file,
        secret,
        assetName,
        (pct) => updateFile(i, { progress: pct }),
        xhrRef
      )

      updateFile(i, {
        status: result.success ? 'success' : 'error',
        progress: result.success ? 100 : 0,
        error: result.success ? undefined : result.error,
        filename: result.filename,
      })
    }

    setIsUploading(false)
  }, [files, secret, assetName])

  // ── Annuler le fichier en cours ──
  const handleCancel = () => { xhrRef.current?.abort() }

  // ── Supprimer un fichier de la liste ──
  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index))
  }

  // ── Reset total ──
  const handleReset = () => {
    setFiles([])
    setGlobalError(null)
    setIsUploading(false)
  }

  // ── react-dropzone ──
  const onDrop = useCallback((acceptedFiles: File[], rejectedFiles: FileRejection[]) => {
    if (rejectedFiles.length > 0) {
      const codes = rejectedFiles[0].errors.map((e) => e.code).join(', ')
      setGlobalError(
        codes.includes('file-invalid-type')
          ? `Format non supporté. Utilisez : ${ALL_EXTENSIONS.join(', ')}`
          : `Fichier rejeté : ${codes}`
      )
      return
    }

    setGlobalError(null)
    setFiles((prev) => {
      // Dédoublonner par nom
      const existingNames = new Set(prev.map((f) => f.file.name))
      const newEntries: FileEntry[] = acceptedFiles
        .filter((f) => !existingNames.has(f.name))
        .map((file) => ({ file, status: 'pending', progress: 0 }))
      return [...prev, ...newEntries]
    })
  }, [])

  const { getRootProps, getInputProps, isDragActive, isDragReject } = useDropzone({
    onDrop,
    accept: ACCEPTED_FORMATS,
    maxSize: 1024 * 1024 * 1024,
    disabled: isUploading,
    multiple: true,
  })

  const allDone = files.length > 0 && files.every((f) => f.status === 'success')
  const hasErrors = files.some((f) => f.status === 'error')

  // ─────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────
  return (
    <div className="w-full max-w-2xl space-y-4">

      {/* Clé d'accès */}
      <div className="space-y-1.5">
        <label className="block text-sm font-medium text-gray-700">Clé d&apos;accès</label>
        <div className="relative">
          <input
            type={secretVisible ? 'text' : 'password'}
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            placeholder="Saisir la clé secrète…"
            disabled={isUploading}
            className="w-full bg-white border border-surface-border rounded-xl px-4 py-2.5 pr-12
                       text-gray-800 placeholder-gray-300 text-sm shadow-soft
                       focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400
                       disabled:opacity-50 disabled:cursor-not-allowed transition"
          />
          <button
            type="button"
            onClick={() => setSecretVisible((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-brand-500 transition"
            tabIndex={-1}
          >
            {secretVisible ? (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Nom de l'asset */}
      <div className="space-y-1.5">
        <label className="block text-sm font-medium text-gray-700">
          Nom de l&apos;asset
          <span className="text-gray-400 font-normal ml-2">— nom commun pour le modèle et la texture</span>
        </label>
        <input
          type="text"
          value={assetName}
          onChange={(e) => setAssetName(e.target.value)}
          placeholder="ex : clocher, sol_pierre, mur_brique…"
          disabled={isUploading}
          className="w-full bg-white border border-surface-border rounded-xl px-4 py-2.5
                     text-gray-800 placeholder-gray-300 text-sm font-mono shadow-soft
                     focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400
                     disabled:opacity-50 disabled:cursor-not-allowed transition"
        />
      </div>

      {/* Dropzone */}
      <div
        {...getRootProps()}
        className={`
          relative border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all duration-200 bg-white shadow-soft
          ${isUploading ? 'cursor-not-allowed opacity-60 border-surface-border' : ''}
          ${isDragReject ? 'border-red-400 bg-red-50' : ''}
          ${isDragActive && !isDragReject ? 'border-brand-400 bg-brand-50 scale-[1.01]' : ''}
          ${!isDragActive && !isDragReject && !isUploading
            ? 'border-surface-border hover:border-brand-300 hover:bg-brand-50/40'
            : ''}
        `}
      >
        <input {...getInputProps()} />
        <div className="flex justify-center mb-3">
          <div className={`w-12 h-12 rounded-full flex items-center justify-center transition
            ${isDragActive ? 'bg-brand-200' : 'bg-brand-100'}`}>
            <svg className={`w-6 h-6 transition ${isDragActive ? 'text-brand-600' : 'text-brand-500'}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>
          </div>
        </div>
        {isDragReject ? (
          <p className="text-sm font-medium text-red-500">Format non supporté</p>
        ) : isDragActive ? (
          <p className="text-sm font-medium text-brand-600">Relâchez pour ajouter</p>
        ) : (
          <>
            <p className="text-sm font-medium text-gray-600">
              Glissez vos fichiers ici
              <span className="text-gray-400 font-normal"> ou cliquez pour parcourir</span>
            </p>
            <p className="text-xs text-gray-400 mt-1">
              Modèles : .glb, .gltf, .fbx · Textures : .png, .jpg, .webp, .ktx2
            </p>
          </>
        )}
      </div>

      {/* Erreur globale */}
      {globalError && (
        <p className="text-xs text-red-500 text-center">{globalError}</p>
      )}

      {/* Liste des fichiers */}
      {files.length > 0 && (
        <div className="space-y-2">
          {files.map((entry, i) => {
            const type = getFileType(entry.file.name)
            return (
              <div key={`${entry.file.name}-${i}`}
                className="flex items-center gap-3 bg-white border border-surface-border rounded-xl px-4 py-3 shadow-soft">

                {/* Icône statut */}
                <div className="shrink-0">
                  {entry.status === 'success' ? (
                    <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
                      <svg className="w-4 h-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  ) : entry.status === 'error' ? (
                    <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center">
                      <svg className="w-4 h-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </div>
                  ) : entry.status === 'uploading' ? (
                    <div className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center">
                      <svg className="w-4 h-4 text-brand-500 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                    </div>
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-surface-muted flex items-center justify-center">
                      <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  )}
                </div>

                {/* Infos fichier */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-700 font-mono truncate">{entry.file.name}</span>
                    {type && (
                      <span className={`shrink-0 text-xs px-1.5 py-0.5 rounded-full
                        ${type === 'model' ? 'bg-brand-100 text-brand-600' : 'bg-rose-100 text-rose-500'}`}>
                        {type === 'model' ? '3D' : 'Texture'}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-gray-400">{formatBytes(entry.file.size)}</span>
                    {entry.status === 'error' && entry.error && (
                      <span className="text-xs text-red-400 truncate">{entry.error}</span>
                    )}
                    {entry.status === 'success' && entry.filename && (
                      <span className="text-xs text-green-500 font-mono">{entry.filename}</span>
                    )}
                  </div>
                  {/* Barre de progression individuelle */}
                  {entry.status === 'uploading' && (
                    <div className="mt-1.5 w-full h-1 bg-brand-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-brand rounded-full transition-all duration-200"
                        style={{ width: `${entry.progress}%` }}
                      />
                    </div>
                  )}
                </div>

                {/* Supprimer */}
                {entry.status !== 'uploading' && (
                  <button
                    onClick={() => removeFile(i)}
                    className="shrink-0 text-gray-300 hover:text-red-400 transition"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Boutons d'action */}
      <div className="flex gap-3">
        {!isUploading && files.some((f) => f.status === 'pending' || f.status === 'error') && (
          <button
            onClick={handleUpload}
            className="flex-1 bg-gradient-brand hover:opacity-90 text-white font-medium text-sm
                       py-2.5 px-6 rounded-xl shadow-soft transition-opacity duration-150
                       focus:outline-none focus:ring-2 focus:ring-brand-300"
          >
            Uploader {files.filter(f => f.status !== 'success').length > 1
              ? `${files.filter(f => f.status !== 'success').length} fichiers`
              : 'le fichier'} &amp; Pousser sur Git
          </button>
        )}

        {isUploading && (
          <button
            onClick={handleCancel}
            className="flex-1 bg-surface-muted hover:bg-brand-100 text-gray-600 font-medium text-sm
                       py-2.5 px-6 rounded-xl border border-surface-border transition-colors duration-150"
          >
            Annuler le fichier en cours
          </button>
        )}

        {(allDone || hasErrors) && !isUploading && (
          <button
            onClick={handleReset}
            className="flex-1 bg-surface-muted hover:bg-brand-100 text-gray-600 font-medium text-sm
                       py-2.5 px-6 rounded-xl border border-surface-border transition-colors duration-150"
          >
            {allDone ? 'Tout effacer' : 'Réessayer'}
          </button>
        )}
      </div>
    </div>
  )
}
