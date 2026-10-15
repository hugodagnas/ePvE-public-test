# ePvE — version publique de test

Version autonome et sans authentification du convertisseur PARSYS vers EXOS.
Elle ne dépend ni du HUB Medi15, ni d'une API, ni d'une base de données.
Le PDF est traité dans le navigateur et n'est pas envoyé au serveur.

## Choisir le contenu à copier

Les champs EXOS sont présélectionnés. Chaque champ peut être modifié et décoché.
La section « Rubriques du document complet » donne accès au texte de toutes les
pages, découpé selon la position des titres PARSYS et des colonnes du formulaire.
Les en-têtes répétitifs, pieds de page, titres vides et signature sont exclus.
Les éléments sans titre reconnu restent dans un bloc de la page correspondante. Les rubriques supplémentaires
sont décochées au départ pour éviter les doublons avec les champs EXOS.

L'aperçu affiche exactement la sélection à copier. « Tout sélectionner » et
« Tout désélectionner » agissent sur les champs et les rubriques supplémentaires.
Les pages sans couche de texte sont lues par OCR local et doivent être vérifiées.
Les tableaux du document complet sont du texte brut : leur ordre et leurs valeurs
doivent être comparés au PDF original. L'extraction structurée des derniers
paramètres et des traitements administrés reste disponible dans les champs EXOS.

Le champ « Type de vecteur SMUR » reprend le type de véhicule indiqué dans le PDF ;
il ne constitue pas un indicatif opérationnel. La surveillance graphique dispose
également d'une lecture OCR brute distincte, signalée comme devant être vérifiée.
L'aperçu est affiché à côté des champs sur ordinateur et sous les champs sur mobile.

Tests du classement : `node --test tests/document-sections.test.cjs`.

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
