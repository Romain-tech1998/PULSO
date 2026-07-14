# UJ-0002 — Intelligent Search in Montréal

**Version :** 1.0  
**Status :** Accepted  
**Dépend de :** PDR-0001, PDR-0002, MVP-0001

## Situation

> « Je suis nouveau à Montréal. Il est vendredi 19 h. Je cherche une soirée, mais je ne connais pas les lieux. »

L'utilisateur choisit volontairement de décrire sa demande.

## Parcours cible

| Temps | Action de l'utilisateur | Réponse de Pulso | Condition de réussite |
| --- | --- | --- | --- |
| 0–5 s | Ouvre Pulso | Affiche la carte et la barre « Que voulez-vous faire ? » | L'exploration manuelle reste disponible |
| 5–20 s | Décrit sa recherche | Identifie les critères explicites : type, moment, distance, prix ou ambiance | Aucun critère non exprimé n'est présenté comme certain |
| 20–35 s | Lance la recherche | Interroge la même base d'événements que le mode Explorer | Pas de catalogue IA séparé |
| 35–45 s | Consulte les résultats | Met en évidence les événements correspondants sur la carte | Les résultats restent filtrables |
| 45–55 s | Sélectionne une proposition | Explique pourquoi elle correspond à la demande | Justification concrète et lisible |
| 55–60 s | Ouvre la fiche | Affiche les informations vérifiées et le lien externe | Le choix peut être poursuivi sans compte |

## Réponse expliquée

Une proposition peut être justifiée par des éléments tels que :

- catégorie correspondante ;
- distance ;
- heure de début ;
- prix ;
- disponibilité connue ;
- correspondance avec les termes de la demande.

## Demande incomplète

Pulso doit privilégier une première réponse utile à partir des informations disponibles. Une question complémentaire n'est posée que si elle change réellement la qualité du résultat.

## Absence de résultat exact

Pulso distingue clairement :

- les correspondances exactes ;
- les alternatives proches ;
- l'absence de donnée fiable.

## Frictions interdites

- conversation obligatoire en plusieurs étapes ;
- résultats sans explication ;
- critères inventés et présentés comme des préférences utilisateur ;
- disparition des filtres ou de la carte ;
- recommandation d'un événement dont les informations critiques sont incertaines sans avertissement.

## Résultat attendu

En moins d'une minute, l'utilisateur obtient une sélection compréhensible d'événements réellement présents dans la base Pulso et peut poursuivre vers une fiche ou une billetterie externe.

## Statut du parcours

Ce document définit le parcours cible Accepted du MVP. Les tests d'utilisabilité et de qualité de recherche auront lieu pendant la validation du prototype et de l'implémentation.

## Points à tester

- compréhension de la barre de recherche ;
- qualité d'interprétation des demandes courantes ;
- pertinence des explications ;
- comportement quand la base contient peu de résultats ;
- passage fluide entre requête naturelle et filtres manuels.
