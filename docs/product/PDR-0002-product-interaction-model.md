# PDR-0002 — Product Interaction Model

**Version :** 1.0  
**Status :** Accepted  
**Dépend de :** PDR-0001 — Product Principles

## Décision

Pulso est d'abord un répertoire d'événements géolocalisés.

Sa fonction principale est de regrouper le plus grand nombre possible de soirées et d'expériences festives locales, puis de les rendre immédiatement explorables sur une carte.

L'utilisateur n'a pas besoin de formuler une intention pour utiliser Pulso.

## Mode principal — Explorer

À l'ouverture, l'utilisateur peut :

- consulter directement la carte ;
- voir les événements disponibles autour de lui ;
- déplacer et zoomer la carte ;
- utiliser les filtres traditionnels ;
- ouvrir la fiche d'un événement ;
- accéder au site de réservation externe.

L'exploration libre constitue l'usage principal du MVP.

## Mode complémentaire — Recherche intelligente

Lorsqu'il le souhaite, l'utilisateur peut décrire sa recherche en langage naturel.

Exemple :

> « Je cherche une soirée techno pas trop chère à moins de 20 minutes ce soir. »

Pulso interprète la demande, applique les critères pertinents et affiche les résultats sur la même carte.

Les recommandations doivent expliquer les raisons de leur classement.

## Règle d'équivalence

La recherche intelligente ne crée pas un produit parallèle.

Explorer et Recherche intelligente utilisent :

- la même base d'événements ;
- la même carte ;
- les mêmes fiches ;
- les mêmes informations de confiance ;
- les mêmes liens de réservation.

## Conséquences produit

- La carte est accessible sans étape préalable.
- Les filtres ne sont jamais remplacés par l'IA.
- La barre de recherche intelligente reste visible mais non obligatoire.
- Aucun écran ne doit forcer l'utilisateur à expliquer ce qu'il veut.
- Une réponse IA doit toujours pouvoir être retrouvée et manipulée sur la carte.

## Exclusions

- Chat obligatoire avant d'accéder aux événements.
- Recommandations opaques sans justification.
- Catalogue séparé pour les résultats IA.
- Personnalisation obligatoire.

## Critères de succès

- Un nouvel utilisateur comprend immédiatement qu'il peut explorer la carte.
- Un utilisateur peut consulter un événement sans compte et sans requête IA.
- Une requête naturelle produit des résultats sur la carte sans supprimer les contrôles manuels.
