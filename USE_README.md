# Guide d'utilisation du Queue Service

Ce guide vous aidera à intégrer et utiliser le Queue Service dans vos applications.

## Table des matières

- [Introduction](#introduction)
- [Installation et configuration](#installation-et-configuration)
- [API REST](#api-rest)
- [Modèles d'utilisation](#modèles-dutilisation)
- [Exemples pratiques](#exemples-pratiques)
- [Monitoring et maintenance](#monitoring-et-maintenance)
- [Troubleshooting](#troubleshooting)
- [Bonnes pratiques](#bonnes-pratiques)

## Introduction

Queue Service est un service intermédiaire de gestion de files d'attente basé sur RabbitMQ. Il offre une API REST simple pour permettre à vos applications de communiquer de manière asynchrone et fiable.

### Pourquoi utiliser Queue Service?

- **Découplage**: Séparez vos applications productrices et consommatrices
- **Résilience**: Assurez la livraison des messages même en cas de panne temporaire
- **Équilibrage de charge**: Distribuez le travail entre plusieurs instances de traitement
- **Pic de trafic**: Absorbez les pics de charge sans surcharger vos systèmes

## Installation et configuration

### Installation rapide avec Docker

```bash
git clone https://github.com/votre-username/queue-service.git
cd queue-service
cp .env.example .env
# Modifier .env avec vos paramètres
docker-compose up -d
```

### Configuration minimale requise

Créez un fichier `.env` avec les paramètres suivants:

```
PORT=3000
LOG_LEVEL=info
RABBITMQ_URL=amqp://guest:guest@localhost:5672
```

### Configuration avancée

```
# Configuration du service API
PORT=3000
LOG_LEVEL=info

# Configuration RabbitMQ
RABBITMQ_URL=amqp://your_app_user:your_app_password@rabbitmq:5672
RABBITMQ_HEARTBEAT=60

# Configuration des retries
MAX_RETRIES=5
INITIAL_RETRY_DELAY=1000
MAX_RETRY_DELAY=60000

# Configuration de sécurité
TLS_ENABLED=true
TLS_CA_PATH=./certs/ca.pem
TLS_CERT_PATH=./certs/client_certificate.pem
TLS_KEY_PATH=./certs/client_key.pem
```

## API REST

Le service expose une API REST pour interagir avec RabbitMQ.

### Endpoints principaux

#### Vérification de la santé du service

```
GET /healthz
```

Utilisez cet endpoint pour vérifier si le service fonctionne correctement.

Réponse:
```json
{
  "status": "ok",
  "timestamp": "2023-08-15T14:32:10.123Z",
  "rabbitmq": "connected",
  "version": "1.0.0"
}
```

#### Publication de messages

```
POST /api/v1/publish
```

Publiez un message dans une file d'attente.

Requête:
```json
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
    "priority": 1,
    "expiration": "60000",
    "headers": {
      "source": "user-service",
      "messageType": "email.confirmation"
    }
  }
}
```

Réponse:
```json
{
  "success": true,
  "message": "Message publié avec succès"
}
```

#### Création de files d'attente

```
POST /api/v1/queues
```

Créez une nouvelle file d'attente.

Requête:
```json
{
  "name": "email_confirmation",
  "options": {
    "durable": true,
    "exclusive": false,
    "autoDelete": false,
    "deadLetterExchange": "dlx",
    "arguments": {
      "x-max-length": 10000,
      "x-max-priority": 10
    }
  }
}
```

Réponse:
```json
{
  "success": true,
  "queue": "email_confirmation"
}
```

#### Liaison de files aux exchanges

```
POST /api/v1/bindings
```

Liez une file d'attente à un exchange avec une clé de routage.

Requête:
```json
{
  "queue": "email_confirmation",
  "exchange": "email",
  "routingKey": "confirmation"
}
```

Réponse:
```json
{
  "success": true,
  "message": "Liaison créée avec succès"
}
```

### Codes d'erreur HTTP

| Code | Description |
|------|-------------|
| 200 | Succès |
| 400 | Requête invalide (validation échouée) |
| 500 | Erreur serveur interne |
| 503 | Service indisponible (RabbitMQ déconnecté) |

## Modèles d'utilisation

Le service supporte plusieurs modèles de messagerie selon vos besoins.

### File de tâches (Work Queue)

Idéal pour distribuer des tâches entre plusieurs workers.

1. **Configuration initiale**:
   ```bash
   # Créer une file de tâches
   curl -X POST http://localhost:3000/api/v1/queues \
     -H "Content-Type: application/json" \
     -d '{"name": "task_queue", "options": {"durable": true}}'
   ```

2. **Publication de tâches**:
   ```bash
   # Publier une tâche
   curl -X POST http://localhost:3000/api/v1/publish \
     -H "Content-Type: application/json" \
     -d '{
       "exchange": "",
       "routingKey": "task_queue",
       "message": {"taskId": 123, "action": "process_file", "fileUrl": "https://example.com/file.pdf"},
       "options": {"persistent": true}
     }'
   ```

3. **Traitement côté worker** (code Node.js avec amqplib):
   ```javascript
   const amqplib = require('amqplib');

   async function startWorker() {
     const connection = await amqplib.connect('amqp://localhost:5672');
     const channel = await connection.createChannel();
     const queue = 'task_queue';
     
     await channel.assertQueue(queue, { durable: true });
     // Ne traiter qu'un message à la fois par worker
     await channel.prefetch(1);
     
     console.log(`Worker en attente de tâches...`);
     
     channel.consume(queue, async (msg) => {
       if (!msg) return;
       
       const task = JSON.parse(msg.content.toString());
       console.log(`Traitement de la tâche: ${task.taskId}`);
       
       try {
         // Logique de traitement de la tâche
         await processTask(task);
         
         // Acquittement du message
         channel.ack(msg);
         console.log(`Tâche ${task.taskId} traitée avec succès`);
       } catch (err) {
         console.error(`Erreur de traitement: ${err.message}`);
         // En cas d'échec, rejeter le message
         // requeue: false signifie ne pas remettre dans la file
         channel.nack(msg, false, false);
       }
     });
   }
   
   startWorker().catch(console.error);
   ```

### Publication/Souscription (Pub/Sub)

Pour diffuser des messages à plusieurs consommateurs.

1. **Configuration initiale**:
   ```bash
   # Créer un exchange de type fanout
   curl -X POST http://localhost:3000/api/v1/exchanges \
     -H "Content-Type: application/json" \
     -d '{"name": "notifications", "type": "fanout", "options": {"durable": true}}'
   
   # Créer deux files d'attente
   curl -X POST http://localhost:3000/api/v1/queues \
     -H "Content-Type: application/json" \
     -d '{"name": "email_notifications", "options": {"durable": true}}'
   
   curl -X POST http://localhost:3000/api/v1/queues \
     -H "Content-Type: application/json" \
     -d '{"name": "push_notifications", "options": {"durable": true}}'
   
   # Lier les files à l'exchange
   curl -X POST http://localhost:3000/api/v1/bindings \
     -H "Content-Type: application/json" \
     -d '{"queue": "email_notifications", "exchange": "notifications", "routingKey": ""}'
   
   curl -X POST http://localhost:3000/api/v1/bindings \
     -H "Content-Type: application/json" \
     -d '{"queue": "push_notifications", "exchange": "notifications", "routingKey": ""}'
   ```

2. **Publication d'événements**:
   ```bash
   curl -X POST http://localhost:3000/api/v1/publish \
     -H "Content-Type: application/json" \
     -d '{
       "exchange": "notifications",
       "routingKey": "",
       "message": {"event": "user.created", "userId": 456, "timestamp": "2023-08-15T14:32:10.123Z"}
     }'
   ```

### Routage par sujet (Topic)

Pour filtrer les messages par pattern.

1. **Configuration initiale**:
   ```bash
   # Créer un exchange de type topic
   curl -X POST http://localhost:3000/api/v1/exchanges \
     -H "Content-Type: application/json" \
     -d '{"name": "logs", "type": "topic", "options": {"durable": true}}'
   
   # Créer des files d'attente spécifiques
   curl -X POST http://localhost:3000/api/v1/queues \
     -H "Content-Type: application/json" \
     -d '{"name": "error_logs", "options": {"durable": true}}'
   
   curl -X POST http://localhost:3000/api/v1/queues \
     -H "Content-Type: application/json" \
     -d '{"name": "critical_logs", "options": {"durable": true}}'
   
   # Lier les files avec différents patterns
   curl -X POST http://localhost:3000/api/v1/bindings \
     -H "Content-Type: application/json" \
     -d '{"queue": "error_logs", "exchange": "logs", "routingKey": "*.error"}'
   
   curl -X POST http://localhost:3000/api/v1/bindings \
     -H "Content-Type: application/json" \
     -d '{"queue": "critical_logs", "exchange": "logs", "routingKey": "*.*.critical"}'
   ```

2. **Publication de messages avec routage**:
   ```bash
   # Message d'erreur standard
   curl -X POST http://localhost:3000/api/v1/publish \
     -H "Content-Type: application/json" \
     -d '{
       "exchange": "logs",
       "routingKey": "auth.error",
       "message": {"source": "auth-service", "message": "Invalid credentials", "level": "error"}
     }'
   
   # Message critique
   curl -X POST http://localhost:3000/api/v1/publish \
     -H "Content-Type: application/json" \
     -d '{
       "exchange": "logs",
       "routingKey": "payment.error.critical",
       "message": {"source": "payment-service", "message": "Payment gateway unreachable", "level": "critical"}
     }'
   ```

## Exemples pratiques

### Gestion d'emails transactionnels

```javascript
// Service d'utilisateurs (Node.js/Express)
const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json());

app.post('/register', async (req, res) => {
  try {
    // Logique de création d'utilisateur...
    const user = {
      id: 12345,
      email: req.body.email,
      name: req.body.name,
      verificationToken: 'abc123xyz'
    };
    
    // Envoyer email via queue service
    await axios.post('http://localhost:3000/api/v1/publish', {
      exchange: 'email',
      routingKey: 'verification',
      message: {
        template: 'email-verification',
        recipient: {
          email: user.email,
          name: user.name
        },
        data: {
          verificationUrl: `https://example.com/verify?token=${user.verificationToken}`
        }
      },
      options: {
        persistent: true
      }
    });
    
    res.status(201).json({
      success: true,
      message: 'Utilisateur créé, vérifiez votre email'
    });
  } catch (error) {
    console.error('Erreur:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la création du compte'
    });
  }
});

