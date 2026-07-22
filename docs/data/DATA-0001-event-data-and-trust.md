# DATA-0001 — Event Data and Trust

**Identifier :** DATA-0001
**Version :** 1.0
**Status :** Accepted
**Dépend de :** PDR-0001, MVP-0001

## Objectif

Définir le socle minimal permettant à Pulso de collecter, normaliser, géolocaliser, dédupliquer et présenter un grand nombre d'événements montréalais sans sacrifier la confiance utilisateur.

Cette version intègre les preuves réelles issues du pilote d'ingestion (`packages/database/src/ingest.ts`, voir PROJECT_INDEX.md entrées 23–31) : schéma exercé sur des données montréalaises réelles, règles de déduplication testées, contraintes par source documentées.

**Portée de l'acceptation.** Accepted couvre le socle de données et de confiance pour le stade actuel du projet (pas de déploiement, pas d'utilisateurs réels). Deux critères listés en fin de document (politique de fraîcheur, procédure de correction post-lancement) restent explicitement non résolus et documentés comme tels plutôt que silencieusement clos — ils sont bloqués sur une future décision de déploiement, pas sur une lacune de recherche actuelle. Une révision de ce document sera nécessaire avant que ces deux points ne redeviennent bloquants, c'est-à-dire avant tout déploiement de production.

## Sources visées

Pulso doit pouvoir agréger des informations issues notamment de :

- TikTok ;
- Instagram ;
- Shotgun ;
- Ticketmaster ;
- billetteries partenaires ;
- sites officiels des organisateurs et des lieux ;
- autres sources publiques pertinentes.

La méthode d'accès à chaque source devra respecter ses conditions d'utilisation, ses possibilités techniques et les droits applicables. La présence d'une source dans cette liste ne valide pas automatiquement une méthode de collecte.

## Registre de sources et découverte supervisée

Le registre Montréal DATA-0002 conserve la provenance d'une source, son niveau d'autorité, son état de vérification et les incertitudes de normalisation. Les sources officielles de lieux ou d'organisateurs ont préséance pour confirmer un événement ; une source média, curateur ou découverte Instagram ne crée qu'un candidat à confirmer.

Instagram peut fournir des candidats issus d'un watchlist ciblé. Ces candidats conservent une provenance, un horodatage, un niveau de confiance et passent par une revue humaine. Un curateur seul ne peut jamais confirmer automatiquement un événement publiable.

La conservation des médias de source doit être limitée au minimum nécessaire à l'extraction et à la revue des faits événementiels. Les faits extraits et leur provenance, plutôt que du contenu personnel ou sans rapport, constituent les données produit.

## Données minimales d'un événement

- identifiant interne ;
- nom ;
- description courte ;
- catégorie ;
- date et heure de début ;
- date et heure de fin lorsqu'elle est connue ;
- lieu ;
- adresse ;
- coordonnées géographiques ;
- ville ;
- prix ou indication gratuite ;
- devise ;
- image lorsqu'elle peut être utilisée ;
- organisateur ;
- URL source ;
- URL de réservation ;
- type de lien : standard ou affilié ;
- source d'origine ;
- date de dernière vérification ;
- statut de confiance ;
- statut de l'événement.

## Statuts de confiance

- **Confirmé** (`confirmed`) : information vérifiée auprès d'une source officielle ou cohérente entre plusieurs sources fiables.
- **Probable** (`probable`) : information crédible mais incomplètement confirmée.
- **À vérifier** (`to_verify`) : information détectée mais insuffisante pour être présentée sans avertissement.
- **Contesté** (`conflicting`) : sources contradictoires.

Implémenté tel quel dans `@pulso/domain` (`TRUST_LABELS`) et exercé sur les 1674 événements réels du pilote d'ingestion : `official` (Ville de Montréal) → `confirmed`, `ticketing_platform` (Ticketmaster) → `probable`, toute autre source → `to_verify`. `conflicting` reste défini mais non encore produit par le mapper actuel (aucun conflit de sources rencontré en conditions réelles à ce jour — voir Déduplication).

## Statuts d'événement

