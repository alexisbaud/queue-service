import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { Hono } from 'hono';

// Mock du service RabbitMQ en premier
// @ts-expect-error - Les types sont ignorés pour les tests
const mockPublish = jest.fn().mockResolvedValue(true);
// @ts-expect-error - Les types sont ignorés pour les tests
const mockCreateQueue = jest.fn().mockResolvedValue('test-queue');
// @ts-expect-error - Les types sont ignorés pour les tests
const mockBindQueue = jest.fn().mockResolvedValue(undefined);

// Mock le module complet avant son import
jest.mock('../../../src/services/rabbitmq', () => {
  return {
    RabbitMQService: jest.fn().mockImplementation(() => {
      return {
        publish: mockPublish,
        createQueue: mockCreateQueue,
        bindQueue: mockBindQueue
      };
    })
  };
});

// Import APRÈS le mock
import { queueRoutes } from '../../../src/api/routes/queue';
import { RabbitMQService } from '../../../src/services/rabbitmq';

/**
 * Fonction auxiliaire pour tester les routes Hono sans utiliser supertest
 * qui a des problèmes avec l'API fetch de Hono
 */
async function testRoute(app: Hono, path: string, method = 'GET', options: any = {}) {
  const { body, headers, ...rest } = options;
  
  // Construire la requête avec le bon corps et en-têtes
  const req = new Request(`http://localhost${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers
    },
    body: body ? JSON.stringify(body) : undefined,
    ...rest
  });
  
  // Exécuter la requête avec l'API fetch de Hono
  const res = await app.fetch(req);
  
  // Analyser la réponse
  return {
    status: res.status,
    headers: res.headers,
    body: res.status !== 204 ? await res.json() : undefined
  };
}

describe('Queue Routes', () => {
  // Application Hono pour les tests
  let app: Hono;
  
  beforeEach(() => {
    // Réinitialiser les mocks
    jest.clearAllMocks();
    
    // Recréer l'application pour chaque test
    app = new Hono();
    app.route('/', queueRoutes);
  });

  afterEach(() => {
    // Nettoyage après chaque test
    jest.clearAllMocks();
  });

  describe('POST /publish', () => {
    const validPublishPayload = {
      exchange: 'test-exchange',
      routingKey: 'test-key',
      message: { test: 'data' },
      options: { persistent: true }
    };

    it('devrait publier un message avec succès', async () => {
      // Envoyer la requête avec notre fonction testRoute
      const response = await testRoute(app, '/publish', 'POST', {
        body: validPublishPayload
      });
      
      // Vérifier la réponse
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('message', 'Message publié avec succès');
      
      // Vérifier que la méthode du service a été appelée correctement
      expect(mockPublish).toHaveBeenCalledWith(validPublishPayload);
    });

    it('devrait gérer les erreurs de validation', async () => {
      // Payload invalide (manque routingKey)
      const invalidPayload = {
        exchange: 'test-exchange',
        message: { test: 'data' }
      };
      
      // Envoyer la requête
      const response = await testRoute(app, '/publish', 'POST', {
        body: invalidPayload
      });
      
      // Vérifier la réponse
      expect(response.status).toBe(400);
      expect(mockPublish).not.toHaveBeenCalled();
    });

    it('devrait gérer les erreurs de publication', async () => {
      // Pour ce test, on remplace la mock par une version qui rejette
      // @ts-expect-error - Les types sont ignorés pour les tests
      mockPublish.mockRejectedValueOnce(new Error('Erreur de test'));
      
      // Envoyer la requête
      const response = await testRoute(app, '/publish', 'POST', {
        body: validPublishPayload
      });
      
      // Vérifier la réponse
      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error', 'Erreur de test');
    });
  });

  describe('POST /queues', () => {
    const validQueuePayload = {
      name: 'test-queue',
      options: { durable: true }
    };

    it('devrait créer une queue avec succès', async () => {
      // Envoyer la requête
      const response = await testRoute(app, '/queues', 'POST', {
        body: validQueuePayload
      });
      
      // Vérifier la réponse
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('queue', 'test-queue');
      
      // Vérifier l'appel au service
      expect(mockCreateQueue).toHaveBeenCalledWith(
        'test-queue',
        validQueuePayload.options
      );
    });
  });

  describe('POST /bindings', () => {
    const validBindingPayload = {
      queue: 'test-queue',
      exchange: 'test-exchange',
      routingKey: 'test-key'
    };

    it('devrait créer une liaison avec succès', async () => {
      // Envoyer la requête
      const response = await testRoute(app, '/bindings', 'POST', {
        body: validBindingPayload
      });
      
      // Vérifier la réponse
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('message', 'Liaison créée avec succès');
      
      // Vérifier l'appel au service
      expect(mockBindQueue).toHaveBeenCalledWith(
        'test-queue',
        'test-exchange',
        'test-key'
      );
    });
  });
}); 