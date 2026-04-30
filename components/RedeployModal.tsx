'use client'

import { useState } from 'react'

interface RedeployModalProps {
  secret: string
  onClose: () => void
}

export default function RedeployModal({ secret, onClose }: RedeployModalProps) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)

  const handleRedeploy = async () => {
    setStatus('loading')
    setError(null)

    try {
      const res = await fetch('/api/redeploy', {
        method: 'POST',
        headers: { 'x-upload-secret': secret },
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error ?? 'Erreur inconnue')
      }

      setStatus('success')
    } catch (err) {
      setStatus('error')
      setError(err instanceof Error ? err.message : 'Erreur inconnue')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={status !== 'loading' ? onClose : undefined}
      />

      {/* Modal */}
      <div className="relative bg-white dark:bg-night-card border border-surface-border dark:border-night-border rounded-2xl shadow-xl max-w-sm w-full p-6 space-y-4">
        {status === 'success' ? (
          <>
            <div className="flex flex-col items-center gap-3 py-2">
              <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <svg className="w-6 h-6 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-200 text-center">
                Déploiement lancé sur la-cabane
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500 text-center">
                La branche assets est en cours de build sur Coolify.
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-full bg-surface-muted dark:bg-night-muted hover:bg-brand-100 dark:hover:bg-night-border text-gray-600 dark:text-gray-300 font-medium text-sm py-2.5 px-6 rounded-xl border border-surface-border dark:border-night-border transition-colors"
            >
              Fermer
            </button>
          </>
        ) : (
          <>
            <div className="space-y-1">
              <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100">
                Redéployer la-cabane ?
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Les assets viennent d&apos;être poussés sur Git. Voulez-vous relancer le déploiement de la branche <span className="font-mono text-brand-500">assets</span> sur Coolify ?
              </p>
            </div>

            {status === 'error' && error && (
              <p className="text-xs text-red-500 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <div className="flex gap-3 pt-1">
              <button
                onClick={onClose}
                disabled={status === 'loading'}
                className="flex-1 bg-surface-muted dark:bg-night-muted hover:bg-brand-100 dark:hover:bg-night-border text-gray-600 dark:text-gray-300 font-medium text-sm py-2.5 px-4 rounded-xl border border-surface-border dark:border-night-border transition-colors disabled:opacity-50"
              >
                Plus tard
              </button>
              <button
                onClick={handleRedeploy}
                disabled={status === 'loading'}
                className="flex-1 bg-gradient-brand hover:opacity-90 text-white font-medium text-sm py-2.5 px-4 rounded-xl shadow-soft transition-opacity disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {status === 'loading' ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                    </svg>
                    Lancement…
                  </>
                ) : (
                  'Redéployer'
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
