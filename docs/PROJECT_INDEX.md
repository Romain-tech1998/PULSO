# Pulso — Index du projet

**Identifiant :** INDEX-0001  
**Version :** 1.0  
**Statut :** Accepted  
**Dépendances :** None  
**Dernière mise à jour :** 2026-07-21
**Rôle :** point d'entrée commun vers les décisions, documents et prochaines étapes du projet.

INDEX-0001 gouverne l'organisation du référentiel documentaire. Il ne remplace pas et ne prévaut pas sur les décisions produit figurant dans les documents Accepted.

## Règle de continuité

Chaque nouveau document Pulso doit :

1. posséder un identifiant, une version et un statut ;
2. indiquer les documents ou décisions dont il dépend ;
3. respecter les PDR acceptés ;
4. distinguer clairement ce qui relève du MVP, de la Roadmap ou de la Vision ;
5. être ajouté à cet index.

Les échanges du projet servent à préparer ou réviser les documents, mais les décisions stabilisées doivent être inscrites dans le référentiel documentaire afin de rester réutilisables dans tous les échanges futurs.

## Décisions produit déjà validées

- Nom du projet : **Pulso**.
- Product brand: Pulso. Acquired domain: `pulsonight.com`. No deployment, DNS configuration, production hosting, or public launch is implied yet.
- Pulso est avant tout un **répertoire d'événements géolocalisés**.
- L'utilisateur peut consulter la base et explorer la carte sans formuler d'intention ni effectuer de recherche.
- Deux modes complémentaires : **Explorer** et **Recherche intelligente**.
- Explorer repose sur une **carte interactive** et des **filtres traditionnels toujours disponibles**.
- La recherche intelligente utilise une barre en langage naturel : **« Que voulez-vous faire ? »**.
- L'exploration libre est l'usage principal ; l'IA est une capacité complémentaire activée à la demande.
- Chaque fonctionnalité importante doit rester utilisable manuellement et être pilotable en langage naturel.
- Pulso sera disponible sous la forme d'une **application et d'un site web** donnant accès au même produit.
- La ville de lancement est **Montréal**.
- Le MVP couvre l'ensemble des événements festifs, musicaux et de soirée programmés : concerts, clubs, bars, spectacles, comedy clubs et catégories similaires.
- L'objectif est de regrouper le plus grand nombre possible d'événements correctement référencés à partir de sources telles que TikTok, Instagram, Shotgun, Ticketmaster et les sources officielles.
- La réservation du MVP repose uniquement sur une redirection externe, avec lien affilié lorsqu'il est disponible.
- La consultation et les favoris locaux ne nécessitent aucun compte ; un compte facultatif pourra ultérieurement importer et fusionner les favoris locaux pour les synchroniser entre appareils, conformément à DEC-0007.
- Le MVP prend en charge le français et l'anglais pour l'interface Pulso et la recherche intelligente déterministe ; le français est la langue de repli, le choix manuel est conservé localement sans compte, et le contenu événementiel externe reste dans sa langue source.
- Réservation directe, portefeuille de billets et identité numérique sont exclus du MVP.
- Le MVP se concentre sur **une seule ville**.
- Le MVP comprend : carte interactive, événements géolocalisés, filtres, recherche IA, fiche événement, accès en une action depuis Pulso à une billetterie ou à une source d'événement externe, et pipeline de données. Cette action ne constitue ni une réservation native, ni un paiement natif, ni un stockage de billets.
- Un bar, restaurant, club ou autre lieu est inclus uniquement lorsqu'il accueille un événement programmé qui correspond au périmètre du MVP Pulso. Pulso n'est pas un annuaire général de lieux ou de restaurants.
- La méthode produit privilégie un lancement simple et cohérent ; toute nouvelle idée est classée en **MVP**, **Roadmap** ou **Vision**.

## Registre documentaire

