/**
 * Test d'intégration pour RabbitMQ
 * 
 * IMPORTANT: Ce test nécessite une instance RabbitMQ en cours d'exécution.
 * Il est désactivé par défaut (.skip) pour éviter de perturber les pipelines CI.
 * Pour l'exécuter, lancez: `npm test -- -t "RabbitMQ Integration"`
 */

import { RabbitMQService } from '../../src/services/rabbitmq';

// Tests désactivés par défaut (skip), car nécessitent RabbitMQ
describe.skip('RabbitMQ Integration', () => {
  let rabbitMQService: RabbitMQService;
  const testExchange = 'test-integration-exchange';
  const testQueue = 'test-integration-queue';
  const testRoutingKey = 'test-integration-key';

  beforeAll(async () => {
    // Créer une nouvelle instance du service
    rabbitMQService = new RabbitMQService();
    
    // Se connecter à RabbitMQ
    try {
      await rabbitMQService.connect();
    } catch (error) {
      console.error('Impossible de se connecter à RabbitMQ pour les tests d\'intégration');
      throw error;
    }
  });

  afterAll(async () => {
    // Fermer la connexion après les tests
    if (rabbitMQService) {
      await rabbitMQService.close();
    }
  });

  it('devrait se connecter à RabbitMQ', () => {
    // La connexion a déjà été établie dans beforeAll
    // Ce test vérifie simplement que l'opération s'est bien déroulée
    expect(rabbitMQService).toBeDefined();
  });

  it('devrait créer un exchange', async () => {
    await expect(
      rabbitMQService.createExchange(testExchange, 'direct', { durable: true })
    ).resolves.not.toThrow();
  });

  it('devrait créer une queue', async () => {
    const queueName = await rabbitMQService.createQueue(testQueue, { durable: true });
    expect(queueName).toBe(testQueue);
  });

  it('devrait lier une queue à un exchange', async () => {
    await expect(
      rabbitMQService.bindQueue(testQueue, testExchange, testRoutingKey)
    ).resolves.not.toThrow();
  });

  it('devrait publier et consommer un message', async () => {
    // Créer une promesse pour recevoir le message
    const messageReceived = new Promise<any>((resolve) => {
      // Configurer un consommateur
      rabbitMQService.consume(testQueue, async (message) => {
        resolve(message);
        return true; // Acquitter le message
      });
    });

    // Message de test
    const testMessage = { test: true, timestamp: Date.now() };

    // Publier le message
    await rabbitMQService.publish({
      exchange: testExchange,
      routingKey: testRoutingKey,
      message: testMessage
    });

    // Attendre de recevoir le message
    const receivedMessage = await messageReceived;
    
    // Vérifier que le message reçu correspond au message envoyé
    expect(receivedMessage).toMatchObject(testMessage);
  });
}); 