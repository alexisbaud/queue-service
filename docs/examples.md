# Exemples d'utilisation

Ce document présente des exemples génériques d'utilisation de l'API Queue Service.

## Publication de messages

### Publier un message dans une file d'attente

```bash
curl -X POST http://localhost:3000/api/v1/publish \
  -H "Content-Type: application/json" \
  -d '{
    "exchange": "default",
    "routingKey": "task_queue",
    "message": {
      "task": "process_data",
      "payload": {
        "id": "123456",
        "data": { "key": "value" }
      }
    },
    "options": {
      "persistent": true
    }
  }'
```

Réponse:

```json
{
  "success": true,
  "message": "Message publié avec succès"
}
```

## Gestion des files d'attente

### Création d'une nouvelle file d'attente

```bash
curl -X POST http://localhost:3000/api/v1/queues \
  -H "Content-Type: application/json" \
  -d '{
    "name": "task_queue",
    "options": {
      "durable": true,
      "deadLetterExchange": "dlx"
    }
  }'
```

Réponse:

```json
{
  "success": true,
  "queue": "task_queue"
}
```

### Liaison d'une file à un exchange

```bash
curl -X POST http://localhost:3000/api/v1/bindings \
  -H "Content-Type: application/json" \
  -d '{
    "queue": "task_queue",
    "exchange": "default",
    "routingKey": "task_queue"
  }'
```

Réponse:

```json
{
  "success": true,
  "message": "Liaison créée avec succès"
}
```

## Vérification de l'état du service

### Status général

```bash
curl http://localhost:3000/health
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

```bash
curl http://localhost:3000/health/ready
```

Réponse:

```json
{
  "status": "ready"
}
```

## Utilisation avec Node.js

Voici un exemple d'utilisation du service depuis une application Node.js:

```javascript
// Exemple avec fetch
async function publishMessage(taskData) {
  try {
    const response = await fetch('http://localhost:3000/api/v1/publish', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        exchange: 'default',
        routingKey: 'task_queue',
        message: {
          task: 'process_data',
          payload: taskData
        },
        options: {
          persistent: true
        }
      })
    });
    
    const data = await response.json();
    console.log('Message mis en file d\'attente:', data);
    return data.success;
  } catch (error) {
    console.error('Erreur lors de la publication du message:', error);
    return false;
  }
}

// Utilisation
publishMessage({ id: '123456', data: { key: 'value' } });
```

## Surveillance des métriques

### Accès aux métriques Prometheus

```bash
curl http://localhost:3000/metrics
```

La réponse sera au format Prometheus avec toutes les métriques exposées par le service. 