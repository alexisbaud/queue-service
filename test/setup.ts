/**
 * Configuration globale pour les tests Jest
 */
import dotenv from 'dotenv';
import path from 'path';

// Chargement des variables d'environnement pour les tests
dotenv.config({
  path: path.resolve(__dirname, '../.env.test')
});

// Configurer process.env pour les tests
process.env.NODE_ENV = 'test';
process.env.RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://localhost:5672';
process.env.SERVICE_PORT = process.env.SERVICE_PORT || '3000';

// Mock pour les modules qui ne sont pas nécessaires dans les tests
jest.mock('../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  }
}));

// Augmenter le timeout pour les tests
jest.setTimeout(5000); 