| Identifiant | Document | Version | Statut | Dépendances | Suite directe |
| --- | --- | --- | --- | --- | --- |
| INDEX-0001 | Project Index | 1.0 | Accepted | None | Gouvernance documentaire |
| PDR-0001 | Product Principles | 1.1 | Accepted | None | User Journeys |
| PDR-0002 | Product Interaction Model | 1.0 | Accepted | PDR-0001 | PRD et écrans |
| MVP-0001 | Montréal Nightlife Scope | 1.1 | Accepted | PDR-0001, PDR-0002 | PRD |
| DEC-0001 | Access, Booking and Product Surfaces | 1.1 | Accepted | PDR-0001, MVP-0001 | Architecture |
| DATA-0001 | Event Data and Trust | 0.3 | Draft | PDR-0001, MVP-0001 | Recherche préalable à l'ingestion et RFC |
| DATA-0002 | Montréal Source Registry | 0.1 | Draft | PDR-0001, MVP-0001, PRD-0001, RFC-0001, DATA-0001 | Normalisation, vérification et pilote de sources |
| DATA-0003 | Ingestion API Landscape | 0.4 | Draft | PDR-0001, MVP-0001, DATA-0001, DATA-0002, DEC-0006 | Revue produit du mapping RawIngestedEvent→PublicEvent, vérification réelle des connecteurs restants, app Meta pour Instagram Scout |
| UJ-0001 | Free Exploration in Montréal | 1.0 | Accepted | PDR-0001, PDR-0002, MVP-0001 | Écrans, flux UX et validation sur prototype |
| UJ-0002 | Intelligent Search in Montréal | 1.0 | Accepted | PDR-0001, PDR-0002, MVP-0001 | Écrans, flux UX et validation sur prototype |
| UX-0001 | MVP Screens and Flows | 1.1 | Accepted | PDR-0001, PDR-0002, MVP-0001, DEC-0001, UJ-0001, UJ-0002, DATA-0001 | PRD-0001 |
| PRD-0001 | Pulso Montréal MVP | 1.1 | Accepted | PDR-0001, PDR-0002, MVP-0001, DEC-0001, DATA-0001, UJ-0001, UJ-0002, UX-0001 | RFC-0001 |
| RFC-0001 | Pulso Core Architecture | 1.1 | Accepted | PDR-0001, PDR-0002, MVP-0001, DEC-0001, DATA-0001, UJ-0001, UJ-0002, UX-0001, PRD-0001 | Repository scaffold and synthetic geospatial vertical slice |
| DEC-0002 | Technical Baseline | 1.0 | Accepted | PRD-0001, RFC-0001 | Authorize the next RFC-0001 implementation task separately |
| DEC-0003 | MVP Language Policy | 1.0 | Accepted | PDR-0001, PDR-0002, MVP-0001, DEC-0001, UJ-0001, UJ-0002, UX-0001, PRD-0001, RFC-0001 | Bilingual MVP implementation |
| UI-0001 | Visual Identity and Branding | 1.0 | Accepted | PDR-0001, PDR-0002, MVP-0001, DEC-0001, DATA-0001, UJ-0001, UJ-0002, UX-0001, PRD-0001, RFC-0001, DEC-0003 | Integrate canonical identity into existing web and mobile surfaces |
| DEC-0004 | Map Basemap Provider | 0.3 | Draft | PRD-0001, RFC-0001, DEC-0002, UI-0001 | Dark-style visual spike and accessibility review |
| DEC-0005 | Explore Search Placement | 1.0 | Accepted | PDR-0001, PDR-0002, UJ-0002, UX-0001, PRD-0001, UI-0001 | Future presentation correction |
| DEC-0006 | Pulso Scout Operating Model | 0.1 | Draft | PDR-0001, MVP-0001, PRD-0001, RFC-0001, DATA-0001, DATA-0002 | Pilote Instagram supervisé |
| DEC-0007 | Anonymous Favorites Continuity | 1.0 | Accepted | PDR-0001, PDR-0002, MVP-0001, DEC-0001, UX-0001, PRD-0001, RFC-0001, DEC-0003 | Implémentation future des favoris locaux et de la fusion après connexion volontaire |
| DEC-0008 | Event Sharing | 1.1 | Accepted | PDR-0001, MVP-0001, UX-0001, UI-0001 | Aucune, web et mobile déjà implémentés |
| DEC-0009 | Offline Resilience and Deep Linking | 1.0 | Accepted | PDR-0001, PDR-0002, MVP-0001, UX-0001, RFC-0001 | Aucune, comportement déjà implémenté |

## Artefacts de recherche

- DATA-0002 raw input: [montreal-source-watchlist-raw.md](data/research/montreal-source-watchlist-raw.md)
- DATA-0002 normalized registry: [montreal-source-registry.csv](data/research/montreal-source-registry.csv)
- DATA-0002 pilot baseline: [montreal-source-pilot-v1.md](data/research/montreal-source-pilot-v1.md)

## Ordre de construction validé

