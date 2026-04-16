#!/bin/sh
# =============================================================================
# Asset Bridge 3D — Entrypoint Docker
# Configure Git, SSH et LFS au démarrage du container
# =============================================================================
set -e

echo "[entrypoint] Démarrage d'Asset Bridge 3D..."

# ─── 1. Configurer l'identité Git ────────────────────────────────────────────
git config --global user.email "${GIT_USER_EMAIL:-deploy@asset-bridge.local}"
git config --global user.name "${GIT_USER_NAME:-Asset Bridge Bot}"
git config --global init.defaultBranch "${GIT_BRANCH:-main}"

# Autoriser le dossier /app comme safe.directory (requis depuis Git 2.35.2)
git config --global --add safe.directory /app

echo "[entrypoint] Identité Git configurée."

# ─── 2. Injecter la clé SSH privée ───────────────────────────────────────────
if [ -n "$SSH_PRIVATE_KEY" ]; then
    mkdir -p /root/.ssh
    chmod 700 /root/.ssh

    # Écrire la clé — Coolify préserve les vrais sauts de ligne en multiline
    # On strip les \r éventuels (Windows CRLF) pour éviter "error in libcrypto"
    printf '%s\n' "$SSH_PRIVATE_KEY" | tr -d '\r' > /root/.ssh/id_rsa
    chmod 600 /root/.ssh/id_rsa

    # Ajouter github.com aux known_hosts pour éviter l'invite interactive
    ssh-keyscan -t rsa,ecdsa,ed25519 github.com >> /root/.ssh/known_hosts 2>/dev/null
    chmod 644 /root/.ssh/known_hosts

    echo "[entrypoint] Clé SSH configurée et github.com ajouté aux known_hosts."
else
    echo "[entrypoint] AVERTISSEMENT : SSH_PRIVATE_KEY non définie — git push SSH ne fonctionnera pas."
fi

# ─── 3. Initialiser Git LFS dans le dossier de travail ───────────────────────
cd /app

git lfs install --local 2>/dev/null || true

# ─── 4. Initialiser le repo Git si nécessaire ────────────────────────────────
# Le volume persistant Coolify monte /app/public/models
# Si le repo n'est pas initialisé, on le fait ici

if [ ! -d ".git" ]; then
    echo "[entrypoint] Initialisation du dépôt Git local..."

    git init
    git lfs install

    # Copier .gitattributes si pas déjà présent
    if [ -f ".gitattributes" ]; then
        echo "[entrypoint] .gitattributes détecté."
    fi

    if [ -n "$GIT_REPO_URL" ]; then
        git remote add origin "$GIT_REPO_URL"
        echo "[entrypoint] Remote origin configuré : $GIT_REPO_URL"

        BRANCH="${GIT_BRANCH:-main}"

        # Tenter de récupérer l'historique distant
        if git fetch origin "$BRANCH" 2>/dev/null; then
            git checkout -b "$BRANCH" --track "origin/$BRANCH" 2>/dev/null || \
            git checkout "$BRANCH" 2>/dev/null || true
            echo "[entrypoint] Branch '$BRANCH' récupérée depuis origin."
        else
            git checkout -b "$BRANCH" 2>/dev/null || true
            echo "[entrypoint] Branch locale '$BRANCH' créée."
        fi
    else
        echo "[entrypoint] AVERTISSEMENT : GIT_REPO_URL non définie — les pushes Git échoueront."
        git checkout -b "${GIT_BRANCH:-main}" 2>/dev/null || true
    fi

    echo "[entrypoint] Dépôt Git initialisé."
else
    echo "[entrypoint] Dépôt Git existant détecté."

    # Vérifier que le remote origin est configuré
    if [ -n "$GIT_REPO_URL" ]; then
        if ! git remote get-url origin >/dev/null 2>&1; then
            git remote add origin "$GIT_REPO_URL"
            echo "[entrypoint] Remote origin ajouté : $GIT_REPO_URL"
        fi
    fi
fi

echo "[entrypoint] Configuration terminée. Lancement de l'application..."

# ─── 5. Restaurer le package.json de l'app ───────────────────────────────────
# Le git checkout du repo d'assets peut écraser /app/package.json si le repo
# contient un package.json avec "type": "module", ce qui casse server.js (CJS).
printf '{"name":"asset-bridge-3d","version":"0.1.0"}\n' > /app/package.json

# ─── 6. Lancer la commande principale ────────────────────────────────────────
exec "$@"
