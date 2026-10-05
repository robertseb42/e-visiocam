# Salons réels (annuaire, création et compteurs)

Cette évolution ajoute à `routes/salons.js` :

- la table `salons` (nom, description, icône, privé ou non, créateur) ;
- la table `salon_members` (qui est entré dans quel salon) ;
- les huit salons historiques créés automatiquement si la table est vide.

Les routes d'accès aux salons privés (demandes, responsables, super admin) restent inchangées.

## Nouvelles routes

| Méthode | Route | Accès | Rôle |
| --- | --- | --- | --- |
| GET | `/api/salons/list` | public | liste les salons avec le nombre réel de membres |
| POST | `/api/salons` | connecté | crée un salon public `{ name, description?, icon? }` |
| POST | `/api/salons/:slug/join` | connecté | enregistre l'entrée dans un salon et renvoie le compteur |
| DELETE | `/api/salons/:slug` | créateur ou super admin | supprime un salon (jamais un salon officiel) |

Un salon privé refuse l'entrée (`403`) tant que la demande n'est pas approuvée.

## Déploiement

Aucune dépendance nouvelle. `routes/salons.js`, `tests/salons.test.js` et la ligne
`test:salons` de `package.json` suffisent. **Conserver la base SQLite de production** :
les deux tables se créent au démarrage, et les salons existants ne sont pas modifiés.

Vérification après déploiement : `https://e-visiocam-api.onrender.com/api/salons/list`
doit renvoyer un JSON avec huit salons.

## Tests

```bash
npm run test:salons   # annuaire, création, doublons, compteurs, accès privés, suppression
npm run test:decor    # non-régression du décor
```
