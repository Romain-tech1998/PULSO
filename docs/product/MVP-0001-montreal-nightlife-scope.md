# MVP-0001 — Montréal Nightlife Scope

**Version :** 1.2
**Status :** Accepted  
**Dépend de :** PDR-0001, PDR-0002, DEC-0014

## Objectif

Lancer à Montréal une plateforme qui regroupe sur une carte le plus grand nombre possible d'événements festifs, musicaux et de soirée correctement référencés.

Le MVP n'est pas limité à un seul type d'événement. Son périmètre est l'ensemble des sorties programmées qui composent la vie festive et nocturne de Montréal.

## Ville de lancement

Le MVP couvre uniquement **Montréal**.

L'ouverture d'autres villes relève de la Roadmap et ne doit pas complexifier le lancement montréalais.

## Événements inclus dans le MVP

- concerts ;
- soirées en boîte de nuit ;
- événements et soirées organisés dans des bars ;
- DJ sets ;
- événements musicaux ;
- festivals et événements festifs programmés ;
- spectacles ;
- comedy clubs et spectacles d'humour ;
- autres expériences locales programmées correspondant à une sortie festive ou de soirée.

La liste **Lieux** reste guidée par la programmation : elle affiche uniquement les lieux comprenant au moins un événement admissible entre aujourd'hui et la fin du quatorzième jour civil montréalais inclus.

Par exception documentée dans DEC-0014, la carte peut aussi afficher des lieux récurrents de sortie montréalais vérifiés — notamment des bars, clubs et salles culturelles — même lorsqu'aucune programmation officielle n'est actuellement recensée. Cette exception sert l'orientation et la navigation spontanée; elle ne transforme pas Pulso en annuaire généraliste de commerces ou de restaurants.

## Proposition de valeur du MVP

Pulso doit devenir le point d'entrée le plus complet pour savoir quelles sorties existent à Montréal.

La valeur repose sur :

1. la quantité d'événements collectés ;
2. leur géolocalisation correcte ;
3. la fraîcheur et la fiabilité des informations ;
4. leur regroupement dans une interface unique ;
5. la possibilité d'explorer ou de rechercher intelligemment.

## Fonctionnalités incluses

- site web responsive ;
- application mobile reposant autant que possible sur une base produit commune ;
- carte interactive ;
- événements géolocalisés ;
- filtres traditionnels ;
- recherche intelligente en langage naturel ;
- fiches événement ;
- liste de lieux avec une programmation dans les quatorze jours ;
- fiches de lieu avec description factuelle, adresse et événements séparés entre aujourd'hui et les quatorze prochains jours ;
- repères cartographiques de lieux de sortie récurrents vérifiés, y compris sans programmation officielle actuellement recensée ;
- indication de la source et du niveau de confiance ;
- redirection vers la billetterie ou la source externe ;
- liens affiliés lorsqu'ils sont disponibles ;
- consultation complète sans compte ;
- création facultative d'un compte ;
- favoris locaux sans compte ; synchronisation entre appareils seulement après création ou connexion facultative d'un compte, conformément à DEC-0007.

## Réservation dans le MVP

Pulso ne vend pas et ne stocke pas directement les billets dans le MVP.

Le bouton de réservation redirige vers un service externe, notamment lorsqu'un événement est disponible sur Shotgun, Ticketmaster ou une autre billetterie.

Un lien affilié est utilisé lorsqu'un programme compatible existe.

## Exclusions du MVP

- réservation ou paiement natif dans Pulso ;
- stockage des billets dans Pulso ;
- portefeuille de billets de transport ou d'événements ;
- identité numérique ;
- certification d'âge 18+ ou 21+ ;
- déploiement dans plusieurs villes ;
- annuaire général de restaurants, commerces ou établissements sans rapport direct avec les sorties festives et culturelles ;
- présence en liste d'un lieu sans événement admissible dans les quatorze jours.

## Roadmap

- réservation directe, sous réserve de faisabilité commerciale, juridique et technique ;
- stockage des billets de concert et autres titres ;
- portefeuille de billets ;
- filtre d'ambiance pour les événements et les lieux, uniquement lorsqu'une taxonomie fiable et une méthode de qualification vérifiable (éditoriale ou assistée par IA) auront été approuvées ;
- extension à d'autres villes.

## Vision

- identité numérique permettant notamment de prouver une condition d'âge sans exposer inutilement les données personnelles ;
- certification 18+ ou 21+ auprès de partenaires compatibles.

Ces éléments de Vision ne doivent introduire aucune complexité dans le MVP.

## Critères de succès du lancement

- Un utilisateur peut trouver des événements à Montréal sans créer de compte.
- Les catégories principales de sorties sont représentées.
- Chaque événement est correctement positionné sur la carte.
- Les informations essentielles sont fraîches, sourcées et compréhensibles.
- Un utilisateur peut atteindre la billetterie externe depuis la fiche événement.
- Un utilisateur peut ajouter, retirer et consulter ses favoris localement sans créer de compte ; une connexion facultative préserve et fusionne ensuite ces favoris pour la synchronisation entre appareils, conformément à DEC-0007.
