import dotenv from 'dotenv';
import { join } from 'path';

// Chargement des variables d'environnement depuis .env
dotenv.config({ path: join(__dirname, '../../.env') });

export const env = {
  // Configuration du service API
  port: parseInt(process.env.PORT || '3000', 10),
  logLevel: process.env.LOG_LEVEL || 'info',

  // Configuration RabbitMQ
  rabbitmq: {
    url: process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672',
    heartbeat: parseInt(process.env.RABBITMQ_HEARTBEAT || '60', 10),
  },

  // Configuration des retries
  retries: {
    max: parseInt(process.env.MAX_RETRIES || '5', 10),
    initialDelay: parseInt(process.env.INITIAL_RETRY_DELAY || '1000', 10),
    maxDelay: parseInt(process.env.MAX_RETRY_DELAY || '60000', 10),
  },

  // Configuration de sécurité
  security: {
    tlsEnabled: process.env.TLS_ENABLED === 'true',
    tlsCaPath: process.env.TLS_CA_PATH,
    tlsCertPath: process.env.TLS_CERT_PATH,
    tlsKeyPath: process.env.TLS_KEY_PATH,
  }
}; 