app.listen(4000, () => console.log('Service utilisateur démarré sur le port 4000'));
```

### Traitement de données en arrière-plan

```javascript
// API d'upload (Node.js/Express)
const express = require('express');
const multer = require('multer');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const app = express();
const upload = multer({ dest: 'uploads/' });

app.post('/upload', upload.single('file'), async (req, res) => {
  try {
    const file = req.file;
    const fileId = Date.now().toString();
    const storageFilePath = path.join('permanent_storage', fileId + path.extname(file.originalname));
    
    // Déplacer le fichier vers le stockage permanent
    fs.copyFileSync(file.path, storageFilePath);
    fs.unlinkSync(file.path); // Supprimer le fichier temporaire
    
    // Envoyer la tâche de traitement à la file d'attente
    await axios.post('http://localhost:3000/api/v1/publish', {
      exchange: '',
      routingKey: 'file_processing',
      message: {
        fileId,
        filePath: storageFilePath,
        originalName: file.originalname,
        mimeType: file.mimetype,
        userId: req.body.userId || 'anonymous',
        processingOptions: {
          resize: true,
          optimize: true,
          generateThumbnails: true
        }
      }
    });
    
    res.json({
      success: true,
      fileId,
      message: 'Fichier reçu, traitement en cours'
    });
  } catch (error) {
    console.error('Erreur:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors du traitement du fichier'
    });
  }
});

