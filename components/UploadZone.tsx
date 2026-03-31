'use client'

import { useCallback, useRef, useState } from 'react'
import { useDropzone, FileRejection } from 'react-dropzone'

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────
type UploadStatus = 'idle' | 'uploading' | 'success' | 'error'

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
}

const ACCEPTED_EXTENSIONS = ['.glb', '.gltf', '.fbx']

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

// ─────────────────────────────────────────────
// Composant principal
// ─────────────────────────────────────────────
export default function UploadZone() {
  const [status, setStatus] = useState<UploadStatus>('idle')
  const [progress, setProgress] = useState(0)
  const [secret, setSecret] = useState('')
  const [secretVisible, setSecretVisible] = useState(false)
  const [result, setResult] = useState<UploadResult | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const xhrRef = useRef<XMLHttpRequest | null>(null)

  // ── Upload via XHR pour accès à onprogress ──
  const uploadFile = useCallback(
    (file: File) => {
      if (!secret.trim()) {
        setResult({ success: false, error: 'Veuillez saisir la clé d\'accès avant d\'uploader.' })
        setStatus('error')
        return
      }

      setStatus('uploading')
      setProgress(0)
      setResult(null)

      const formData = new FormData()
      formData.append('file', file)

      const xhr = new XMLHttpRequest()
      xhrRef.current = xhr

      // Barre de progression réelle
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const pct = Math.round((event.loaded / event.total) * 100)
          setProgress(pct)
        }
      }

      xhr.onload = () => {
        let parsed: UploadResult
        try {
          parsed = JSON.parse(xhr.responseText)
        } catch {
          parsed = {
            success: false,
            error: `Réponse serveur inattendue (HTTP ${xhr.status})`,
          }
        }

        setResult(parsed)
        setStatus(parsed.success ? 'success' : 'error')
        setProgress(parsed.success ? 100 : 0)
      }

      xhr.onerror = () => {
        setResult({ success: false, error: 'Erreur réseau — vérifiez votre connexion.' })
        setStatus('error')
      }

      xhr.onabort = () => {
        setResult({ success: false, error: 'Upload annulé.' })
        setStatus('idle')
        setProgress(0)
      }

      xhr.open('POST', '/api/upload')
      xhr.setRequestHeader('x-upload-secret', secret.trim())
      xhr.send(formData)
    },
    [secret]
  )

  // ── react-dropzone ──
  const onDrop = useCallback(
    (acceptedFiles: File[], rejectedFiles: FileRejection[]) => {
      if (rejectedFiles.length > 0) {
        const codes = rejectedFiles[0].errors.map((e) => e.code).join(', ')
        setResult({
          success: false,
          error:
            codes.includes('file-invalid-type')
              ? `Format non supporté. Utilisez : ${ACCEPTED_EXTENSIONS.join(', ')}`
              : codes.includes('file-too-large')
              ? 'Fichier trop volumineux (max 1 GB)'
              : `Fichier rejeté : ${codes}`,
        })
        setStatus('error')
        return
      }

      if (acceptedFiles.length === 0) return

      const file = acceptedFiles[0]
      setSelectedFile(file)
      setStatus('idle')
      setResult(null)
    },
    []
  )

  const { getRootProps, getInputProps, isDragActive, isDragReject } = useDropzone({
    onDrop,
    accept: ACCEPTED_FORMATS,
    maxFiles: 1,
    maxSize: 500 * 1024 * 1024,
    disabled: status === 'uploading',
  })

  const handleUploadClick = () => {
    if (selectedFile) uploadFile(selectedFile)
  }

  const handleCancel = () => {
    xhrRef.current?.abort()
  }

  const handleReset = () => {
    setStatus('idle')
    setProgress(0)
    setResult(null)
    setSelectedFile(null)
  }

  // ─────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────
  return (
    <div className="w-full max-w-2xl space-y-5">

      {/* Champ mot de passe */}
      <div className="space-y-1.5">
        <label className="block text-sm font-medium text-gray-300">
          Clé d&apos;accès
        </label>
        <div className="relative">
          <input
            type={secretVisible ? 'text' : 'password'}
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            placeholder="Saisir la clé secrète…"
            disabled={status === 'uploading'}
            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2.5 pr-12
                       text-gray-100 placeholder-gray-600 text-sm
                       focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500
                       disabled:opacity-50 disabled:cursor-not-allowed transition"
          />
          <button
            type="button"
            onClick={() => setSecretVisible((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition"
            tabIndex={-1}
          >
            {secretVisible ? (
              // Eye-off icon
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
              </svg>
            ) : (
              // Eye icon
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Dropzone */}
      <div
        {...getRootProps()}
        className={`
          relative border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all duration-200
          ${status === 'uploading' ? 'cursor-not-allowed opacity-60 border-gray-700' : ''}
          ${isDragReject ? 'border-red-500 bg-red-500/5' : ''}
          ${isDragActive && !isDragReject ? 'border-brand-500 bg-brand-500/5 scale-[1.01]' : ''}
          ${!isDragActive && !isDragReject && status !== 'uploading'
            ? 'border-gray-700 hover:border-gray-500 hover:bg-gray-900/50'
            : ''}
          ${status === 'success' ? 'border-green-500/50 bg-green-500/5' : ''}
          ${status === 'error' ? 'border-red-500/50 bg-red-500/5' : ''}
        `}
      >
        <input {...getInputProps()} />

        {/* Icône centrale */}
        <div className="flex justify-center mb-4">
          {status === 'success' ? (
            <div className="w-14 h-14 rounded-full bg-green-500/10 flex items-center justify-center">
              <svg className="w-7 h-7 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
          ) : status === 'error' ? (
            <div className="w-14 h-14 rounded-full bg-red-500/10 flex items-center justify-center">
              <svg className="w-7 h-7 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
          ) : status === 'uploading' ? (
            <div className="w-14 h-14 rounded-full bg-brand-500/10 flex items-center justify-center">
              <svg className="w-7 h-7 text-brand-500 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            </div>
          ) : (
            <div className={`w-14 h-14 rounded-full flex items-center justify-center transition
              ${isDragActive ? 'bg-brand-500/20' : 'bg-gray-800'}`}>
              <svg className={`w-7 h-7 transition ${isDragActive ? 'text-brand-500' : 'text-gray-500'}`}
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round"
                  d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
            </div>
          )}
        </div>

        {/* Texte selon l'état */}
        {status === 'uploading' ? (
          <div>
            <p className="text-sm font-medium text-gray-200 mb-1">
              Upload en cours… {progress}%
            </p>
            <p className="text-xs text-gray-500">
              {selectedFile?.name} — {formatBytes(selectedFile?.size ?? 0)}
            </p>
          </div>
        ) : status === 'success' ? (
          <div>
            <p className="text-sm font-medium text-green-400 mb-1">
              {result?.message ?? 'Fichier déposé avec succès'}
            </p>
            <p className="text-xs text-gray-500">Commité et poussé sur Git LFS</p>
          </div>
        ) : status === 'error' ? (
          <div>
            <p className="text-sm font-medium text-red-400 mb-1">Échec de l&apos;upload</p>
            <p className="text-xs text-gray-500 break-words max-w-md mx-auto">
              {result?.error ?? 'Une erreur est survenue'}
            </p>
          </div>
        ) : isDragReject ? (
          <div>
            <p className="text-sm font-medium text-red-400 mb-1">Format non supporté</p>
            <p className="text-xs text-gray-500">Utilisez .glb, .gltf ou .fbx</p>
          </div>
        ) : selectedFile ? (
          <div>
            <p className="text-sm font-medium text-gray-200 mb-1">Fichier prêt</p>
            <p className="text-xs text-gray-400 font-mono">
              {selectedFile.name}
            </p>
            <p className="text-xs text-gray-600 mt-0.5">{formatBytes(selectedFile.size)}</p>
          </div>
        ) : (
          <div>
            <p className="text-sm font-medium text-gray-300 mb-1">
              {isDragActive ? 'Relâchez pour déposer' : 'Glissez votre fichier 3D ici'}
            </p>
            <p className="text-xs text-gray-600">
              ou cliquez pour parcourir — .glb, .gltf, .fbx jusqu&apos;à 500 MB
            </p>
          </div>
        )}
      </div>

      {/* Barre de progression */}
      {status === 'uploading' && (
        <div className="space-y-2">
          <div className="w-full h-1.5 bg-gray-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-brand-500 to-purple-500 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-gray-600">
            <span>Upload</span>
            <span>{progress}%</span>
          </div>
        </div>
      )}

      {/* Détail git output (succès) */}
      {status === 'success' && result?.gitOutput && (
        <details className="group">
          <summary className="text-xs text-gray-600 cursor-pointer hover:text-gray-400 transition select-none">
            Voir la sortie Git
          </summary>
          <pre className="mt-2 p-3 bg-gray-900 border border-gray-800 rounded-lg text-xs text-gray-400 font-mono overflow-x-auto whitespace-pre-wrap">
            {result.gitOutput}
          </pre>
        </details>
      )}

      {/* Détail git error (erreur) */}
      {status === 'error' && result?.gitError && (
        <details className="group">
          <summary className="text-xs text-red-700 cursor-pointer hover:text-red-500 transition select-none">
            Voir le détail de l&apos;erreur Git
          </summary>
          <pre className="mt-2 p-3 bg-gray-900 border border-red-900/50 rounded-lg text-xs text-red-400 font-mono overflow-x-auto whitespace-pre-wrap">
            {result.gitError}
          </pre>
        </details>
      )}

      {/* Boutons d'action */}
      <div className="flex gap-3">
        {status === 'idle' && selectedFile && (
          <button
            onClick={handleUploadClick}
            className="flex-1 bg-brand-500 hover:bg-brand-600 text-white font-medium text-sm
                       py-2.5 px-6 rounded-lg transition-colors duration-150 focus:outline-none
                       focus:ring-2 focus:ring-brand-500/50"
          >
            Uploader &amp; Pousser sur Git
          </button>
        )}

        {status === 'uploading' && (
          <button
            onClick={handleCancel}
            className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 font-medium text-sm
                       py-2.5 px-6 rounded-lg transition-colors duration-150"
          >
            Annuler
          </button>
        )}

        {(status === 'success' || status === 'error') && (
          <button
            onClick={handleReset}
            className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 font-medium text-sm
                       py-2.5 px-6 rounded-lg transition-colors duration-150"
          >
            {status === 'success' ? 'Déposer un autre fichier' : 'Réessayer'}
          </button>
        )}
      </div>
    </div>
  )
}
