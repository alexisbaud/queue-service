# Architecture du Queue Service

## Vue d'ensemble

Le Queue Service est construit autour d'une architecture orientée messages utilisant RabbitMQ comme broker central. Cette approche permet un découplage fort entre les producteurs et les consommateurs de messages, améliorant ainsi la résilience et la scalabilité du système.

```
┌────────────────┐     ┌─────────────────┐     ┌────────────────┐
│                │     │                 │     │                │
│  Producteurs   ├────►│  Queue Service  ├────►│ Consommateurs  │
│  (API Clients) │     │  (RabbitMQ)     │     │ (Workers)      │
│                │     │                 │     │                │
└────────────────┘     └─────────────────┘     └────────────────┘
```

## Composants principaux

### 1. API Gateway

Point d'entrée REST permettant aux services de publier des messages dans les files d'attente.

- **Endpoints principaux**:
  - `/api/v1/publish` : Publication de messages
  - `/api/v1/queues` : Gestion des files d'attente
  - `/api/v1/bindings` : Gestion des liaisons entre exchanges et queues
  - `/healthz` : Vérification de l'état du service

### 2. Message Broker (RabbitMQ)

Cœur du système de messagerie, responsable du stockage et de l'acheminement des messages.

- **Exchanges** :
  - `default` (direct) : Exchange par défaut
  - `email` (direct) : Messages liés aux emails
  - `notifications` (fanout) : Diffusion de notifications
  - `dlx` (direct) : Dead Letter Exchange pour les messages en échec

- **Queues** :
  - `email_queue` : File pour les emails de confirmation
  - `dlq` : Dead Letter Queue pour les messages non traités

### 3. Consommateurs (Workers)

Services qui traitent les messages des files d'attente.

- **Types** :
  - `EmailConsumer` : Traitement des emails de confirmation

## Flux de données

1. Un service client envoie une requête HTTP à l'API Gateway pour publier un message
2. L'API valide la requête et publie le message dans RabbitMQ
3. RabbitMQ achemine le message vers la file appropriée selon son exchange et sa routing key
4. Les consommateurs traitent le message depuis la file
5. En cas de succès, le message est acquitté (ACK)
6. En cas d'échec, le message est redirigé vers la Dead Letter Queue pour analyse

## Gestion des erreurs

- **Stratégie de retry** : Backoff exponentiel pour les tentatives de reconnexion
- **Circuit breaker** : Mécanisme pour éviter de surcharger les services défaillants
- **Dead Letter Queue** : Stockage des messages en échec pour analyse ultérieure

## Sécurité

- Support TLS/SSL pour les connexions sécurisées
- Authentification par certificats clients
- Variables d'environnement pour les informations sensibles

## Extensibilité

L'architecture est conçue pour être facilement extensible:

- Ajout de nouveaux exchanges et queues via configuration
- Implémentation de nouveaux consommateurs pour différents types de messages
- Support pour différents modèles de messagerie (work queues, pub/sub, routage, etc.) 