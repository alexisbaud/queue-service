# Queue Service

Service de gestion de files d'attente basé sur RabbitMQ, conçu pour améliorer la résilience et la scalabilité des systèmes distribués.

## 📋 Table des matières

- [Vue d'ensemble](#vue-densemble)
- [Architecture](#architecture)
- [Fonctionnalités](#fonctionnalités)
- [Technologies](#technologies)
- [Structure du projet](#structure-du-projet)
- [Démarrage rapide](#démarrage-rapide)
- [Configuration](#configuration)
- [API](#api)
- [Modèles d'utilisation](#modèles-dutilisation)
- [Surveillance et métriques](#surveillance-et-métriques)
- [Sécurité](#sécurité)
- [Déploiement](#déploiement)
- [Contribution](#contribution)
- [Licence](#licence)
- [Test du service](#test-du-service)

## Vue d'ensemble

Queue Service est un service intermédiaire qui implémente des files d'attente pour gérer les communications entre différents microservices. Il est conçu pour:

- **Améliorer la résilience** en découplant les services producteurs et consommateurs
- **Gérer les pics de charge** en absorbant des volumes importants de messages
- **Assurer la fiabilité** grâce à des mécanismes de persistance et de reprise sur erreur
- **Simplifier l'intégration** via une API RESTful intuitive

Cas d'utilisation initial: mise en file d'attente des envois d'emails de confirmation lors de la création de compte utilisateur.

## Architecture

![Architecture](docs/architecture.png)

Le service s'articule autour des composants suivants:

- **API Gateway**: Point d'entrée REST pour les producteurs de messages
- **Message Broker**: RabbitMQ pour le stockage et la distribution des messages
- **Workers**: Traitement des messages depuis les files d'attente

## Fonctionnalités

- **Modèles de distribution multiples**:
  - Work Queues: Distribution équilibrée des tâches entre plusieurs workers
  - Pub/Sub: Diffusion d'un même message à plusieurs consommateurs
- **Gestion avancée des erreurs**:
  - Stratégie de retry avec backoff exponentiel
  - Circuit breaker pour éviter de surcharger des services défaillants
  - Dead Letter Queues pour isoler les messages problématiques
- **Persistance**:
  - Stockage durable des messages en cas de redémarrage
  - Confirmations de publication et acknowledgements
- **Surveillance complète**:
  - Dashboard Grafana préconfiguré
  - Alertes sur métriques critiques
- **Sécurité**:
  - Authentification TLS
  - Gestion fine des permissions
  - Communication chiffrée

## Technologies

- **Node.js**: Environnement d'exécution
- **Hono**: Framework web léger et performant
- **RabbitMQ**: Broker de messages
- **Docker**: Conteneurisation
- **TypeScript**: Typage statique

## Structure du projet

```
queue-service/
├── src/
│   ├── api/            # Points d'entrée API REST
│   ├── config/         # Configuration et variables d'environnement
│   ├── consumers/      # Consommateurs de messages
│   ├── models/         # Modèles et schémas
│   ├── producers/      # Producteurs de messages
│   ├── services/       # Logique métier
│   └── utils/          # Utilitaires
├── docker/
│   └── rabbitmq/       # Configuration RabbitMQ
├── test/               # Tests unitaires et d'intégration
├── docs/               # Documentation
├── Dockerfile          # Image Docker de production
├── docker-compose.yml  # Configuration pour développement local
├── package.json        # Dépendances Node.js
└── tsconfig.json       # Configuration TypeScript
```

## Démarrage rapide

### Prérequis

- Docker et Docker Compose
- Node.js 18+

### Installation avec script automatisé

1. Exécutez le script de configuration
   ```bash
   ./scripts/setup.sh
   ```
   Ce script va:
   - Vérifier les prérequis (Node.js, Docker, Docker Compose)
   - Installer les dépendances
   - Créer un fichier .env à partir de .env.example si nécessaire
   - Démarrer les conteneurs Docker (RabbitMQ)
   - Construire le projet

2. Démarrer le service
   ```bash
   npm run dev
   ```

### Installation manuelle

1. Cloner le dépôt
   ```bash
   git clone https://github.com/votre-username/queue-service.git
   cd queue-service
   ```

2. Installer les dépendances
   ```bash
   npm install
   ```

3. Démarrer l'environnement local
   ```bash
   docker-compose up -d
   ```

4. Démarrer le service
   ```bash
   npm run dev
   ```

Le service est accessible à l'adresse `http://localhost:3000`.

## Configuration

La configuration se fait principalement via variables d'environnement:

| Variable | Description | Défaut |
|----------|-------------|--------|
| `PORT` | Port du service API | 3000 |
| `LOG_LEVEL` | Niveau de journalisation | info |
| `RABBITMQ_URL` | URL de connexion à RabbitMQ | amqp://guest:guest@localhost:5672 |
| `RABBITMQ_HEARTBEAT` | Intervalle de heartbeat | 60 |
| `MAX_RETRIES` | Nombre max. de tentatives | 5 |
| `INITIAL_RETRY_DELAY` | Délai initial entre tentatives (ms) | 1000 |
| `MAX_RETRY_DELAY` | Délai max entre tentatives (ms) | 60000 |

Pour le développement local, créez un fichier `.env` à la racine du projet.

## API

### Endpoints

#### Publier un message

```http
POST /api/v1/publish

{
  "exchange": "email",
  "routingKey": "confirmation",
  "message": {
    "to": "user@example.com",
    "subject": "Confirmation d'inscription",
    "body": "Bienvenue sur notre plateforme!"
  },
  "options": {
    "persistent": true,
    "priority": 1
  }
}
```

#### Créer une file d'attente

```http
POST /api/v1/queues

{
  "name": "email_confirmation",
  "options": {
    "durable": true,
    "deadLetterExchange": "dlx"
  }
}
```

#### Lier une file à un exchange

```http
POST /api/v1/bindings

{
  "queue": "email_confirmation",
  "exchange": "email",
  "routingKey": "confirmation"
}
```

#### Vérification de l'état du service

```http
GET /healthz
```

Réponse:

```json
{
  "status": "ok",
  "timestamp": "2023-08-15T14:32:10.123Z",
  "rabbitmq": "connected",
  "version": "1.0.0"
}
```

### Disponibilité du service

```http
GET /healthz/ready
```

Réponse:

```json
{
  "status": "ready"
}
```

## Modèles d'utilisation

### Work Queues

Idéal pour distribuer des tâches entre plusieurs workers:

```javascript
// Côté producteur
await queueService.publish({
  exchange: '',
  routingKey: 'task_queue',
  message: { taskId: 123, data: '...' }
});

// Côté consommateur
queueService.consume('task_queue', async (message) => {
  // Traitement du message
  return true; // Ack
});
```

### Pub/Sub

Pour diffuser des messages à plusieurs consommateurs:

```javascript
// Côté producteur
await queueService.publish({
  exchange: 'notifications',
  routingKey: '',
  message: { event: 'user.registered', userId: 456 }
});

// Côté consommateur 1
queueService.bindQueue('email_notifications', 'notifications', '');
queueService.consume('email_notifications', handleEmailNotification);

// Côté consommateur 2
queueService.bindQueue('push_notifications', 'notifications', '');
queueService.consume('push_notifications', handlePushNotification);
```

## Surveillance et métriques

Le service expose les métriques suivantes via Prometheus:

- `queue_message_published_total`: Nombre total de messages publiés
- `queue_message_publish_errors_total`: Nombre total d'erreurs de publication
- `queue_message_consumed_total`: Nombre total de messages consommés
- `queue_message_consume_errors_total`: Nombre total d'erreurs de consommation
- `queue_message_count`: Nombre de messages dans la file
- `queue_message_processing_seconds`: Temps de traitement des messages

Accès aux dashboards:
- RabbitMQ Management: http://localhost:15672 (guest/guest)

## Sécurité

- Communication TLS entre les composants
- Authentification par certificats clients
- Isolation par vHosts RabbitMQ
- Utilisateurs avec permissions limitées

## Déploiement

### Railway

1. Configurer les variables d'environnement dans Railway
2. Connecter le dépôt GitHub
3. Activer le déploiement automatique

### Docker

```bash
docker build -t queue-service .
docker run -p 3000:3000 --env-file .env queue-service
```

## Contribution

1. Fork le projet
2. Créer une branche (`git checkout -b feature/amazing-feature`)
3. Commit les changements (`git commit -m 'feat: add amazing feature'`)
4. Push vers la branche (`git push origin feature/amazing-feature`)
5. Ouvrir une Pull Request

## Licence

Distribué sous la licence MIT. Voir `LICENSE` pour plus d'informations.

## Test du service

Pour tester le service:

1. **Démarrer l'environnement**:
   ```bash
   docker-compose up -d
   ```

2. **Accéder aux interfaces**:
   - RabbitMQ Management: http://localhost:15672 (guest/guest)
   - API du service: http://localhost:3000

3. **Publier des messages de test**:
   ```bash
   # Utiliser le script de test
   ./test-publish.sh
   ```
   Ce script:
   - Crée une file d'attente de test
   - Lie la file à l'exchange par défaut
   - Publie 20 messages de test

4. **Consommer les messages** (optionnel):
   ```bash
   # Installer la dépendance si nécessaire
   npm install amqplib
   
   # Démarrer le consumer
   node test-consumer.js
   ``` 