app.listen(5000, () => console.log('Service upload démarré sur le port 5000'));
```

### Worker de traitement d'images

```javascript
// Worker de traitement d'images (Node.js)
const amqplib = require('amqplib');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

async function processImage(filePath, options) {
  const fileDir = path.dirname(filePath);
  const fileName = path.basename(filePath, path.extname(filePath));
  const outputDir = path.join(fileDir, fileName);
  
  // Créer le répertoire de sortie
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  // Traitement de base
  const image = sharp(filePath);
  
  // Optimisation
  if (options.optimize) {
    await image.toFile(path.join(outputDir, 'optimized.jpg'), {
      quality: 80,
      chromaSubsampling: '4:4:4'
    });
  }
  
  // Génération de miniatures
  if (options.generateThumbnails) {
    const sizes = [200, 400, 800];
    for (const size of sizes) {
      await image
        .clone()
        .resize(size)
        .toFile(path.join(outputDir, `thumbnail_${size}.jpg`));
    }
  }
  
  return outputDir;
}

async function startWorker() {
  const connection = await amqplib.connect('amqp://localhost:5672');
  const channel = await connection.createChannel();
  const queue = 'file_processing';
  
  await channel.assertQueue(queue, { durable: true });
  await channel.prefetch(1);
  
  console.log('Worker de traitement d\'images démarré');
  
  channel.consume(queue, async (msg) => {
    if (!msg) return;
    
    try {
      const job = JSON.parse(msg.content.toString());
      console.log(`Traitement du fichier: ${job.fileId}`);
      
      if (job.mimeType.startsWith('image/')) {
        const outputDir = await processImage(job.filePath, job.processingOptions);
        console.log(`Traitement terminé, résultats dans: ${outputDir}`);
        
        // Notifier le service principal que le traitement est terminé
        await channel.assertQueue('processing_results', { durable: true });
        await channel.sendToQueue('processing_results', Buffer.from(JSON.stringify({
          fileId: job.fileId,
          userId: job.userId,
          status: 'completed',
          outputDir,
          processedAt: new Date().toISOString()
        })), { persistent: true });
        
        channel.ack(msg);
      } else {
        console.warn(`Type de fichier non supporté: ${job.mimeType}`);
        channel.nack(msg, false, false);
      }
    } catch (error) {
      console.error('Erreur de traitement:', error);
      channel.nack(msg, false, false);
    }
  });
}

