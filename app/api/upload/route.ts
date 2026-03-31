import { NextRequest, NextResponse } from 'next/server'
import busboy from 'busboy'
import { createWriteStream, mkdirSync } from 'fs'
import { join, extname, basename } from 'path'
import { Readable } from 'stream'
import { execSync } from 'child_process'

// Forcer le runtime Node.js (nécessaire pour fs, child_process, busboy)
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Formats 3D autorisés
const ALLOWED_EXTENSIONS = new Set(['.glb', '.gltf', '.fbx'])

// Dossier de destination (volume persistant Coolify)
const MODELS_DIR = join(process.cwd(), 'public', 'models')

// ─────────────────────────────────────────────
// Utilitaire : sanitiser le nom de fichier
// ─────────────────────────────────────────────
function sanitizeFilename(name: string): string {
  return basename(name)
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_{2,}/g, '_')
    .toLowerCase()
}

// ─────────────────────────────────────────────
// Utilitaire : parser le multipart via busboy
// Retourne { filename, savedPath } ou throw
// ─────────────────────────────────────────────
function parseUpload(req: NextRequest): Promise<{ filename: string; savedPath: string }> {
  return new Promise((resolve, reject) => {
    const contentType = req.headers.get('content-type') ?? ''

    const bb = busboy({
      headers: { 'content-type': contentType },
      limits: {
        fileSize: 1024 * 1024 * 1024, // 1 GB hard cap
        files: 1,                     // un seul fichier par requête
      },
    })

    let resolved = false

    bb.on('file', (_fieldname, fileStream, info) => {
      const { filename } = info
      const safeFilename = sanitizeFilename(filename)
      const ext = extname(safeFilename).toLowerCase()

      // Validation de l'extension AVANT toute écriture disque
      if (!ALLOWED_EXTENSIONS.has(ext)) {
        fileStream.resume() // vider le stream pour éviter un hang
        bb.destroy()
        return reject(
          new Error(`Extension non autorisée : "${ext}". Formats acceptés : .glb, .gltf, .fbx`)
        )
      }

      // S'assurer que le dossier de destination existe
      mkdirSync(MODELS_DIR, { recursive: true })

      const savedPath = join(MODELS_DIR, safeFilename)
      const writeStream = createWriteStream(savedPath) // écrase si existe déjà

      fileStream.pipe(writeStream)

      writeStream.on('finish', () => {
        if (!resolved) {
          resolved = true
          resolve({ filename: safeFilename, savedPath })
        }
      })

      writeStream.on('error', (err) => {
        if (!resolved) {
          resolved = true
          reject(err)
        }
      })

      fileStream.on('limit', () => {
        writeStream.destroy()
        reject(new Error('Fichier trop volumineux (limite : 500 MB)'))
      })
    })

    bb.on('error', (err) => {
      if (!resolved) {
        resolved = true
        reject(err)
      }
    })

    bb.on('finish', () => {
      // Si aucun fichier n'a été reçu
      if (!resolved) {
        resolved = true
        reject(new Error('Aucun fichier reçu dans la requête'))
      }
    })

    // Connecter le ReadableStream Web → Node.js Readable → busboy
    if (!req.body) {
      return reject(new Error('Corps de requête vide'))
    }

    // @ts-expect-error – req.body est un ReadableStream Web, compatible avec Readable.fromWeb
    Readable.fromWeb(req.body).pipe(bb)
  })
}

// ─────────────────────────────────────────────
// Utilitaire : exécuter la séquence git
// ─────────────────────────────────────────────
function runGitPush(filename: string): { output: string } {
  const branch = process.env.GIT_BRANCH ?? 'main'
  const repoUrl = process.env.GIT_REPO_URL

  // S'assurer que le repo est initialisé et que le remote est configuré
  try {
    execSync('git rev-parse --git-dir', {
      cwd: process.cwd(),
      stdio: 'ignore',
    })
  } catch {
    // Pas encore de repo git — initialiser
    execSync(`git init && git lfs install`, {
      cwd: process.cwd(),
      stdio: 'pipe',
    })

    if (repoUrl) {
      execSync(`git remote add origin ${repoUrl}`, {
        cwd: process.cwd(),
        stdio: 'pipe',
      })
    }

    // Récupérer l'historique distant si possible
    try {
      execSync(`git fetch origin ${branch}`, {
        cwd: process.cwd(),
        stdio: 'pipe',
        timeout: 30_000,
      })
      execSync(`git checkout -b ${branch} --track origin/${branch}`, {
        cwd: process.cwd(),
        stdio: 'pipe',
      })
    } catch {
      execSync(`git checkout -b ${branch}`, {
        cwd: process.cwd(),
        stdio: 'pipe',
      })
    }
  }

  const relPath = join('public', 'models', filename)

  const gitSequence = [
    `git add "${relPath}"`,
    `git commit -m "Design Update: ${filename} [$(date -u '+%Y-%m-%dT%H:%M:%SZ')]"`,
    `git push origin ${branch}`,
  ]

  let output = ''
  for (const cmd of gitSequence) {
    output += execSync(cmd, {
      cwd: process.cwd(),
      encoding: 'utf-8',
      timeout: 60_000,
      env: {
        ...process.env,
        GIT_SSH_COMMAND: 'ssh -i /root/.ssh/id_rsa -o StrictHostKeyChecking=no',
      },
    })
  }

  return { output }
}

// ─────────────────────────────────────────────
// POST /api/upload
// ─────────────────────────────────────────────
export async function POST(req: NextRequest) {
  // 1. Authentification
  const secret = req.headers.get('x-upload-secret')
  const expectedSecret = process.env.UPLOAD_SECRET_KEY

  if (!expectedSecret) {
    console.error('[upload] UPLOAD_SECRET_KEY non configurée côté serveur')
    return NextResponse.json(
      { success: false, error: 'Configuration serveur incomplète' },
      { status: 500 }
    )
  }

  if (!secret || secret !== expectedSecret) {
    return NextResponse.json(
      { success: false, error: 'Clé d\'authentification invalide' },
      { status: 401 }
    )
  }

  // 2. Parse & écriture disque via busboy (streaming)
  let filename: string
  let savedPath: string

  try {
    ;({ filename, savedPath } = await parseUpload(req))
    console.log(`[upload] Fichier reçu et sauvegardé : ${savedPath}`)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur inconnue lors de l\'upload'
    console.error('[upload] Erreur parsing :', message)
    return NextResponse.json(
      { success: false, error: message },
      { status: 400 }
    )
  }

  // 3. Séquence git push
  try {
    const { output } = runGitPush(filename)
    console.log(`[upload] Git push réussi pour ${filename}`)

    return NextResponse.json({
      success: true,
      filename,
      message: `"${filename}" sauvegardé et poussé sur Git avec succès.`,
      gitOutput: output,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur git inconnue'
    const stderr = (err as NodeJS.ErrnoException & { stderr?: string })?.stderr ?? ''
    console.error('[upload] Erreur git push :', message, stderr)

    return NextResponse.json(
      {
        success: false,
        filename,
        error: `Fichier sauvegardé mais git push a échoué : ${message}`,
        gitError: stderr,
      },
      { status: 500 }
    )
  }
}
