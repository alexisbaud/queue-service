import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { Hono } from 'hono';
import { healthRoutes } from '../../../src/api/routes/health';
import { statusService, StatusTypes } from '../../../src/services/statusService';

/**
 * Fonction auxiliaire pour tester les routes Hono sans utiliser supertest
 * qui a des problèmes avec l'API fetch de Hono
 */
async function testRoute(app: Hono, path: string, method = 'GET', options = {}) {
  const req = new Request(`http://localhost${path}`, {
    method,
    ...options
  });
  
  const res = await app.fetch(req);
  return {
    status: res.status,
    headers: res.headers,
    body: await res.json()
  };
}

// Test des routes de santé
describe('Health Routes', () => {
  // Instance de l'application pour les tests
  let app: Hono;

  beforeEach(() => {
    // Créer une nouvelle instance à chaque test
    app = new Hono();
    app.route('/', healthRoutes);
    
    // Réinitialiser le statut
    statusService.updateStatus(StatusTypes.RABBITMQ, false);
  });

  afterEach(() => {
    // Nettoyage après chaque test
    jest.clearAllMocks();
  });

  describe('GET /', () => {
    it('devrait retourner le statut avec RabbitMQ déconnecté', async () => {
      // Statut RabbitMQ déconnecté
      statusService.updateStatus(StatusTypes.RABBITMQ, false);
      
      // Exécuter la requête via l'adaptateur
      const response = await testRoute(app, '/');
      
      // Vérifier la réponse
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'ok');
      expect(response.body).toHaveProperty('rabbitmq', 'disconnected');
    });

    it('devrait retourner le statut avec RabbitMQ connecté', async () => {
      // Simuler que RabbitMQ est connecté
      statusService.updateStatus(StatusTypes.RABBITMQ, true);
      
      // Exécuter la requête
      const response = await testRoute(app, '/');
      
      // Vérifier la réponse
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'ok');
      expect(response.body).toHaveProperty('rabbitmq', 'connected');
    });
  });

  // Tests supplémentaires à débloquer une fois les premiers fonctionnels
  describe('GET /ready', () => {
    it('devrait retourner 503 si RabbitMQ est déconnecté', async () => {
      // Forcer le statut déconnecté
      statusService.updateStatus(StatusTypes.RABBITMQ, false);
      
      // Exécuter la requête
      const response = await testRoute(app, '/ready');
      
      // Vérifier la réponse
      expect(response.status).toBe(503);
      expect(response.body).toHaveProperty('status', 'not_ready');
      expect(response.body).toHaveProperty('reason', 'rabbitmq_disconnected');
    });

    it('devrait retourner 200 si RabbitMQ est connecté', async () => {
      // Simuler que RabbitMQ est connecté
      statusService.updateStatus(StatusTypes.RABBITMQ, true);
      
      // Exécuter la requête
      const response = await testRoute(app, '/ready');
      
      // Vérifier la réponse
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'ready');
    });
  });

  describe('GET /live', () => {
    it('devrait toujours retourner un statut alive', async () => {
      // Exécuter la requête
      const response = await testRoute(app, '/live');
      
      // Vérifier la réponse
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'alive');
    });
  });
}); 