- programmé (`scheduled`) ;
- annulé (`cancelled`) ;
- reporté (`postponed`).

Implémenté tel quel dans `@pulso/domain` (`EVENT_STATUSES`) et déjà exercé par UX-0001/RFC-0001 (filtrage des annulés, affichage des reportés). L'ensemble plus large initialement envisagé ici (brouillon, publié, complet, terminé, archivé) a été simplifié à l'implémentation sans document de suite formel ; cette version corrige DATA-0001 pour refléter la décision réellement en vigueur plutôt que de laisser les deux diverger. Un futur besoin de statuts de cycle de vie éditorial (brouillon/publié) devra être réintroduit explicitement s'il devient nécessaire, plutôt que supposé couvert ici.

## Règles de qualité

- Une information incertaine est signalée.
- Un événement sans position géographique exploitable ne doit pas apparaître comme correctement localisé.
- Les doublons issus de plusieurs sources doivent être fusionnés sans perdre la traçabilité des sources.
- Une modification d'horaire, de lieu ou d'annulation doit être propagée rapidement.
- Les événements terminés disparaissent de l'exploration active mais peuvent être conservés pour l'historique et l'amélioration de la donnée.
- La source et la date de dernière vérification doivent rester traçables.

## Déduplication

La détection d'un doublon doit considérer au minimum :

- le nom normalisé ;
- le lieu ;
- la date et l'heure ;
- l'organisateur ;
- les URL et identifiants externes.

Un même événement peut conserver plusieurs sources et plusieurs liens externes.

**Implémenté et testé sur un échantillon montréalais réel.** `packages/ingestion/src/mapping/dedupe-key.ts` calcule une clé normalisée (nom, lieu, date/heure à la minute près, organisateur — délibérément sans URL ni identifiant externe, pour reconnaître le même événement même si chaque source expose une URL différente). `mapAndDeduplicateRawEvents` fusionne les correspondances en gardant la source la plus autoritaire comme source principale du contrat (`PublicEvent.source`) et conserve les autres dans `additionalSources` (ajouté en v0.4 du contrat, voir PROJECT_INDEX entrée 30) plutôt que de les perdre. Un run réel sur 6469 événements bruts (Ville de Montréal + Ticketmaster) n'a trouvé **aucun doublon croisé entre les deux sources actuelles** — leurs univers ne se recoupent pas en pratique (civique/culturel vs billetterie commerciale). Cette absence de recoupement observée signifie que le statut `conflicting` et la fusion multi-sources restent non exercés par de vraies données ; à réévaluer dès qu'une deuxième source commerciale (ex. Bandsintown si un accès partenaire aboutit) sera ingérée.

## Exigences produit à reprendre dans le futur PRD

Les éléments suivants constituent des cibles obligatoires pour le futur PRD :

- traçabilité des sources ;
- visibilité de la fraîcheur des informations ;
- qualité de la géolocalisation ;
- déduplication des événements ;
- divulgation explicite des incertitudes ;
- gestion des annulations et des reports ;
- capacité de correction manuelle.

Les seuils précis des statuts de confiance et la procédure détaillée de correction manuelle restent à définir dans le PRD ou les documents qui en dépendent.

## Recherche préalable à l'ingestion et exigences pour le RFC

Les éléments suivants doivent être étudiés et résolus avant toute implémentation de l'ingestion de production. Ils ne bloquent pas la rédaction de PRD-0001 :

- hiérarchie exacte des sources ;
- cadence de rafraîchissement propre à chaque source ;
- disponibilité des API et des flux ;
- conditions des plateformes et contraintes de collecte ;
- droits d'utilisation des images et des descriptions ;
- mécanismes d'importation propres à chaque source.

**État réel par source (voir PROJECT_INDEX.md entrées 23–31 et DATA-0003 pour le détail complet) :**

