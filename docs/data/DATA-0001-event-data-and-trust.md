# DATA-0001 — Event Data and Trust

**Version :** 0.2  
**Status :** Draft  
**Dépend de :** PDR-0001, MVP-0001

## Objectif

Définir le socle minimal permettant à Pulso de collecter, normaliser, géolocaliser, dédupliquer et présenter un grand nombre d'événements montréalais sans sacrifier la confiance utilisateur.

Cette version fournit suffisamment d'éléments produit pour rédiger la première version de PRD-0001. Elle ne fournit pas encore les recherches et décisions nécessaires à l'implémentation d'une ingestion de production.

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

## Statuts de confiance proposés

- **Confirmé** : information vérifiée auprès d'une source officielle ou cohérente entre plusieurs sources fiables.
- **Probable** : information crédible mais incomplètement confirmée.
- **À vérifier** : information détectée mais insuffisante pour être présentée sans avertissement.
- **Contesté** : sources contradictoires.

Les libellés définitifs et leur affichage doivent être validés dans le PRD.

## Statuts d'événement proposés

- brouillon ;
- publié ;
- complet ;
- reporté ;
- annulé ;
- terminé ;
- archivé.

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

## Critères de passage en version 1.0

- schéma de données validé ;
- règles de déduplication testées sur un échantillon montréalais ;
- politique de fraîcheur définie ;
- procédure de correction définie ;
- contraintes propres à chaque source documentées.
