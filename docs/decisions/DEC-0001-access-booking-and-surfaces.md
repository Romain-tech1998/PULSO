# DEC-0001 — Access, Booking and Product Surfaces

**Version :** 1.0  
**Status :** Accepted  
**Dépend de :** PDR-0001, MVP-0001

## Décisions figées

### Accès

Pulso est entièrement consultable sans compte dans le MVP.

La création d'un compte est facultative et sert initialement à enregistrer des favoris.

### Réservation

Pulso redirige vers les billetteries et sources externes.

Les liens affiliés sont utilisés lorsqu'ils sont disponibles.

Pulso ne réalise ni paiement ni réservation directe dans le MVP.

### Surfaces

Pulso doit exister sous la forme :

- d'un site web responsive ;
- d'une application mobile.

Les deux surfaces représentent le même produit. Elles partagent les données, les règles métier et autant de composants techniques que raisonnablement possible.

## Évolution prévue du compte

### MVP

- favoris.

### Roadmap

- réservations directes si leur faisabilité est confirmée ;
- stockage des places de concert ;
- stockage d'autres billets et titres.

### Vision

- identité numérique ;
- preuve de majorité 18+ ou 21+.

## Garde-fous

- Aucun compte ne doit être exigé pour consulter la carte, filtrer, rechercher ou ouvrir une fiche.
- La fermeture ou l'indisponibilité d'un programme d'affiliation ne doit pas empêcher la redirection standard.
- La réservation directe ne doit pas être anticipée dans l'architecture du MVP au prix d'une complexité inutile.
- Les fonctionnalités d'identité numérique devront faire l'objet d'une décision distincte avant toute conception ou collecte de données.