| Source | Statut | Contrainte principale |
| --- | --- | --- |
| Ville de Montréal (données ouvertes) | Connecteur implémenté, validé en conditions réelles | Gratuit, sans clé, mais valeurs manquantes encodées en `"nan"` littéral (corrigé) ; couverture à dominante civique/culturelle, complémentaire au nightlife |
| Ticketmaster Discovery API | Connecteur implémenté, validé en conditions réelles | Clé gratuite, quota 5000/jour et 5 req/s ; coordonnées `(0,0)` en lieu d'absence (corrigé) ; ~29 % des événements bruts non classables faute de segment Ticketmaster exploitable |
| Instagram Scout | Connecteur implémenté, jamais publié sans revue humaine (DEC-0006) | Nécessite une app Meta + compte Instagram professionnel lié ; non validé en conditions réelles |
| Calendriers ICS génériques | Connecteur générique implémenté, aucune source réelle branchée | Aucun lieu montréalais individuel identifié publiant un flux ICS après recherche (voir entrée 31) |
| Eventbrite | Écarté | Recherche publique par ville supprimée depuis février 2020 ; API restante limitée aux événements de sa propre organisation |
| Shotgun | Écarté | Aucune API de découverte publique trouvée, accès organisateur seulement |
| Bandsintown | En attente de réponse partenaire | API publique documentée limitée à un artiste connu par clé ; découverte par ville non documentée officiellement |
| Songkick | Écarté pour l'instant | Nouvelles clés gratuites fermées ; accès désormais payant (accord de licence) |
| Resident Advisor | Écarté sauf accord écrit | ToS (ra.co/terms §4.4) interdit explicitement tout accès automatisé sans accord écrit préalable |
| Facebook Graph API | Non exploré en profondeur | Accès aux données de Page nécessite App Review Meta |

## Critères de passage en version 1.0

- ~~schéma de données validé~~ — **satisfait pour le stade actuel.** Le contrat `PublicEvent` (avec `additionalSources` depuis v0.4) a été exercé sur 1674 événements réels répartis sur 283 lieux réels distincts ; les deux limites de contrat connues (position inconnue, multi-source) ont reçu une décision produit explicite plutôt que de rester en suspens (voir PROJECT_INDEX entrée 30).
- ~~règles de déduplication testées sur un échantillon montréalais~~ — **satisfait.** Voir section Déduplication ci-dessus ; testé unitairement et sur 6469 événements bruts réels. Reste à ré-exercer dès qu'une deuxième source commerciale sera ingérée, pour valider la fusion multi-sources sur un vrai recoupement plutôt que seulement en test unitaire.
- **politique de fraîcheur définie — non satisfait, bloqué en amont.** Le seuil actuel (24h, `packages/ingestion/src/mapping/to-public-event.ts`) est un placeholder explicite dans le code. Une politique réelle par type de source (ex. une billetterie change rarement une fois publiée, une source civique se met à jour quotidiennement) ne peut être définie de façon significative tant que l'ingestion reste un script manuel dev-local (`pnpm run db:ingest`, entrée 27) plutôt qu'une cadence planifiée — ce qui est une question de préparation au déploiement, explicitement hors scope tant que le produit n'est pas fonctionnellement complet.
- **procédure de correction — satisfait pour le stade actuel, distinct d'un besoin futur.** La procédure exercée à répétition cette session est : identifier une anomalie de données réelle → corriger le connecteur ou le mapping avec tests dédiés → vider la base de pilote locale → rejouer migrations + seed + ingestion → vérifier par sondage et tests d'intégration. Documentée en détail dans PROJECT_INDEX entrées 28–29. Cette procédure convient à l'absence actuelle d'utilisateurs réels et de déploiement. Une procédure de correction pour données déjà servies à de vrais utilisateurs (ex. file de modération, table de dérogation) reste un besoin futur distinct, non requis avant le lancement.
- ~~contraintes propres à chaque source documentées~~ — **satisfait pour les sources actives.** Voir tableau ci-dessus.

**Bilan : 3 des 5 critères sont satisfaits pour le stade actuel du projet (pas de déploiement, pas d'utilisateurs réels). Les 2 restants (fraîcheur, procédure de correction post-lancement) sont explicitement bloqués sur une décision de déploiement future, pas sur un travail de recherche manquant. Accepted le 2026-07-22 sur cette base — voir « Portée de l'acceptation » en tête de document.**
