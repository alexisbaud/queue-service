import { serve } from '@hono/node-server';
import { api } from './api/routes';
import { env } from './config/env';
import { logger } from './utils/logger';
import { RabbitMQService } from './services/rabbitmq';
import { statusService, StatusTypes } from './services/statusService';

// Instance du service RabbitMQ
const rabbitMQService = new RabbitMQService();

// Connexion à RabbitMQ
async function connectRabbitMQ() {
  try {
    await rabbitMQService.connect();
    // Le statut RabbitMQ est déjà mis à jour dans le service RabbitMQ
    
    // Configuration par défaut des exchanges génériques
    await rabbitMQService.createExchange('default', 'direct', { durable: true });
    await rabbitMQService.createExchange('dlx', 'direct', { durable: true });
    
    // Queue pour les dead letters
    await rabbitMQService.createQueue('dlq', { durable: true });
    
    // Binding pour les dead letters
    await rabbitMQService.bindQueue('dlq', 'dlx', '#');
    
    logger.info('Configuration RabbitMQ terminée');
    return true;
  } catch (err) {
    // Le statut est déjà mis à jour dans le service RabbitMQ en cas d'erreur
    logger.error({ err }, 'Impossible de configurer RabbitMQ');
    if (process.env.NODE_ENV === 'production') {
      // En production, on ne quitte pas le processus immédiatement
      // pour permettre aux health checks de fonctionner
      logger.warn('Mode production: service démarré sans RabbitMQ, tentatives de reconnexion en cours');
      return false;
    } else {
      process.exit(1);
    }
  }
}

// Démarrage du serveur
async function startServer() {
  try {
    // Démarrage du serveur HTTP
    serve({
      fetch: api.fetch,
      port: env.port
    });
    
    logger.info(`Serveur démarré sur le port ${env.port}`);
    
    // Connexion à RabbitMQ (sans bloquer le démarrage du serveur)
    connectRabbitMQ();
  } catch (err) {
    logger.error({ err }, 'Erreur au démarrage du serveur');
    process.exit(1);
  }
}

// Gestion de l'arrêt propre
process.on('SIGINT', async () => {
  logger.info('Signal d\'arrêt reçu, fermeture des connexions...');
  await rabbitMQService.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('Signal d\'arrêt reçu, fermeture des connexions...');
  await rabbitMQService.close();
  process.exit(0);
});

// Démarrage de l'application
startServer(); 