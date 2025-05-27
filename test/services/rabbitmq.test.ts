import { mock, mockReset } from 'jest-mock-extended';
import { RabbitMQService, CircuitState, QueueMessage } from '../../src/services/rabbitmq';
import { statusService, StatusTypes } from '../../src/services/statusService';
import * as amqplib from 'amqplib';

// Mock du module amqplib
jest.mock('amqplib', () => ({
  connect: jest.fn(),
}));

// Type étendu pour le mock Connection
interface MockConnection extends amqplib.Connection {
  createChannel: jest.Mock;
}

// Type étendu pour le mock Channel
interface MockChannel extends amqplib.Channel {
  publish: jest.Mock;
  assertQueue: jest.Mock;
  bindQueue: jest.Mock;
}

describe('RabbitMQService', () => {
  // Mocks pour les objets amqplib
  const mockChannel = mock<MockChannel>();
  const mockConnection = mock<MockConnection>();
  
  // Instance du service à tester
  let rabbitMQService: RabbitMQService;

  beforeEach(() => {
    // Réinitialiser les mocks
    mockReset(mockChannel);
    mockReset(mockConnection);
    
    // Configurer les mocks
    mockConnection.createChannel.mockResolvedValue(mockChannel as any);
    (amqplib.connect as jest.Mock).mockResolvedValue(mockConnection);
    
    // Créer une nouvelle instance pour chaque test
    rabbitMQService = new RabbitMQService();
    
    // Réinitialiser le statut
    statusService.updateStatus(StatusTypes.RABBITMQ, false);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('connect', () => {
    it('devrait se connecter à RabbitMQ avec succès', async () => {
      await rabbitMQService.connect();
      
      expect(amqplib.connect).toHaveBeenCalled();
      expect(mockConnection.createChannel).toHaveBeenCalled();
      expect(statusService.getStatus(StatusTypes.RABBITMQ)).toBe(true);
    });

    it('devrait gérer les erreurs de connexion', async () => {
      // Simuler une erreur de connexion
      (amqplib.connect as jest.Mock).mockRejectedValueOnce(new Error('Connexion refusée'));
      
      // Modifions l'attente pour correspondre au comportement réel:
      // connect() gère l'erreur et ne la propage pas
      await rabbitMQService.connect();
      
      // Mais il doit mettre à jour le statut RabbitMQ à false
      expect(statusService.getStatus(StatusTypes.RABBITMQ)).toBe(false);
    });
  });

  describe('Circuit Breaker', () => {
    it('devrait être fermé par défaut', () => {
      expect(rabbitMQService.getCircuitState()).toBe(CircuitState.CLOSED);
    });

    it('devrait ouvrir le circuit après des erreurs répétées', async () => {
      // Simuler plusieurs échecs de connexion pour ouvrir le circuit
      (amqplib.connect as jest.Mock).mockRejectedValue(new Error('Connexion refusée'));
      
      // Les 5 tentatives ne doivent pas lever d'erreur mais seulement
      // mettre à jour l'état du circuit breaker
      for (let i = 0; i < 5; i++) {
        await rabbitMQService.connect();
      }
      
      expect(rabbitMQService.getCircuitState()).toBe(CircuitState.OPEN);
    });
  });

  describe('publish', () => {
    it('devrait publier un message avec succès', async () => {
      // Configurer le mock pour le canal
      mockChannel.publish.mockReturnValue(true);
      
      // Connecter d'abord le service
      await rabbitMQService.connect();
      
      // Message à publier
      const message: QueueMessage = {
        exchange: 'test-exchange',
        routingKey: 'test-key',
        message: { test: 'data' },
        options: { persistent: true }
      };
      
      // Publier le message
      const result = await rabbitMQService.publish(message);
      
      expect(result).toBe(true);
      expect(mockChannel.publish).toHaveBeenCalledWith(
        'test-exchange',
        'test-key',
        expect.any(Buffer),
        expect.objectContaining({ persistent: true })
      );
    });

    it('devrait gérer les erreurs de publication', async () => {
      // Connecter d'abord le service
      await rabbitMQService.connect();
      
      // Simuler une erreur lors de la publication
      mockChannel.publish.mockImplementation(() => {
        throw new Error('Erreur de publication');
      });
      
      // Message à publier
      const message: QueueMessage = {
        exchange: 'test-exchange',
        routingKey: 'test-key',
        message: { test: 'data' }
      };
      
      // La publication devrait échouer
      await expect(rabbitMQService.publish(message)).rejects.toThrow('Erreur de publication');
    });
  });

  describe('createQueue', () => {
    it('devrait créer une queue avec succès', async () => {
      // Configurer le mock pour assertQueue
      mockChannel.assertQueue.mockResolvedValue({ queue: 'test-queue', messageCount: 0, consumerCount: 0 });
      
      // Connecter d'abord le service
      await rabbitMQService.connect();
      
      // Créer la queue
      const queueName = await rabbitMQService.createQueue('test-queue', { durable: true });
      
      expect(queueName).toBe('test-queue');
      expect(mockChannel.assertQueue).toHaveBeenCalledWith(
        'test-queue',
        expect.objectContaining({ durable: true })
      );
    });
  });

  describe('bindQueue', () => {
    it('devrait lier une queue à un exchange', async () => {
      // Connecter d'abord le service
      await rabbitMQService.connect();
      
      // Lier la queue
      await rabbitMQService.bindQueue('test-queue', 'test-exchange', 'test-key');
      
      expect(mockChannel.bindQueue).toHaveBeenCalledWith(
        'test-queue',
        'test-exchange',
        'test-key'
      );
    });
  });
}); 