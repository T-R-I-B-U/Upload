# =============================================================================
# Asset Bridge 3D — Dockerfile optimisé pour Coolify
# Node 20 Slim (Debian) · Blender (headless) · Git LFS · SSH · Multi-stage
# =============================================================================

# ─── Stage 1 : Dépendances ───────────────────────────────────────────────────
FROM node:20-slim AS deps

RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    git-lfs \
    openssh-client \
    ca-certificates \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

RUN git lfs install --system

WORKDIR /app

COPY package.json package-lock.json* ./

RUN npm ci

# ─── Stage 2 : Build ─────────────────────────────────────────────────────────
FROM node:20-slim AS builder

RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    git-lfs \
    openssh-client \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN git lfs install --system

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

RUN npm run build

# ─── Stage 3 : Production ────────────────────────────────────────────────────
FROM node:20-slim AS runner

LABEL maintainer="Asset Bridge 3D"
LABEL description="Interface d'upload 3D sécurisée avec Blender/Draco et Git LFS"

RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    git-lfs \
    openssh-client \
    ca-certificates \
    blender \
    tini \
    python3 \
    python3-numpy \
    && rm -rf /var/lib/apt/lists/*

RUN git lfs install --system

# Blender 3.4 (Debian bookworm) utilise des alias NumPy supprimés dans NumPy 1.24+
# Patch : remplacer np.bool/int/float/complex/object/str par les builtins Python
RUN sed -i \
    -e 's/dtype=np\.bool\b/dtype=bool/g' \
    -e 's/dtype=np\.int\b/dtype=int/g' \
    -e 's/dtype=np\.float\b/dtype=float/g' \
    -e 's/dtype=np\.complex\b/dtype=complex/g' \
    -e 's/dtype=np\.object\b/dtype=object/g' \
    -e 's/dtype=np\.str\b/dtype=str/g' \
    /usr/share/blender/scripts/addons/io_scene_gltf2/blender/imp/gltf2_blender_mesh.py

# Cloner l'outil de compression Draco via Blender
RUN git clone https://github.com/La-Fabrik-Durable/cli-draco-compression.git /opt/cli-draco-compression

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Copier les artefacts de build
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/.gitattributes ./.gitattributes

# Next.js 16 ajoute "type": "module" dans le package.json standalone,
# ce qui casse server.js qui utilise CommonJS require().
# node -e tourne toujours en CJS, indépendamment du champ "type" du package.json.
RUN node -e "var fs=require('fs');var p=JSON.parse(fs.readFileSync('package.json','utf8'));delete p.type;fs.writeFileSync('package.json',JSON.stringify(p,null,2));"

# Créer les dossiers d'assets (seront écrasés par le volume Coolify si configuré)
RUN mkdir -p ./public/models/compressed ./public/textures/compressed

# Copier le script d'entrée
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

EXPOSE 3000

# tini sur Debian est dans /usr/bin (Alpine : /sbin/tini)
ENTRYPOINT ["/usr/bin/tini", "--", "/docker-entrypoint.sh"]
CMD ["node", "server.js"]
