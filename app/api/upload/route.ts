import { NextRequest, NextResponse } from 'next/server'
import { writeFileSync, mkdirSync, existsSync } from 'fs'
import { join, extname, basename } from 'path'
import { execSync } from 'child_process'

// Forcer le runtime Node.js (nécessaire pour fs, child_process)
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Formats autorisés par type
const MODEL_EXTENSIONS = new Set(['.glb', '.gltf', '.fbx'])
const TEXTURE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.ktx2'])
const ALL_ALLOWED_EXTENSIONS = new Set([...MODEL_EXTENSIONS, ...TEXTURE_EXTENSIONS])

// Formats compressibles
const COMPRESSIBLE_TEXTURE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg'])
const COMPRESSIBLE_MODEL_EXTENSIONS = new Set(['.glb', '.gltf'])

const MODELS_DIR = join(process.cwd(), 'public', 'models')
const TEXTURES_DIR = join(process.cwd(), 'public', 'textures')

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
// Parser le multipart — retourne les données sans écrire sur disque
// ─────────────────────────────────────────────
async function parseUpload(req: NextRequest): Promise<{
  filename: string
  buffer: Buffer
  ext: string
  isTexture: boolean
}> {
  const formData = await req.formData()
  const file = formData.get('file') as File | null
  const assetName = (formData.get('assetName') as string | null)?.trim()

  if (!file || file.size === 0) {
    throw new Error('Aucun fichier reçu dans la requête')
  }

  const originalSafe = sanitizeFilename(file.name)
  const ext = extname(originalSafe).toLowerCase()

  if (!ALL_ALLOWED_EXTENSIONS.has(ext)) {
    throw new Error(
      `Extension non autorisée : "${ext}". Formats acceptés : .glb, .gltf, .fbx, .png, .jpg, .jpeg, .webp, .ktx2`
    )
  }

  const baseName = assetName
    ? sanitizeFilename(assetName).replace(/\.[^.]+$/, '')
    : originalSafe.replace(/\.[^.]+$/, '')
  const filename = `${baseName}${ext}`
  const isTexture = TEXTURE_EXTENSIONS.has(ext)
  const buffer = Buffer.from(await file.arrayBuffer())

  return { filename, buffer, ext, isTexture }
}

// ─────────────────────────────────────────────
// Écrire l'original + générer la version compressée
// Retourne tous les chemins relatifs à git add
// ─────────────────────────────────────────────
async function writeAndCompress(
  filename: string,
  buffer: Buffer,
  ext: string,
  isTexture: boolean
): Promise<{ relPaths: string[]; compressedFilename: string | null; compressionWarning?: string }> {
  const baseDir = isTexture ? TEXTURES_DIR : MODELS_DIR
  const baseRelDir = join('public', isTexture ? 'textures' : 'models')
  const compressedDir = join(baseDir, 'compressed')
  const compressedRelDir = join(baseRelDir, 'compressed')

  mkdirSync(baseDir, { recursive: true })

  // Écriture de l'original
  const savedPath = join(baseDir, filename)
  writeFileSync(savedPath, buffer)
  const relPaths: string[] = [join(baseRelDir, filename)]

  let compressedFilename: string | null = null
  let compressionWarning: string | undefined

  // Textures PNG/JPG → WebP (import dynamique : sharp ne se charge qu'au runtime)
  if (isTexture && COMPRESSIBLE_TEXTURE_EXTENSIONS.has(ext)) {
    try {
      mkdirSync(compressedDir, { recursive: true })
      compressedFilename = filename.replace(/\.[^.]+$/, '.webp')
      const { default: sharp } = await import('sharp')
      const webpBuffer = await sharp(buffer).webp({ quality: 85 }).toBuffer()
      writeFileSync(join(compressedDir, compressedFilename), webpBuffer)
      relPaths.push(join(compressedRelDir, compressedFilename))
    } catch (err) {
      compressionWarning = `Compression WebP échouée : ${err instanceof Error ? err.message : err}`
      compressedFilename = null
    }
  }

  // Modèles GLB/GLTF → Draco
  if (!isTexture && COMPRESSIBLE_MODEL_EXTENSIONS.has(ext)) {
    try {
      mkdirSync(compressedDir, { recursive: true })
      compressedFilename = filename
      const compressedPath = join(compressedDir, compressedFilename)
      // Cherche le bin local en premier, puis le global (Docker)
      const localBin = join(process.cwd(), 'node_modules', '.bin', 'gltf-transform')
      const gltfTransformBin = existsSync(localBin) ? localBin : 'gltf-transform'
      execSync(`"${gltfTransformBin}" draco "${savedPath}" "${compressedPath}"`, {
        timeout: 120_000,
        encoding: 'utf-8',
      })
      relPaths.push(join(compressedRelDir, compressedFilename))
    } catch (err) {
      compressionWarning = `Compression Draco échouée : ${err instanceof Error ? err.message : err}`
      compressedFilename = null
    }
  }

  return { relPaths, compressedFilename, compressionWarning }
}

