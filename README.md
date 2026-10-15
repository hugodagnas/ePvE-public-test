# ePvE — version publique de test

Version autonome et sans authentification du convertisseur PARSYS vers EXOS.
Elle ne dépend ni du HUB Medi15, ni d'une API, ni d'une base de données.
Le PDF est traité dans le navigateur et n'est pas envoyé au serveur.

## Choisir le contenu à copier

Les 11 champs initiaux constituent un socle obligatoire, toujours inclus dans la
copie : identité, adresse, vecteur, antécédents, traitement habituel, anamnèse,
paramètres, traitements administrés, diagnostic, transport et destination.
Ils restent modifiables. Les valeurs manquantes sont notées NR.

Les champs sont classés dans Identité, Intervention, Médical et Transport et
orientation. La liste « Éléments complémentaires » propose uniquement des ajouts,
tous décochés au départ. Cocher un complément affiche son éditeur et l'ajoute à
l'aperçu dans sa catégorie. Les actions globales agissent uniquement sur les ajouts.

Les compléments sont découpés par libellé, colonne et rubrique du PDF : poids,
taille, IMC, réglages de ventilation, horaires et examens sont indépendants.
Les champs déjà inclus dans le socle et la surveillance brute ne sont pas proposés
une seconde fois. Les en-têtes, pieds de page et signature sont exclus.
Les noms du requérant sont identifiés comme tels, distincts du patient.
Les pages sans texte sont lues par OCR local et doivent être vérifiées ; leur
classement est moins précis que celui d'un PDF PARSYS avec couche de texte.

Le champ « Type de vecteur SMUR » reprend le type de véhicule indiqué dans le PDF ;
il ne constitue pas un indicatif opérationnel. La surveillance graphique alimente
les champs Paramètres et Traitements administrés via OCR local.
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