startWorker().catch(console.error);
```

## Monitoring et maintenance

### Interface RabbitMQ Management

L'interface de gestion est accessible à l'adresse: http://localhost:15672

- **Utilisateur**: guest
- **Mot de passe**: guest

Cette interface vous permet de:
- Visualiser les files d'attente et leur état
- Surveiller les messages en attente
- Publier et consommer des messages manuellement
- Gérer les exchanges et bindings

### Métriques à surveiller

1. **Queue length**: Nombre de messages dans la file d'attente
   - Seuil d'alerte recommandé: >1000 messages

2. **Consumers**: Nombre de consommateurs connectés
   - Seuil d'alerte recommandé: 0 (aucun consommateur)

3. **Message rate**: Taux de messages entrants/sortants
   - Surveillez les écarts importants entre les taux d'entrée et de sortie

4. **Circuit breaker**: État du circuit breaker dans le service
   - Alertez si le circuit est ouvert pendant plus de 5 minutes

### Maintenance régulière

1. **Vérification des Dead Letter Queues**:
   ```bash
   # Vérifier le nombre de messages dans la DLQ
   curl -u guest:guest http://localhost:15672/api/queues/%2F/dlq
   ```

2. **Nettoyage des messages expirés**:
   - Les messages avec l'option `expiration` seront automatiquement supprimés
   - Vérifiez régulièrement les files qui grossissent anormalement

3. **Sauvegarde de la configuration**:
   ```bash
   rabbitmqctl export_definitions /path/to/backup/rabbitmq-definitions.json
   ```

## Troubleshooting

### Problèmes courants et solutions

#### Le service retourne 503

**Cause**: RabbitMQ n'est pas accessible.

**Solution**:
1. Vérifiez que RabbitMQ est en cours d'exécution
   ```bash
   docker ps | grep rabbitmq
   ```
2. Vérifiez les logs RabbitMQ
   ```bash
   docker logs queue-service-rabbitmq
   ```
3. Assurez-vous que l'URL dans `RABBITMQ_URL` est correcte

#### Les messages sont publiés mais jamais traités

**Cause**: Pas de consommateur ou problème de binding.

**Solution**:
1. Vérifiez que les consommateurs sont connectés
   ```bash
   curl -u guest:guest http://localhost:15672/api/consumers
   ```
2. Vérifiez que les bindings sont correctement configurés
   ```bash
   curl -u guest:guest http://localhost:15672/api/bindings
   ```
3. Assurez-vous que la routing key correspond exactement

#### Messages dans la Dead Letter Queue

**Cause**: Échec de traitement après plusieurs tentatives.

**Solution**:
1. Examinez les messages dans la DLQ
   ```bash
   # Utilisez l'interface RabbitMQ Management pour voir le contenu
   ```
2. Vérifiez les logs des consommateurs pour identifier la cause des échecs
3. Corrigez le problème puis republier les messages depuis la DLQ

#### Circuit breaker ouvert

**Cause**: Trop d'échecs de connexion à RabbitMQ.

**Solution**:
1. Vérifiez l'état de RabbitMQ
2. Redémarrez le service une fois RabbitMQ stable
   ```bash
   docker restart queue-service-api
   ```

### Logs à consulter

- **Logs du service**:
  ```bash
  docker logs queue-service-api
  ```

- **Logs RabbitMQ**:
  ```bash
  docker logs queue-service-rabbitmq
  ```

## Bonnes pratiques

### Structuration des messages

1. **Incluez des métadonnées utiles**:
   ```json
   {
     "id": "msg-123456",
     "timestamp": "2023-08-15T14:32:10.123Z",
     "source": "user-service",
     "type": "user.created",
     "data": {
       "userId": 123,
       "email": "user@example.com"
     },
     "version": "1.0"
   }
   ```

2. **Utilisez les headers pour les informations de routage**:
   ```json
   "options": {
     "headers": {
       "x-retry-count": 0,
       "x-correlation-id": "req-abcdef",
       "x-message-type": "user.created"
     }
   }
   ```

### Gestion des erreurs

1. **Implement le pattern Circuit Breaker** dans vos clients:
   ```javascript
   const maxRetries = 3;
   const initialDelay = 1000; // 1 seconde

   async function publishWithRetry(message, attempt = 0) {
     try {
       return await axios.post('http://localhost:3000/api/v1/publish', message);
     } catch (error) {
       if (attempt < maxRetries) {
         const delay = initialDelay * Math.pow(2, attempt);
         console.log(`Tentative ${attempt + 1}/${maxRetries} échouée, nouvelle tentative dans ${delay}ms`);
         await new Promise(resolve => setTimeout(resolve, delay));
         return publishWithRetry(message, attempt + 1);
       }
       throw error;
     }
   }
   ```

2. **Implémentez des backoff exponentiels** pour les retries dans vos consumers:
   ```javascript
   function calculateBackoff(attempt) {
     const baseDelay = 1000; // 1 seconde
     const maxDelay = 60000; // 1 minute
     const delay = baseDelay * Math.pow(2, attempt);
     return Math.min(delay, maxDelay);
   }
   ```

### Optimisation des performances

1. **Utilisez la persistance sélectivement**:
   - Activez `persistent: true` uniquement pour les messages importants
   - Les messages non-persistants sont plus rapides

2. **Ajustez la prefetch count**:
   - Valeur faible (1-10) pour les tâches longues
   - Valeur élevée (100+) pour les tâches rapides

3. **Regroupez les messages** quand c'est possible:
   - Envoyez des lots (batches) plutôt que des messages individuels
   - Utilisez des headers pour indiquer le nombre d'éléments dans un lot

4. **Évitez les files d'attente trop longues**:
   - Utilisez `x-max-length` pour limiter la taille des files
   - Configurez `x-overflow` sur `reject-publish` pour éviter de saturer la mémoire

### Sécurité

1. **Utilisez des connexions TLS** en production:
   ```
   TLS_ENABLED=true
   TLS_CA_PATH=./certs/ca.pem
   TLS_CERT_PATH=./certs/client_certificate.pem
   TLS_KEY_PATH=./certs/client_key.pem
   ```

2. **Utilisez des vHosts séparés** pour isoler les environnements:
   ```
   RABBITMQ_URL=amqp://user:password@host:5672/production
   ```

3. **Limitez les permissions** des utilisateurs RabbitMQ:
   - Créez des utilisateurs dédiés avec des droits minimaux
   - Utilisez des utilisateurs distincts pour les producteurs et consommateurs 