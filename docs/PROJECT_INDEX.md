# Pulso — Index du projet

**Identifiant :** INDEX-0001  
**Version :** 1.0  
**Statut :** Accepted  
**Dépendances :** None  
**Dernière mise à jour :** 2026-07-15
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
- La consultation ne nécessite aucun compte ; un compte facultatif permet initialement de conserver des favoris.
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
| MVP-0001 | Montréal Nightlife Scope | 1.0 | Accepted | PDR-0001, PDR-0002 | PRD |
| DEC-0001 | Access, Booking and Product Surfaces | 1.0 | Accepted | PDR-0001, MVP-0001 | Architecture |
| DATA-0001 | Event Data and Trust | 0.2 | Draft | PDR-0001, MVP-0001 | PRD initial, puis recherche préalable à l'ingestion et RFC |
| UJ-0001 | Free Exploration in Montréal | 1.0 | Accepted | PDR-0001, PDR-0002, MVP-0001 | Écrans, flux UX et validation sur prototype |
| UJ-0002 | Intelligent Search in Montréal | 1.0 | Accepted | PDR-0001, PDR-0002, MVP-0001 | Écrans, flux UX et validation sur prototype |
| UX-0001 | MVP Screens and Flows | 1.0 | Accepted | PDR-0001, PDR-0002, MVP-0001, DEC-0001, UJ-0001, UJ-0002, DATA-0001 | PRD-0001 |
| PRD-0001 | Pulso Montréal MVP | 1.0 | Accepted | PDR-0001, PDR-0002, MVP-0001, DEC-0001, DATA-0001, UJ-0001, UJ-0002, UX-0001 | RFC-0001 |
| RFC-0001 | Pulso Core Architecture | 1.0 | Accepted | PDR-0001, PDR-0002, MVP-0001, DEC-0001, DATA-0001, UJ-0001, UJ-0002, UX-0001, PRD-0001 | Repository scaffold and synthetic geospatial vertical slice |
| DEC-0002 | Technical Baseline | 1.0 | Accepted | PRD-0001, RFC-0001 | Authorize the next RFC-0001 implementation task separately |

## Ordre de construction validé

1. Product Principles — Accepted.
2. Modèle d'interaction et périmètre MVP — Accepted.
3. User Journeys — Accepted comme parcours cibles du MVP ; les tests d'utilisabilité restent à réaliser sur prototype.
4. Modèle de données et de confiance — Draft 0.2, suffisant pour le PRD initial mais insuffisant pour implémenter l'ingestion.
5. Écrans et flux UX — UX-0001 1.0, terminé et Accepted.
6. PRD-0001 — exigences produit 1.0 terminées et Accepted.
7. RFC-0001 — architecture cœur 1.0 terminée et Accepted.
8. L'implémentation est désormais autorisée conformément à AGENTS.md, sous réserve des gates techniques, fonctionnels, d'ingestion, de déploiement et de lancement définis par RFC-0001.
9. Le monorepo incrémental, les versions exactes, les contrats partagés, l'API, le web, la validation d'exécution PostgreSQL/PostGIS et la validation technique du development build Android natif avec rendu visible MapLibre sont réalisés. Les preuves ont été revues et DEC-0002 version 1.0 est Accepted.

## Prochaine tâche

La tâche de validation du socle technique est terminée et Accepted. La prochaine tâche d'implémentation doit être autorisée séparément conformément à la séquence de livraison et aux gates de RFC-0001.

Les validations PostgreSQL/PostGIS et Android sont terminées et leurs preuves de compilation, d'installation, de lancement et de rendu visible du même point synthétique avec MapLibre sont acceptées. Cette décision n'ajoute aucune fonctionnalité produit et ne met en œuvre ni ingestion réelle, ni recherche intelligente complète, ni authentification, ni fournisseur de production.

La recherche préalable à l'ingestion, le Montréal sample d'ingestion documenté, la baseline de prototype d'utilisabilité, les choix de fournisseurs de production, la validation du déploiement et l'approbation des seuils numériques de lancement restent des obligations aux étapes définies par RFC-0001. Elles ne bloquent pas le scaffold initial lorsqu'elles ne concernent pas directement sa compatibilité technique.

## Classification des évolutions

### MVP

- Montréal ;
- événements festifs, musicaux et de soirée ;
- carte, filtres, recherche intelligente et fiches ;
- redirection vers les billetteries ;
- affiliation lorsqu'elle est disponible ;
- accès sans compte et favoris avec compte facultatif ;
- site responsive et application mobile.

### Roadmap

- autres villes ;
- réservation directe si sa faisabilité est confirmée ;
- stockage des billets et portefeuille de titres.

### Vision

- identité numérique ;
- preuve de majorité 18+ ou 21+.
