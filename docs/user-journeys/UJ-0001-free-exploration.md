# UJ-0001 — Free Exploration in Montréal

**Version :** 1.0  
**Status :** Accepted  
**Dépend de :** PDR-0001, PDR-0002, MVP-0001

## Situation

> « Je suis nouveau à Montréal. Il est vendredi 19 h. Je ne sais pas quoi faire. »

L'utilisateur ne souhaite pas nécessairement expliquer ses envies. Il veut d'abord voir ce qui existe.

## Parcours cible

| Temps | Action de l'utilisateur | Réponse de Pulso | Condition de réussite |
| --- | --- | --- | --- |
| 0–5 s | Ouvre Pulso | Affiche Montréal et les événements disponibles sur la carte | Aucun compte ni questionnaire |
| 5–15 s | Observe les événements autour de lui | Regroupe les marqueurs et rend les catégories compréhensibles | La carte reste lisible |
| 15–25 s | Active des filtres | Met à jour immédiatement les événements visibles | Les filtres restent modifiables |
| 25–40 s | Déplace la carte ou sélectionne un marqueur | Affiche un aperçu avec heure, lieu, prix et catégorie | Les informations essentielles sont visibles |
| 40–55 s | Ouvre une fiche | Présente les détails, la source, la confiance et l'accès à la réservation | Aucune information trompeuse |
| 55–60 s | Choisit l'événement | Affiche l'adresse et les informations d'accès connues, puis ouvre le lien externe de billetterie ou la source de l'événement lorsqu'il est applicable | Le prochain geste est évident |

## Cas sans billet

Si aucune réservation n'est nécessaire, Pulso indique clairement les modalités d'accès connues.

## Cas d'incertitude

Si une information n'est pas confirmée, Pulso l'indique avant que l'utilisateur ne prenne sa décision.

## Frictions interdites

- obligation de créer un compte ;
- obligation de répondre à un questionnaire ;
- obligation d'utiliser l'IA ;
- carte vide avant la saisie d'une recherche ;
- informations de prix ou d'horaire dissimulées ;
- redirection sans indication de la destination.

## Résultat attendu

En moins d'une minute, l'utilisateur a identifié une sortie pertinente ou a suffisamment réduit les possibilités pour poursuivre son exploration sans confusion.

## Statut du parcours

Ce document définit le parcours cible Accepted du MVP. Des tests d'utilisabilité sur prototype restent requis afin de valider sa compréhension et sa fluidité, sans remettre son statut Accepted en Draft.

## Points à tester

- densité réelle des marqueurs à Montréal ;
- compréhension des catégories ;
- nombre optimal de filtres visibles ;
- efficacité du regroupement des événements ;
- compréhension des statuts de confiance.
