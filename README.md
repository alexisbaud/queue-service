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
- [Optimisation des performances](#optimisation-des-performances)
- [Stratégies de déploiement](#stratégies-de-déploiement)
- [Exemples d'intégration](#exemples-dintégration)
- [Maintenance](#maintenance)
- [Dépannage](#dépannage)
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
| `TLS_ENABLED` | Activer TLS | false |
| `TLS_CA_PATH` | Chemin vers le certificat CA | - |
| `TLS_CERT_PATH` | Chemin vers le certificat client | - |
| `TLS_KEY_PATH` | Chemin vers la clé client | - |

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

### Routage par sujet (Topic)

Pour cibler des consommateurs selon un pattern précis:

```javascript
// Création d'un exchange de type topic
await queueService.createExchange('logs', 'topic', { durable: true });

// Publication avec routing key spécifique
await queueService.publish({
  exchange: 'logs',
  routingKey: 'system.error',
  message: { source: 'auth', message: 'Failed login attempt' }
});

// Consommateur abonné à tous les erreurs
queueService.bindQueue('error_logs', 'logs', '*.error');

// Consommateur abonné à tous les logs système
queueService.bindQueue('system_logs', 'logs', 'system.*');
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

### Authentification et autorisation

Le service supporte les méthodes d'authentification suivantes:
- Authentification basique (utilisateur/mot de passe)
- Authentification TLS par certificat client
- Tokens JWT pour l'API REST (à configurer)

### Chiffrement des communications

Pour sécuriser les communications:
1. Activez TLS en définissant `TLS_ENABLED=true` dans votre `.env`
2. Fournissez les certificats appropriés via les variables `TLS_CA_PATH`, `TLS_CERT_PATH` et `TLS_KEY_PATH`
3. Assurez-vous que RabbitMQ est configuré pour accepter les connexions TLS

### Isolation des environnements

Pour isoler les environnements dans RabbitMQ:
1. Créez des vHosts distincts pour chaque environnement
2. Utilisez des utilisateurs RabbitMQ dédiés avec des permissions limitées
3. Spécifiez le vHost dans l'URL de connexion: `amqp://user:password@host:5672/vhost`

## Optimisation des performances

### Configuration recommandée

Pour optimiser les performances:

1. **Dimensionnement des files d'attente**:
   - Utilisez `prefetch` pour limiter le nombre de messages traités simultanément
   - Définissez des limites de taille pour les files (`x-max-length`)

2. **Persistance sélective**:
   - Activez `persistent: true` uniquement pour les messages critiques
   - Utilisez `lazy queues` pour les files volumineuses

3. **Configuration du circuit breaker**:
   - Ajustez les seuils et délais dans `.env` selon votre charge

4. **Scaling horizontal**:
   - Déployez plusieurs instances du service API
   - Mettez en place un load balancer pour distribuer le trafic

## Stratégies de déploiement

### Railway

1. Assurez-vous que votre code est dans un dépôt Git
2. Connectez-vous à [Railway](https://railway.app/)
3. Créez un nouveau projet et sélectionnez "Deploy from GitHub repo"
4. Choisissez votre dépôt Git contenant le queue-service
5. Dans les paramètres du déploiement, sélectionnez:
   - **Deploy using**: Dockerfile
   - **Root Directory**: queue-service (si nécessaire)

6. Configurez les variables d'environnement suivantes:
   ```
   RABBITMQ_URL=amqp://user:password@your-rabbitmq-service:5672
   PORT=3000
   LOG_LEVEL=info
   NODE_ENV=production
   ```

7. Si vous avez besoin d'une instance RabbitMQ:
   - Ajoutez un nouveau service RabbitMQ sur Railway
   - Utilisez le service managé Railway ou déployez la configuration Docker incluse

Le service sera automatiquement déployé et les health checks configurés dans `railway.toml` permettront à Railway de vérifier son bon fonctionnement.

### Kubernetes

Pour déployer sur Kubernetes:

1. Utilisez les fichiers manifestes fournis dans `./kubernetes/`
2. Ajustez les ressources selon vos besoins:

```yaml
resources:
  requests:
    memory: "128Mi"
    cpu: "100m"
  limits:
    memory: "256Mi"
    cpu: "200m"
```

3. Déployez avec:
```bash
kubectl apply -f ./kubernetes/
```

### Docker

```bash
docker build -t queue-service .
docker run -p 3000:3000 --env-file .env queue-service
```

## Exemples d'intégration

### Intégration avec un service d'authentification

```javascript
// Service d'authentification
app.post('/register', async (req, res) => {
  try {
    // Création de l'utilisateur
    const user = await userService.create(req.body);
    
    // Envoyer un email de confirmation via le queue service
    await axios.post('http://queue-service:3000/api/v1/publish', {
      exchange: 'email',
      routingKey: 'confirmation',
      message: {
        to: user.email,
        subject: 'Confirmation d\'inscription',
        template: 'confirmation',
        variables: {
          userName: user.name,
          confirmationUrl: `https://example.com/confirm?token=${user.confirmationToken}`
        }
      }
    });
    
    res.status(201).json({ 
      userId: user.id, 
      message: 'User created, confirmation email will be sent shortly' 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

### Intégration avec un service de traitement d'images

```javascript
// Service d'upload d'images
app.post('/upload', upload.single('image'), async (req, res) => {
  try {
    // Enregistrer l'image originale
    const imagePath = req.file.path;
    const imageId = await imageStorage.save(imagePath);
    
    // Demander le traitement asynchrone de l'image
    await axios.post('http://queue-service:3000/api/v1/publish', {
      exchange: 'media',
      routingKey: 'image.process',
      message: {
        imageId,
        operations: ['resize', 'optimize', 'watermark'],
        sizes: ['thumbnail', 'medium', 'large'],
        userId: req.user.id
      },
      options: {
        persistent: true,
        priority: 2
      }
    });
    
    res.status(200).json({ 
      imageId,
      message: 'Image uploaded, processing started' 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

## Maintenance

### Surveillance des files d'attente

Pour identifier les problèmes potentiels:

1. Vérifiez régulièrement les métriques RabbitMQ:
   - Nombre de messages non acquittés
   - Longueur des files d'attente
   - Taux de rejet de messages

2. Configurez des alertes pour les seuils critiques:
   - File d'attente dépassant une certaine taille
   - Dead Letter Queue recevant des messages
   - Taux d'erreurs élevé

### Sauvegarde et restauration

1. Sauvegardez régulièrement la configuration RabbitMQ:
   ```bash
   rabbitmqctl export_definitions backup.json
   ```

2. Pour restaurer:
   ```bash
   rabbitmqctl import_definitions backup.json
   ```

## Dépannage

### Problèmes courants

| Problème | Cause possible | Solution |
|----------|----------------|----------|
| Messages non traités | Consumer arrêté ou déconnecté | Vérifier le statut des consommateurs |
| Files qui grossissent | Traitement trop lent | Augmenter le nombre de workers |
| Messages rejetés | Erreurs dans le handler | Vérifier les logs du consumer |
| Connexion perdue | Problème réseau ou redémarrage RabbitMQ | Vérifier la connectivité, le service se reconnectera automatiquement |

### Logs et diagnostics

Pour accéder aux logs détaillés:

```bash
# Logs du service
docker logs queue-service-api

# Logs RabbitMQ
docker logs queue-service-rabbitmq
```

Pour diagnostiquer RabbitMQ:

```bash
# Status général
docker exec queue-service-rabbitmq rabbitmqctl status

# Liste des queues et leur état
docker exec queue-service-rabbitmq rabbitmqctl list_queues name messages consumers
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

3. **Exécuter les tests automatisés**:
   ```bash
   # Exécuter tous les tests unitaires
   npm test
   
   # Exécuter les tests avec couverture
   npm run test:coverage
   
   # Exécuter un test spécifique
   npm test -- test/services/statusService.test.ts
   
   # Exécuter les tests en mode watch (développement)
   npm run test:watch
   ```

   Note: Certains tests peuvent nécessiter un environnement RabbitMQ en cours d'exécution.
   Les tests d'intégration sont désactivés par défaut (avec `.skip`) et peuvent être activés si nécessaire.

4. **Publier des messages de test**:
   ```bash
   # Utiliser le script de test
   ./test-publish.sh
   ```
   Ce script:
   - Crée une file d'attente de test
   - Lie la file à l'exchange par défaut
   - Publie 20 messages de test

5. **Consommer les messages** (optionnel):
   ```bash
   # Installer la dépendance si nécessaire
   npm install amqplib
   
   # Démarrer le consumer
   node test-consumer.js
   ``` 