1. Product Principles — Accepted.
2. Modèle d'interaction et périmètre MVP — Accepted.
3. User Journeys — Accepted comme parcours cibles du MVP ; les tests d'utilisabilité restent à réaliser sur prototype.
4. Modèle de données et de confiance — Draft 0.3, suffisant pour le PRD initial mais insuffisant pour implémenter l'ingestion.
5. Écrans et flux UX — UX-0001 1.1, terminé et Accepted.
6. PRD-0001 — exigences produit 1.1 terminées et Accepted.
7. RFC-0001 — architecture cœur 1.1 terminée et Accepted.
8. L'implémentation est désormais autorisée conformément à AGENTS.md, sous réserve des gates techniques, fonctionnels, d'ingestion, de déploiement et de lancement définis par RFC-0001.
9. Le monorepo incrémental, les versions exactes, les contrats partagés, l'API, le web, la validation d'exécution PostgreSQL/PostGIS et la validation technique du development build Android natif avec rendu visible MapLibre sont réalisés. Les preuves ont été revues et DEC-0002 version 1.0 est Accepted.
10. Functional Sprint 1 — Free Exploration est réalisé avec des données fictives : accès anonyme, cadrage initial de Montréal, fenêtre glissante de sept jours, sélection d'un marqueur, aperçu, détails, informations d'adresse et d'accès, destination externe et retour au contexte cartographique ont été validés sur le web responsive et Android.
11. Functional Sprint 2 — Manual Map Filters est réalisé avec des données fictives : les valeurs et sémantiques Accepted de date/heure, catégorie et prix filtrent la zone cartographique courante côté serveur ; les critères actifs, la suppression individuelle, la réinitialisation, l'état vide et le retour au contexte filtré sont validés sur le web desktop, mobile-responsive et Android natif. Sur Android 16 API 36, la validation interactive a confirmé les catégories en OR, les familles en AND, All/Free/Paid, Tonight, la suppression individuelle, la réinitialisation, la récupération depuis l'état vide, le retour depuis Event Details avec le contexte filtré préservé et la fermeture sûre d'un aperçu devenu obsolète. L'ANR de System UI a été isolé à l'environnement d'émulation, sans erreur fatale de com.pulso.mobile, React Native ou MapLibre.
12. Functional Sprint 3 — Transparent Intelligent Search Foundation est réalisé avec des données fictives et sans fournisseur d'IA externe : la recherche optionnelle et anonyme interprète de façon déterministe les critères MVP pris en charge, distingue contraintes strictes et signaux de classement, affiche les résultats sur la carte existante et explique les correspondances exactes, alternatives, demandes de clarification et absences de résultat fiable. Les critères dérivés restent modifiables avec les filtres manuels, le contexte est préservé jusqu'aux détails et au retour à la carte, et aucune requête brute n'est persistée. Le parcours est validé sur le web desktop, mobile-responsive et Android 16 API 36.
13. DEC-0003 — MVP Language Policy version 1.0 est Accepted. Le français et l'anglais sont les deux langues du MVP pour l'interface Pulso, les filtres, les retours de confiance et d'accessibilité, ainsi que la recherche intelligente déterministe. La préférence initiale suit la langue prise en charge du navigateur ou de l'appareil, le français sert de langue de repli, et le choix manuel est conservé localement sans compte. Le contenu provenant des sources d'événements reste dans sa langue d'origine et aucun fournisseur externe de traduction ou d'IA n'est introduit.
14. Functional Sprint 4 — Bilingual French/English MVP est implémenté dans les couches partagées, l'API, le web responsive et l'application mobile : détection d'une langue prise en charge, repli français, choix manuel local sans compte, interface et accessibilité bilingues, formats montréalais, filtres et recherche déterministe bilingues, et conservation du contenu événementiel externe dans sa langue source. Les tests unitaires, contractuels, PostgreSQL/PostGIS et Playwright desktop/mobile-responsive valident les deux langues et la parité des résultats. La génération, compilation x86_64, installation et le rendu natif bilingue sur l'émulateur Android 16 / API 36 sont validés avec expo-localization, AsyncStorage et MapLibre ; les preuves restent hors du dépôt.
15. UI-0001 — Visual Identity and Branding version 1.0 est Accepted. Le logo V5 est l'identité officielle Pulso et ses assets canoniques sont dans `Brand/production/approved/v1`. La géométrie externe du symbole, son point centré, le wordmark vectoriel tracé sur mesure, l'absence de tagline, le gradient de marque `#7336C1` → `#EA3E81` → `#FE7C5C`, le thème MVP sombre, la provenance textuelle des sources et les contraintes de droits DATA-0001 sur les images restent contraignants. Le gradient du logo ne remplace pas la palette sémantique Accepted. Les planches de référence et les candidats V1–V4 restent non-binding.
16. Visual Sprint 5 — l'identité canonique Approved est intégrée sans changement de comportement : le web référence le logo horizontal et les favicons depuis des copies runtime de `Brand/production/approved/v1`; Android référence l'icône opaque, le foreground adaptatif, le splash et le logo horizontal canoniques. La palette sombre Accepted et la typographie locale sont appliquées aux surfaces web et Android. Les validations PostGIS, Playwright desktop et Pixel 7, compilation, installation et rendu Android x86_64 confirment les interactions existantes; la correction limitée des événements pointeur de l'état de statut laisse les marqueurs accessibles tout en conservant le contrôle de reprise interactif. Les preuves visuelles et les logs restent hors du dépôt.
17. Development basemap checkpoint — le spike de géographie réelle est terminé sur le web : la validation visuelle de Montréal et de six marqueurs fictifs, Playwright desktop 5/5, Playwright Pixel 7 responsive 5/5, les intégrations PostGIS/API 12/12 et la vérification complète du dépôt sont réussis. OpenFreeMap Liberty reste un fallback de développement configurable par environnement; Carto dark est un candidat visuel intentionnel, sans approbation de fournisseur de production. Le style sombre Pulso final, ses couches, son accessibilité et les revues de fournisseur restent en attente. La validation visible du basemap Android est différée : `com.android.systemui` a produit des ANR sur deux AVD, sans exception Pulso ni échec applicatif MapLibre observé. Cette preuve reste requise avant l'acceptation de DEC-0004.
18. DEC-0005 — Explore Search Placement version 1.0 est Accepted. Son implémentation intentionnelle est en cours dans le travail applicatif non audité et non commité : le champ persistant en haut d'Explorer doit préserver les comportements de recherche et de filtres. La sélection d'un résultat ne doit pas appeler `onClear()` ; seul un effacement explicite peut retirer le contexte de recherche.
19. Data Sprint 1 — la watchlist produit de Montréal est capturée dans les artefacts de recherche DATA-0002, puis normalisée pour vérification et pilote (267 entrées brutes littérales, 264 sources normalisées, avec trois consolidations de comptes partagés). Pulso Scout (DEC-0006) est un workstream Instagram expérimental requis : aucun connecteur d'ingestion ni automatisation authentifiée n'existe. Instagram, billetteries et calendriers officiels seront évalués ensemble; les candidats ne sont jamais publiés sans preuve et revue.
20. DEC-0007 — Anonymous Favorites Continuity version 1.0 est Accepted. Les favoris locaux sans compte sont une décision produit intentionnelle, mais leur implémentation applicative actuelle reste non auditée et non commitée. Une future création ou connexion de compte devra importer et fusionner les favoris locaux avec les favoris de compte par union d'identifiants d'événement stables, sans doublon ni suppression silencieuse.
21. Audit du travail non commité (DEC-0005, DEC-0007) — corrections appliquées : bouton favoris bilingue (`translate()` au lieu de texte français en dur), libellés accessibles sur les boutons cœur, cohérence des variables d'environnement API (`NEXT_PUBLIC_API_BASE_URL` partout, port 3001), page `/events/[id]` bilingue et alignée sur la palette. `packages/domain/src/colors.ts` est un doublon mort de l'export déjà présent dans `index.ts`, à retirer manuellement.
22. DEC-0008 — Event Sharing version 1.0 est Accepted, formalisant le partage d'événement déjà implémenté sur mobile (lien Pulso uniquement, aucune donnée de compte). DEC-0009 — Offline Resilience and Deep Linking version 1.0 est Accepted, formalisant le cache stale-while-revalidate déjà implémenté (web et mobile) et le deep link `?eventId=` déjà implémenté sur web. DEC-0004 reste Draft ; une note y documente que Carto dark est désormais le fallback codé par défaut, sans que cela satisfasse le gate d'acceptation (revue accessibilité et validation Android toujours requises).
23. DATA-0003 — Ingestion API Landscape version 0.4 est Draft. Recherche effectuée sur les APIs réelles disponibles : données ouvertes de la Ville de Montréal (gratuit, sans clé, complémentaire), Ticketmaster Discovery API (clé gratuite, quota confirmé 5000/jour et 5 req/s), Shotgun (pas d'API publique de découverte trouvée, accès organisateur seulement), Eventbrite (recherche publique retirée depuis 2020), Facebook Graph API (accès Page nécessite App Review), Instagram Business Discovery (route légitime pour Pulso Scout sur la liste fixe DATA-0002, nécessite une app Meta et un compte Instagram professionnel liés). Un nouveau package `@pulso/ingestion` implémente des connecteurs pour données ouvertes Montréal, Ticketmaster, calendriers ICS génériques et signaux Instagram Scout, produisant un type `RawIngestedEvent` distinct de `PublicEvent` — aucun id, confiance ou déduplication n'est assigné par les connecteurs.
24. Vérification réelle : `pnpm test` à la racine confirme 106 tests verts (7 pour `@pulso/ingestion`, qui s'aligne désormais sur le script `test` racine comme les autres packages plutôt que d'en définir un local cassé). Le connecteur Ticketmaster a été exécuté en conditions réelles avec une clé valide : 200 événements de Montréal récupérés. Anomalie de données découverte et corrigée : 26 % des événements (52/200), dont des lieux connus comme le Centre Bell, portaient des coordonnées `(0, 0)` renvoyées telles quelles par Ticketmaster plutôt qu'omises. `mapTicketmasterEvent` traite désormais `(0, 0)` comme une absence de coordonnées, conformément à la règle UX-0001 selon laquelle un événement sans coordonnées exploitables ne doit jamais être présenté comme correctement positionné. Le connecteur données ouvertes Montréal et le connecteur Instagram Scout restent à valider en conditions réelles.
25. Règle de récupération de coordonnées ajoutée (`enrichMissingCoordinates`) : si un événement n'a pas de point mais a une adresse ou un nom de lieu connu, Pulso géocode cette adresse via OpenStreetMap Nominatim (gratuit, sans clé, limité à 1 requête/seconde par leur politique d'usage) plutôt que de faire confiance à des coordonnées absentes ou invalides. Si aucune adresse ni nom de lieu n'existe, aucune recherche web ouverte n'est effectuée pour en inventer une : l'événement est marqué `needs_research` pour revue humaine, conformément au principe déjà posé par DEC-0006 qu'aucun candidat n'est publié sans preuve ni revue. Le nouveau champ `pointResolution` (`source`/`geocoded`/`unresolved`/`needs_research`) doit informer le futur calcul de `locationConfidence` plutôt que d'être perdu.
26. Première proposition de mapping RawIngestedEvent → PublicEvent (`packages/ingestion/src/mapping/`) : id déterministe par hash de la clé de dédoublonnage, exclusion des catégories `unmapped` plutôt que de deviner (protège le périmètre festif/musical/nightlife du MVP), exclusion des événements sans point résolu plutôt que d'inventer une coordonnée, confiance et fraîcheur calculées avec des seuils volontairement provisoires en attendant PRD-0001, déduplication multi-sources avec la source la plus autoritaire comme source unique du contrat et les autres conservées hors contrat. Deux vraies limites de contrat sont documentées comme points ouverts plutôt que contournées silencieusement : `PublicEvent.venue.point` n'a aucune représentation pour "position inconnue", et `PublicEvent.source` ne supporte qu'une seule source alors que DATA-0001 en autorise plusieurs. Cette proposition nécessite une revue produit, pas seulement technique, une fois DATA-0001 plus proche d'Accepted.