// ─────────────────────────────────────────────
// Séquence git : sync → écriture → compression → commit → push
// Les fichiers sont écrits APRÈS le reset pour éviter tout écrasement
// ─────────────────────────────────────────────
async function runGitPush(
  filename: string,
  buffer: Buffer,
  ext: string,
  isTexture: boolean
): Promise<{ output: string; compressedFilename: string | null; compressionWarning?: string }> {
  const branch = process.env.GIT_BRANCH ?? 'main'
  const repoUrl = process.env.GIT_REPO_URL

  const execOpts = {
    cwd: process.cwd(),
    encoding: 'utf-8' as const,
    timeout: 60_000,
    env: {
      ...process.env,
      GIT_SSH_COMMAND:
        'ssh -i /root/.ssh/id_rsa -o StrictHostKeyChecking=no -o UserKnownHostsFile=/root/.ssh/known_hosts',
      GIT_AUTHOR_NAME: 'Asset Bridge 3D',
      GIT_AUTHOR_EMAIL: 'deploy@assetbridge.local',
      GIT_COMMITTER_NAME: 'Asset Bridge 3D',
      GIT_COMMITTER_EMAIL: 'deploy@assetbridge.local',
    },
  }

  // S'assurer que le repo est initialisé
  try {
    execSync('git rev-parse --git-dir', { cwd: process.cwd(), stdio: 'ignore' })
  } catch {
    execSync('git init && git lfs install', { ...execOpts, stdio: 'pipe' })
    if (repoUrl) {
      execSync(`git remote add origin "${repoUrl}"`, { ...execOpts, stdio: 'pipe' })
    }
    try {
      execSync(`git fetch origin ${branch}`, { ...execOpts, stdio: 'pipe', timeout: 30_000 })
      execSync(`git checkout -b ${branch} --track origin/${branch}`, { ...execOpts, stdio: 'pipe' })
    } catch {
      execSync(`git checkout -b ${branch}`, { ...execOpts, stdio: 'pipe' })
    }
  }

  if (repoUrl) {
    execSync(`git remote set-url origin "${repoUrl}"`, { ...execOpts, stdio: 'pipe' })
  }

  let output = ''

  // Sync avec le remote AVANT d'écrire sur disque
  output += execSync(`git fetch origin ${branch}`, execOpts)
  output += execSync(`git reset --hard origin/${branch}`, execOpts)

  // Écriture + compression (après le reset pour éviter l'écrasement)
  const { relPaths, compressedFilename, compressionWarning } = await writeAndCompress(
    filename,
    buffer,
    ext,
    isTexture
  )

  if (compressionWarning) {
    console.warn(`[upload] ${compressionWarning}`)
  }

  const timestamp = new Date().toISOString()

  // git add : original + compressé
  for (const relPath of relPaths) {
    output += execSync(`git add "${relPath}"`, execOpts)
  }

  // git commit
  try {
    output += execSync(`git commit -m "Design Update: ${filename} [${timestamp}]"`, execOpts)
  } catch (err) {
    const msg = [
      err instanceof Error ? err.message : '',
      (err as NodeJS.ErrnoException & { stdout?: string })?.stdout ?? '',
      (err as NodeJS.ErrnoException & { stderr?: string })?.stderr ?? '',
    ].join(' ')
    if (!msg.includes('nothing to commit') && !msg.includes('nothing added to commit')) {
      throw err
    }
    output += '[rien à committer — fichier identique]\n'
  }

  // git push
  output += execSync(`git push origin ${branch}`, execOpts)

  return { output, compressedFilename, compressionWarning }
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
      { success: false, error: "Clé d'authentification invalide" },
      { status: 401 }
    )
  }

  // 2. Parse multipart
  let filename: string
  let buffer: Buffer
  let ext: string
  let isTexture: boolean

  try {
    ;({ filename, buffer, ext, isTexture } = await parseUpload(req))
    console.log(`[upload] Fichier reçu : ${filename}`)
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur inconnue lors de l'upload"
    console.error('[upload] Erreur parsing :', message)
    return NextResponse.json({ success: false, error: message }, { status: 400 })
  }

  // 3. Sync git + écriture + compression + commit + push
  try {
    const { output, compressedFilename, compressionWarning } = await runGitPush(
      filename,
      buffer,
      ext,
      isTexture
    )
    console.log(`[upload] Git push réussi pour ${filename}`)

    const message = compressedFilename
      ? `"${filename}" et sa version compressée sauvegardés et poussés sur Git.`
      : `"${filename}" sauvegardé et poussé sur Git avec succès.`

    return NextResponse.json({
      success: true,
      filename,
      compressedFilename,
      message: compressionWarning ? `${message} (avertissement : ${compressionWarning})` : message,
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
