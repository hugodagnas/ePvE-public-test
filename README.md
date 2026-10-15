# ePvE — version publique de test

Version autonome et sans authentification du convertisseur PARSYS vers EXOS.
Elle ne dépend ni du HUB Medi15, ni d'une API, ni d'une base de données.
Le PDF est traité dans le navigateur et n'est pas envoyé au serveur.

## Publication sur GitHub Pages

1. Créer un dépôt GitHub vide.
2. Envoyer le contenu de ce dossier sur la branche `main`.
3. Dans **Settings > Pages**, choisir **GitHub Actions** comme source.

Le workflow inclus publie automatiquement le site à chaque envoi sur `main`.

## Publication de test sur un VPS

```bash
docker compose up -d --build
```

Le site est alors disponible sur `http://ADRESSE_DU_VPS:8088`.
Le port peut être changé, par exemple :

```bash
EPVE_PORT=8090 docker compose up -d --build
```

Pour un nom de domaine et HTTPS, placer ce service derrière le reverse proxy du VPS.

## Test local rapide

```bash
python -m http.server 8088
```

Puis ouvrir `http://localhost:8088`.

## Limites de cette version

Cette publication est volontairement accessible sans identification. Toute personne
disposant du lien peut ouvrir l'outil. La version intégrée à Medi15 conserve son
contrôle d'accès par le HUB.
