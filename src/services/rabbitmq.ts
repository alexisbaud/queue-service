import amqplib, { Connection, Channel, ConsumeMessage } from 'amqplib';
import { env } from '../config/env';
import { logger } from '../utils/logger';

/**
 * Options pour la publication d'un message
 */
export interface PublishOptions {
  persistent?: boolean;
  priority?: number;
  expiration?: string;
  headers?: Record<string, any>;
}

/**
 * Message entrée/sortie
 */
export interface QueueMessage<T = any> {
  exchange: string;
  routingKey: string;
  message: T;
  options?: PublishOptions;
}

/**
 * Options pour la création d'une queue
 */
export interface QueueOptions {
  durable?: boolean;
  exclusive?: boolean;
  autoDelete?: boolean;
  arguments?: Record<string, any>;
  deadLetterExchange?: string;
}

/**
 * Type pour les fonctions de traitement de message
 */
export type MessageHandler<T = any> = (message: T, originalMessage: ConsumeMessage) => Promise<boolean>;

/**
 * Service de gestion des files d'attente RabbitMQ
 */
export class RabbitMQService {
  private connection: Connection | null = null;
  private channel: Channel | null = null;
  private readonly retryIntervals: number[] = [];

  constructor() {
    // Initialisation des intervalles de retry avec backoff exponentiel
    let delay = env.retries.initialDelay;
    for (let i = 0; i < env.retries.max; i++) {
      this.retryIntervals.push(delay);
      delay = Math.min(delay * 2, env.retries.maxDelay);
    }
  }

  /**
   * Établit une connexion à RabbitMQ
   */
  public async connect(): Promise<void> {
    try {
      const options: any = {
        heartbeat: env.rabbitmq.heartbeat
      };

      // Configuration TLS si activée
      if (env.security.tlsEnabled && 
          env.security.tlsCaPath && 
          env.security.tlsCertPath && 
          env.security.tlsKeyPath) {
        options.cert = await this.readFile(env.security.tlsCertPath);
        options.key = await this.readFile(env.security.tlsKeyPath);
        options.ca = [await this.readFile(env.security.tlsCaPath)];
      }

      this.connection = await amqplib.connect(env.rabbitmq.url, options);
      this.channel = await this.connection.createChannel();
      
      logger.info('Connecté à RabbitMQ');
      
      // Gestionnaires d'événements pour la reconnexion
      this.connection.on('error', (err) => {
        logger.error({ err }, 'Erreur de connexion RabbitMQ');
        this.reconnect();
      });
      
      this.connection.on('close', () => {
        logger.info('Connexion RabbitMQ fermée');
        this.reconnect();
      });
      
    } catch (err) {
      logger.error({ err }, 'Échec de connexion à RabbitMQ');
      this.reconnect();
    }
  }

  /**
   * Reconnexion avec backoff exponentiel
   */
  private async reconnect(attempt = 0): Promise<void> {
    if (attempt >= env.retries.max) {
      logger.error('Nombre maximal de tentatives de reconnexion atteint');
      return;
    }

    const delay = this.retryIntervals[attempt];
    logger.info(`Tentative de reconnexion dans ${delay}ms (${attempt + 1}/${env.retries.max})`);
    
    setTimeout(async () => {
      try {
        await this.connect();
      } catch (err) {
        this.reconnect(attempt + 1);
      }
    }, delay);
  }

  /**
   * Utilitaire pour lire un fichier (TLS)
   */
  private async readFile(path: string): Promise<Buffer> {
    const fs = await import('fs/promises');
    return fs.readFile(path);
  }

  /**
   * Crée un exchange
   */
  public async createExchange(name: string, type: 'direct' | 'fanout' | 'topic' | 'headers', options: { durable?: boolean } = {}): Promise<void> {
    if (!this.channel) {
      throw new Error('Canal RabbitMQ non disponible');
    }
    
    await this.channel.assertExchange(name, type, {
      durable: options.durable !== false
    });
    
    logger.debug(`Exchange '${name}' de type ${type} créé`);
  }

  /**
   * Crée une file d'attente
   */
  public async createQueue(name: string, options: QueueOptions = {}): Promise<string> {
    if (!this.channel) {
      throw new Error('Canal RabbitMQ non disponible');
    }
    
    const queueOptions: any = {
      durable: options.durable !== false,
      exclusive: options.exclusive || false,
      autoDelete: options.autoDelete || false,
      arguments: options.arguments || {}
    };
    
    // Configuration de la dead letter queue
    if (options.deadLetterExchange) {
      queueOptions.arguments['x-dead-letter-exchange'] = options.deadLetterExchange;
    }
    
    const result = await this.channel.assertQueue(name, queueOptions);
    logger.debug(`Queue '${name}' créée`);
    
    return result.queue;
  }

  /**
   * Lie une file à un exchange
   */
  public async bindQueue(queue: string, exchange: string, routingKey: string): Promise<void> {
    if (!this.channel) {
      throw new Error('Canal RabbitMQ non disponible');
    }
    
    await this.channel.bindQueue(queue, exchange, routingKey);
    logger.debug(`Queue '${queue}' liée à l'exchange '${exchange}' avec la clé '${routingKey}'`);
  }

  /**
   * Publie un message
   */
  public async publish<T = any>(params: QueueMessage<T>): Promise<boolean> {
    if (!this.channel) {
      throw new Error('Canal RabbitMQ non disponible');
    }

    const { exchange, routingKey, message, options = {} } = params;
    const content = Buffer.from(JSON.stringify(message));
    
    const publishOptions = {
      persistent: options.persistent !== false,
      priority: options.priority || 0,
      expiration: options.expiration,
      headers: options.headers || {}
    };

    try {
      const result = this.channel.publish(exchange, routingKey, content, publishOptions);
      if (result) {
        logger.debug({
          exchange,
          routingKey,
          messageId: publishOptions.headers['message-id'] || 'unknown'
        }, 'Message publié');
      } else {
        logger.warn({
          exchange,
          routingKey
        }, 'Publication de message en attente (backpressure)');
      }
      return result;
    } catch (err) {
      logger.error({ err, exchange, routingKey }, 'Échec de publication de message');
      throw err;
    }
  }

  /**
   * Consomme des messages d'une file
   */
  public async consume<T = any>(queue: string, handler: MessageHandler<T>, options: { noAck?: boolean } = {}): Promise<void> {
    if (!this.channel) {
      throw new Error('Canal RabbitMQ non disponible');
    }

    await this.channel.consume(queue, async (msg) => {
      if (!msg) return;

      try {
        const content = msg.content.toString();
        const message = JSON.parse(content) as T;
        
        const startTime = Date.now();
        const success = await handler(message, msg);
        const processingTime = Date.now() - startTime;
        
        logger.debug({
          queue,
          processingTime,
          messageId: msg.properties.messageId || 'unknown'
        }, `Message traité en ${processingTime}ms`);

        if (success) {
          this.channel?.ack(msg);
        } else if (!options.noAck) {
          this.channel?.nack(msg, false, false);
        }
      } catch (err) {
        logger.error({ err, queue }, 'Erreur lors du traitement du message');
        if (!options.noAck) {
          this.channel?.nack(msg, false, false);
        }
      }
    }, { noAck: options.noAck || false });
    
    logger.info(`Consommateur démarré pour la queue '${queue}'`);
  }

  /**
   * Ferme la connexion
   */
  public async close(): Promise<void> {
    if (this.channel) {
      await this.channel.close();
    }
    
    if (this.connection) {
      await this.connection.close();
    }
    
    logger.info('Connexion RabbitMQ fermée');
  }
} 