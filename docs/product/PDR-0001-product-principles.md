# PDR-0001 — Product Principles

**Version :** 1.1  
**Status :** Accepted  
**Dépendances :** None

## Pourquoi ce document existe

Pulso évoluera.

Les fonctionnalités évolueront.

Le design évoluera.

La technologie évoluera.

Mais ces principes ne doivent pratiquement jamais changer.

Ils représentent l'ADN du produit.

Chaque décision devra pouvoir être justifiée par au moins un de ces principes.

## Principe 1 — Pulso répertorie les événements pour faire découvrir des expériences

Pulso est d'abord un répertoire complet d'événements géolocalisés.

L'utilisateur peut ouvrir Pulso, parcourir la carte et découvrir librement tout ce qui existe autour de lui.

Il n'est pas obligé de formuler une intention, d'effectuer une recherche ou de demander une recommandation.

Les données doivent être claires, utiles et agréables à explorer.

Lorsqu'un utilisateur demande de l'aide, Pulso peut transformer cette base d'événements en recommandations pertinentes.

L'expérience est le résultat recherché pour l'utilisateur. Le répertoire d'événements reste le cœur du produit.

## Principe 2 — La carte est le centre du produit

Peu importe la façon dont l'utilisateur interagit avec Pulso.

Il finit toujours sur une carte.

Les listes.

Les recommandations.

La recherche IA.

Les filtres.

Tout converge vers la carte.

La carte est notre langage universel.

## Principe 3 — L'IA simplifie, elle ne remplace pas

Chaque fonctionnalité doit rester utilisable sans IA.

Inversement.

Chaque fonctionnalité importante doit pouvoir être pilotée en langage naturel.

Les deux approches coexistent.

Aucune n'est imposée.

L'exploration manuelle constitue l'usage principal de Pulso.

L'IA est une capacité complémentaire, activée lorsque l'utilisateur formule une demande.

## Principe 4 — La confiance est sacrée

Une mauvaise donnée est pire qu'une donnée absente.

Si nous avons un doute.

Nous le montrons.

Si une information n'est pas confirmée.

Nous le signalons.

La confiance utilisateur est notre actif le plus précieux.

## Principe 5 — Une réponse en moins de 60 secondes

Depuis l'ouverture de Pulso jusqu'au choix d'une sortie.

Le parcours complet doit prendre moins d'une minute.

Chaque fonctionnalité ajoutée devra préserver cette promesse.

## Principe 6 — La découverte doit être agréable

Pulso n'est pas un moteur de recherche froid.

Ouvrir Pulso doit donner envie de sortir.

L'application doit transmettre l'énergie d'une ville.

Jamais celle d'une base de données.

## Principe 7 — Les filtres sont toujours disponibles

Même avec la meilleure IA.

Certains utilisateurs préfèrent explorer.

Les filtres ne disparaîtront jamais.

Ils restent un moyen rapide et précis de naviguer.

## Principe 8 — Les recommandations doivent être expliquées

Si Pulso recommande quelque chose.

L'utilisateur doit comprendre pourquoi.

Exemple :

Recommandé parce que :

- Gratuit
- À 12 minutes
- Commence dans une heure
- Correspond à votre recherche

L'IA ne décide jamais dans une boîte noire.

## Principe 9 — Une fonctionnalité = un problème résolu

Aucune fonctionnalité ne sera développée uniquement parce qu'elle est « intéressante ».

Chaque fonctionnalité doit résoudre un problème réel identifié chez les utilisateurs.

## Principe 10 — Le MVP avant tout

Lorsque plusieurs directions sont possibles.

Nous choisissons toujours celle qui permet :

- de lancer plus rapidement ;
- d'apprendre plus vite ;
- de limiter la complexité.

La simplicité est une stratégie.

## Principe 11 — Les données sont un produit

Pulso ne construit pas uniquement une interface.

Nous construisons progressivement la meilleure base de connaissances sur les expériences locales.

Chaque enrichissement améliore le produit.

## Principe 12 — Chaque décision doit renforcer notre avantage concurrentiel

Avant de développer une fonctionnalité.

Nous nous poserons toujours cette question :

Est-ce qu'elle rend Pulso plus difficile à reproduire ?

Si la réponse est non.

Elle mérite probablement d'être reconsidérée.

## Notre définition du succès

Un utilisateur ouvre Pulso.

Il peut immédiatement parcourir les événements disponibles sur la carte, sans devoir expliquer ce qu'il recherche.

S'il souhaite être aidé, il peut formuler une demande en langage naturel.

En moins d'une minute, il trouve ou choisit une expérience pertinente.

Il découvre une expérience qu'il n'aurait probablement jamais trouvée autrement.

Il passe une excellente soirée.

Puis il ouvre naturellement Pulso la fois suivante.

C'est notre définition du succès.

## Surfaces du produit

Pulso est conçu comme une application et comme un site web.

Ces deux surfaces donnent accès au même répertoire d'événements, à la même carte, aux mêmes filtres et à la même recherche intelligente.

Le produit ne doit pas être pensé comme une expérience exclusivement mobile ou exclusivement web.

## Ce document nous servira dans cinq ans

Je pense qu'il faut prendre une décision dès aujourd'hui : ne pas écrire de documentation pour faire joli.

Chaque PDR devra être un document qui change concrètement notre manière de construire le produit. Si, dans six mois, une décision ne peut pas s'appuyer sur un PDR existant, alors soit il manque un principe, soit la décision est mal justifiée.

Et maintenant, je pense que nous arrivons au document le plus important de toute la phase produit.

Pas le PRD.

Pas l'architecture.

Les User Journeys.

Parce que c'est là que nous allons découvrir si notre produit est réellement simple.

Je veux littéralement suivre un utilisateur seconde par seconde :

> « Je suis nouveau à Montréal. Il est vendredi 19h. Je ne sais pas quoi faire. »

À partir de ce moment, nous allons dessiner tout son parcours jusqu'à son arrivée à l'événement.

Ce parcours devra couvrir deux usages distincts :

- l'utilisateur explore librement la carte et les filtres ;
- l'utilisateur formule une demande et reçoit des propositions expliquées.

Si ce parcours est fluide, le produit sera fluide.

Si ce parcours est compliqué, nous le verrons avant même d'écrire une ligne de code.

À mon avis, c'est le meilleur investissement que nous puissions faire maintenant. C'est ce document qui donnera ensuite naissance aux écrans, au PRD et à l'architecture.
