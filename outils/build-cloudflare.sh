#!/usr/bin/env bash
# Construction du site pour Cloudflare Pages (commande de build : bash outils/build-cloudflare.sh, dossier publié : _site)
# Mêmes exclusions que l'ancien déploiement GitHub Pages (.github/workflows/pages.yml) : on ne publie pas les tests ni les sources de build.
set -euo pipefail
rm -rf _site
mkdir -p _site
tar \
  --exclude='./.git' --exclude='./.github' --exclude='./_site' --exclude='./node_modules' \
  --exclude='*.test.js' --exclude='./tailwind' --exclude='./tailwind.config.js' --exclude='./input.css' \
  --exclude='./outils' --exclude='pages.yml' --exclude='*.md' \
  --exclude='./ambiance-lounge.jpg' --exclude='./ambiance-musique.jpg' --exclude='./ambiance-rencontres.jpg' \
  --exclude='./hero-neon.jpg' --exclude='./partage.jpg' --exclude='./Claude outputs' \
  -cf - . | tar -xf - -C _site
# Pages fixes du Guide libertin (une par ville, région et lieu vérifié), lisibles par Google — sans échec si l'API ne répond pas
node outils/generer-guide.js _site || echo "Pages du guide non générées"
# Adresses sans .html dans le sitemap et les balises canonical (Cloudflare redirige les .html)
node outils/urls-propres.js _site || echo "Adresses propres non appliquées"
echo "Site prêt dans _site : $(find _site -type f | wc -l) fichiers"
