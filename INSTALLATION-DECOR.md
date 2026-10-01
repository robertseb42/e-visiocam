# Installer le décor administrable E-VISIOCAM

## 1. Backend (Render)

Décompresser `e-visiocam-backend-main.zip` et reporter les sources dans le dépôt du backend.
Les fichiers nécessaires à cette évolution sont :
- `server.js` : branchement de la nouvelle route ;
- `routes/decor.js` : lecture publique et enregistrement réservé aux super administrateurs ;
- `tests/decor.test.js` et le script `test:decor` de `package.json` : vérification isolée.

Aucune nouvelle dépendance. Déployer le backend avec la procédure habituelle.
**Conserver la base SQLite et les variables d'environnement de production.** Aucune base SQLite n'est fournie dans ce ZIP : il ne faut pas remplacer celle du site.
En production, les images et réglages sont conservés dans `/data/database.sqlite`, comme les autres données. Le disque persistant `/data` doit rester monté.
Les deux nouvelles tables se créent automatiquement au démarrage.
Vérification : `https://e-visiocam-api.onrender.com/api/decor` doit retourner un JSON avec `slides`, `version` et `intervalMs`.

## 2. Site / frontend

Décompresser `E-VISIOCAM-theme-harmonise.zip` puis remplacer les fichiers de même nom dans le dépôt du site. Inclure les nouveaux fichiers `decor.html`, `decor.js` et `banner.js`.
L'accueil porte bien le nom `index.html`. Publier le site puis actualiser avec Ctrl + F5.

## 3. Importer les fonds

Se connecter avec un compte `super_admin` puis ouvrir **Administration → Décor et bannières**.
Ajouter jusqu'à trois images JPG ou PNG, de moins de 2 Mo chacune. Format conseillé : **1200 × 400 px**, sans inscriptions dans l'image, sujet plutôt à droite.
Choisir l'ordre avec les flèches, régler le cadrage ordinateur/mobile et la durée (3 à 30 secondes), puis cliquer sur **Enregistrer le décor**.
Le bouton Aperçu montre l'image choisie, et Vue mobile permet d'en vérifier le cadrage.
Les images sont envoyées au backend uniquement à l'enregistrement.
Actualiser l'accueil pour charger les changements.

Le titre, la description, le bouton d'inscription et les avantages restent du HTML fixe. Seuls les fonds changent.
Avec une seule image, le fond reste fixe. Avec plusieurs images, le visiteur peut choisir un fond et mettre le défilement en pause. Le défilement automatique est désactivé si son appareil demande de réduire les animations.

## Fond de secours et images fournies

Les trois nouveaux visuels photo ne sont pas fournis dans ce pack : ils se chargent depuis la page Décor.
Sans images enregistrées, l'accueil essaie les fichiers facultatifs `banner-1.jpg`, `banner-2.jpg` et `banner-3.jpg` placés à côté d'index.html. Si ces fichiers sont absents, il conserve le visuel actuel intégré au CSS.
Ce visuel actuel contient déjà des inscriptions dans ses pixels : utiliser des images sans texte pour obtenir le résultat propre du nouveau carrousel.
Si toutes les images sont retirées dans Décor, le fond de secours revient.

## Vérifications réalisées

- Tests HTTP avec Express et une base SQLite en mémoire : lecture, authentification, rôle super_admin, enregistrement, ordre, remplacement, suppression et conflit de version.
- Vérification de la syntaxe des scripts modifiés.
- Tests DOM de la page Décor et du carrousel : ordre, aperçu mobile, enregistrement, sélection, texte fixe et pause.
- Aucun appel à la base de production ; le site et le backend ne sont pas déployés par ce pack.
- Le rendu visuel final reste à contrôler dans le navigateur du site.

L'API frontend conserve l'adresse existante de votre backend. En local, lancer le backend sur le port 3000 et servir les fichiers frontend depuis localhost.