## Prochaine tâche

La prochaine tâche doit être définie séparément conformément aux décisions produit Accepted. L'intégration de l'identité visuelle canonique dans les surfaces web et mobile existantes est terminée conformément à UI-0001 1.0; elle n'a introduit ni traduction automatique du contenu événementiel externe, ni fournisseur externe, ni fonctionnalité produit.

Les validations PostgreSQL/PostGIS et Android sont terminées et leurs preuves de compilation, d'installation, de lancement et de rendu visible du même point synthétique avec MapLibre sont acceptées. Cette décision n'ajoute aucune fonctionnalité produit et ne met en œuvre ni ingestion réelle, ni authentification, ni fournisseur d'IA ou autre fournisseur de production.

La recherche préalable à l'ingestion demeure la prochaine tâche majeure de données. Data Sprint 2 doit rester isolé et validé des travaux UI non audités avant toute implémentation. Le pilote validé doit établir les preuves de sources, calendriers, billetteries et contraintes Instagram avant toute implémentation. Le Montréal sample d'ingestion documenté, la baseline de prototype d'utilisabilité, les choix de fournisseurs de production, la validation du déploiement et l'approbation des seuils numériques de lancement restent des obligations aux étapes définies par RFC-0001. Elles ne bloquent pas le scaffold initial lorsqu'elles ne concernent pas directement sa compatibilité technique.

## Classification des évolutions

### MVP

- Montréal ;
- événements festifs, musicaux et de soirée ;
- carte, filtres, recherche intelligente et fiches ;
- redirection vers les billetteries ;
- affiliation lorsqu'elle est disponible ;
- accès sans compte et favoris locaux ; compte facultatif uniquement pour la synchronisation après fusion ;
- site responsive et application mobile.

### Roadmap

- autres villes ;
- réservation directe si sa faisabilité est confirmée ;
- stockage des billets et portefeuille de titres.

### Vision

- identité numérique ;
- preuve de majorité 18+ ou 21+.
