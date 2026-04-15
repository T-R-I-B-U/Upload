# =============================================================================
# Asset Bridge 3D — Dockerfile optimisé pour Coolify
# Node 20 Alpine · Git LFS · SSH · Multi-stage build
# =============================================================================

# ─── Stage 1 : Dépendances ───────────────────────────────────────────────────
FROM node:20-alpine AS deps

# python3/make/g++ : nécessaires pour compiler sharp (module natif Node.js)
RUN apk add --no-cache \
    git \
    git-lfs \
    openssh-client \
    ca-certificates \
    python3 \
    make \
    g++

# Initialiser Git LFS globalement
RUN git lfs install --system

WORKDIR /app

# Copier uniquement les fichiers de dépendances pour profiter du cache Docker
COPY package.json package-lock.json* ./

# Sans --ignore-scripts : permet à sharp de télécharger son binaire natif
RUN npm ci

# ─── Stage 2 : Build ─────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

RUN apk add --no-cache git git-lfs openssh-client ca-certificates
RUN git lfs install --system

WORKDIR /app

# Récupérer node_modules depuis le stage deps
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build Next.js en mode production
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

RUN npm run build

# ─── Stage 3 : Production ────────────────────────────────────────────────────
FROM node:20-alpine AS runner

LABEL maintainer="Asset Bridge 3D"
LABEL description="Interface d'upload 3D sécurisée avec Git LFS"

# Outils runtime : git, git-lfs, openssh (pour le git push au runtime)
# Les outils de compilation (python3/make/g++) restent dans deps, inutiles ici
RUN apk add --no-cache \
    git \
    git-lfs \
    openssh-client \
    ca-certificates \
    tini

# Initialiser Git LFS au niveau système
RUN git lfs install --system

# Installer gltf-transform CLI globalement (utilisé pour la compression Draco)
RUN npm install -g @gltf-transform/cli

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Créer un utilisateur non-root pour la sécurité
# Note : on garde root pour les opérations git/SSH en contexte Coolify
# Si vous souhaitez un user non-root, adaptez les permissions SSH en conséquence

# Copier les artefacts de build
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/.gitattributes ./.gitattributes

# Créer les dossiers d'assets (seront écrasés par le volume Coolify si configuré)
RUN mkdir -p ./public/models/compressed ./public/textures/compressed

# Copier le script d'entrée
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

EXPOSE 3000

# Utiliser tini comme PID 1 pour une gestion correcte des signaux
ENTRYPOINT ["/sbin/tini", "--", "/docker-entrypoint.sh"]
CMD ["node", "server.js"]
