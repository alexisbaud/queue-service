import { serve } from '@hono/node-server';
import { api } from './api/routes';
import { env } from './config/env';
import { logger } from './utils/logger';
import { RabbitMQService } from './services/rabbitmq';
import { setupMetrics } from './services/metrics';

// Instance du service RabbitMQ
const rabbitMQService = new RabbitMQService();

// Initialisation des métriques
setupMetrics();

// Connexion à RabbitMQ
async function connectRabbitMQ() {
  try {
    await rabbitMQService.connect();
    
    // Configuration par défaut des exchanges
    await rabbitMQService.createExchange('default', 'direct', { durable: true });
    await rabbitMQService.createExchange('email', 'direct', { durable: true });
    await rabbitMQService.createExchange('notifications', 'fanout', { durable: true });
    await rabbitMQService.createExchange('dlx', 'direct', { durable: true });
    
    // Queues par défaut
    await rabbitMQService.createQueue('email_queue', {
      durable: true,
      deadLetterExchange: 'dlx'
    });
    await rabbitMQService.createQueue('dlq', { durable: true });
    
    // Bindings
    await rabbitMQService.bindQueue('email_queue', 'email', 'confirmation');
    await rabbitMQService.bindQueue('dlq', 'dlx', '#');
    
    logger.info('Configuration RabbitMQ terminée');
  } catch (err) {
    logger.error({ err }, 'Impossible de configurer RabbitMQ');
    process.exit(1);
  }
}

// Démarrage du serveur
async function startServer() {
  try {
    // Connexion à RabbitMQ
    await connectRabbitMQ();
    
    // Démarrage du serveur HTTP
    serve({
      fetch: api.fetch,
      port: env.port
    });
    
    logger.info(`Serveur démarré sur le port ${env.port}`);
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