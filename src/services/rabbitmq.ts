import amqplib, { Connection, Channel, ConsumeMessage } from 'amqplib';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { statusService, StatusTypes } from './statusService';

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
 * États du circuit breaker
 */
export enum CircuitState {
  CLOSED = 'closed',   // Fonctionnement normal
  OPEN = 'open',       // Circuit ouvert, échecs détectés
  HALF_OPEN = 'half-open'  // État de transition pour tester si le service est de nouveau disponible
}

/**
 * Service de gestion des files d'attente RabbitMQ
 */
export class RabbitMQService {
  private connection: any | null = null;
  private channel: any | null = null;
  private readonly retryIntervals: number[] = [];
  private isConnecting: boolean = false;
  private isClosing: boolean = false;

  // Circuit breaker properties
  private circuitState: CircuitState = CircuitState.CLOSED;
  private failureCount: number = 0;
  private readonly failureThreshold: number = 5;
  private readonly resetTimeout: number = 30000; // 30 secondes
  private resetTimer: NodeJS.Timeout | null = null;
  private lastFailureTime: number = 0;

  constructor() {
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
    if (this.connection || this.isConnecting) {
      logger.info('Connexion RabbitMQ déjà établie ou en cours.');
      return;
    }

    // Vérifier l'état du circuit breaker
    if (this.circuitState === CircuitState.OPEN) {
      const now = Date.now();
      const timeSinceLastFailure = now - this.lastFailureTime;
      
      if (timeSinceLastFailure < this.resetTimeout) {
        logger.warn(`Circuit breaker ouvert. Nouvelle tentative dans ${Math.round((this.resetTimeout - timeSinceLastFailure) / 1000)}s`);
        throw new Error('Circuit breaker ouvert - service considéré comme indisponible');
      } else {
        // Essayer à nouveau après le délai de réinitialisation
        logger.info('Circuit breaker passant en état semi-ouvert pour tester la disponibilité du service');
        this.circuitState = CircuitState.HALF_OPEN;
      }
    }

    this.isConnecting = true;
    this.isClosing = false;

    try {
      const tlsOptions: any = {};
      if (env.security.tlsEnabled &&
          env.security.tlsCaPath &&
          env.security.tlsCertPath &&
          env.security.tlsKeyPath) {
        tlsOptions.cert = await this.readFile(env.security.tlsCertPath);
        tlsOptions.key = await this.readFile(env.security.tlsKeyPath);
        tlsOptions.ca = [await this.readFile(env.security.tlsCaPath)];
        // amqplib attend des options comme `passphrase` au niveau racine, pas dans un objet `tls`
        // et `heartbeat` est aussi une option de connexion racine.
      }
      
      const connectionOptions = {
          ...tlsOptions, // Spread TLS options ici
          heartbeat: env.rabbitmq.heartbeat,
      };

      this.connection = await amqplib.connect(env.rabbitmq.url, connectionOptions);
      this.channel = await this.connection.createChannel();
      
      logger.info('Connecté à RabbitMQ');
      statusService.updateStatus(StatusTypes.RABBITMQ, true);

      // Réinitialiser le circuit breaker après succès
      this.resetCircuitBreaker();

      this.connection.on('error', (err: Error) => {
        if (this.isClosing) return;
        logger.error({ err }, 'Erreur de connexion RabbitMQ');
        statusService.updateStatus(StatusTypes.RABBITMQ, false);
        this.handleConnectionFailure();
        this.handleDisconnect();
      });
      
      this.connection.on('close', () => {
        if (this.isClosing) return;
        logger.info('Connexion RabbitMQ fermée');
        statusService.updateStatus(StatusTypes.RABBITMQ, false);
        this.handleDisconnect();
      });
      
    } catch (err) {
      logger.error({ err }, 'Échec de connexion à RabbitMQ');
      statusService.updateStatus(StatusTypes.RABBITMQ, false);
      
      // Gestion du circuit breaker
      this.handleConnectionFailure();
      
      this.handleDisconnect(true); // Indiquer que c'est un échec de connexion initial
    } finally {
      this.isConnecting = false;
    }
  }

  /**
   * Gère les échecs de connexion pour le circuit breaker
   */
  private handleConnectionFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    
    if (this.failureCount >= this.failureThreshold) {
      if (this.circuitState !== CircuitState.OPEN) {
        logger.warn(`Circuit breaker ouvert après ${this.failureCount} échecs consécutifs`);
        this.circuitState = CircuitState.OPEN;
        
        // Planifier la transition vers l'état semi-ouvert
        if (this.resetTimer) {
          clearTimeout(this.resetTimer);
        }
        
        this.resetTimer = setTimeout(() => {
          logger.info('Circuit breaker passant en état semi-ouvert');
          this.circuitState = CircuitState.HALF_OPEN;
        }, this.resetTimeout);
      }
    }
  }

  /**
   * Réinitialise le circuit breaker après une opération réussie
   */
  private resetCircuitBreaker(): void {
    if (this.circuitState !== CircuitState.CLOSED) {
      logger.info('Circuit breaker fermé - service fonctionnel');
    }
    
    this.circuitState = CircuitState.CLOSED;
    this.failureCount = 0;
    
    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
      this.resetTimer = null;
    }
  }

  /**
   * Obtient l'état actuel du circuit breaker
   */
  public getCircuitState(): CircuitState {
    return this.circuitState;
  }

  private async handleDisconnect(initialConnectFailed = false): Promise<void> {
    this.connection = null;
    this.channel = null;
    if (!this.isClosing) { // Ne pas tenter de reconnecter si on ferme explicitement
        if (initialConnectFailed || !this.isConnecting) { // Si échec connexion init ou pas déjà en cours de reconnexion
            this.reconnect();
        }
    }
  }
  
  /**
   * Reconnexion avec backoff exponentiel
   */
  private async reconnect(attempt = 0): Promise<void> {
    if (this.connection || this.isConnecting || this.isClosing) {
      logger.info('Reconnexion annulée (déjà connecté, en cours de connexion ou de fermeture).');
      return;
    }
    
    // Vérifier l'état du circuit breaker
    if (this.circuitState === CircuitState.OPEN) {
      const now = Date.now();
      const timeSinceLastFailure = now - this.lastFailureTime;
      
      if (timeSinceLastFailure < this.resetTimeout) {
        logger.warn(`Circuit ouvert - attente avant nouvelle tentative: ${Math.round((this.resetTimeout - timeSinceLastFailure) / 1000)}s`);
        return;
      }
      
      logger.info('Délai de circuit breaker expiré, passage en état semi-ouvert');
      this.circuitState = CircuitState.HALF_OPEN;
    }

    this.isConnecting = true;

    const delay = this.retryIntervals[attempt] || env.retries.maxDelay;
    logger.info(`Tentative de reconnexion (${attempt + 1}/${env.retries.max}) dans ${delay}ms`);
    
    await new Promise(resolve => setTimeout(resolve, delay));

    if (this.isClosing || this.connection) { // Vérifier à nouveau après le délai
        this.isConnecting = false;
        logger.info('Reconnexion annulée après délai (connexion établie ou fermeture initiée).');
        return;
    }

    try {
      await this.connect(); // connect() gère isConnecting = false dans son finally
    } catch (err) {
      // Erreur loggée par connect(), handleDisconnect va appeler reconnect si nécessaire
      this.isConnecting = false; // S'assurer que c'est false si connect() throw avant son finally
      // Ne pas appeler reconnect(attempt + 1) ici pour éviter les boucles si connect() échoue systématiquement
      // et que handleDisconnect ne s'exécute pas correctement pour rappeler reconnect.
      // La logique de nouvelle tentative est dans handleDisconnect via connect().
    }
  }

  /**
   * Utilitaire pour lire un fichier (TLS)
   */
  private async readFile(path: string): Promise<Buffer> {
    const fs = await import('fs/promises');
    return fs.readFile(path);
  }

  private async ensureChannel(): Promise<any> {
    // Vérifier d'abord le circuit breaker
    if (this.circuitState === CircuitState.OPEN) {
      throw new Error('Circuit breaker ouvert - RabbitMQ considéré comme indisponible');
    }

    if (!this.channel || !this.connection) {
      logger.warn('Canal ou connexion RabbitMQ non disponible. Tentative de rétablissement...');
      await this.connect(); // Tente de (re)connecter si besoin. connect() gère l'état.
      if (!this.channel) {
        throw new Error('Canal RabbitMQ non disponible après tentative de reconnexion');
      }
    }
    return this.channel;
  }


  public async createExchange(name: string, type: 'direct' | 'fanout' | 'topic' | 'headers', options: { durable?: boolean } = {}): Promise<void> {
    try {
      const channel = await this.ensureChannel();
      await channel.assertExchange(name, type, {
        durable: options.durable !== false
      });
      logger.debug(`Exchange '${name}' de type ${type} créé`);
      
      // Opération réussie, réinitialiser le circuit breaker si en demi-ouvert
      if (this.circuitState === CircuitState.HALF_OPEN) {
        this.resetCircuitBreaker();
      }
    } catch (err) {
      // Gestion du circuit breaker en cas d'erreur
      if (this.circuitState === CircuitState.HALF_OPEN) {
        this.handleConnectionFailure();
      }
      throw err;
    }
  }

  public async createQueue(name: string, options: QueueOptions = {}): Promise<string> {
    try {
      const channel = await this.ensureChannel();
      const queueOptions: any = {
        durable: options.durable !== false,
        exclusive: options.exclusive || false,
        autoDelete: options.autoDelete || false,
        arguments: options.arguments || {}
      };
      if (options.deadLetterExchange) {
        queueOptions.arguments['x-dead-letter-exchange'] = options.deadLetterExchange;
      }
      const result = await channel.assertQueue(name, queueOptions);
      logger.debug(`Queue '${name}' créée`);
      
      // Opération réussie, réinitialiser le circuit breaker si en demi-ouvert
      if (this.circuitState === CircuitState.HALF_OPEN) {
        this.resetCircuitBreaker();
      }
      
      return result.queue;
    } catch (err) {
      // Gestion du circuit breaker en cas d'erreur
      if (this.circuitState === CircuitState.HALF_OPEN) {
        this.handleConnectionFailure();
      }
      throw err;
    }
  }

  public async bindQueue(queue: string, exchange: string, routingKey: string): Promise<void> {
    try {
      const channel = await this.ensureChannel();
      await channel.bindQueue(queue, exchange, routingKey);
      logger.debug(`Queue '${queue}' liée à l'exchange '${exchange}' avec la clé '${routingKey}'`);
      
      // Opération réussie, réinitialiser le circuit breaker si en demi-ouvert
      if (this.circuitState === CircuitState.HALF_OPEN) {
        this.resetCircuitBreaker();
      }
    } catch (err) {
      // Gestion du circuit breaker en cas d'erreur
      if (this.circuitState === CircuitState.HALF_OPEN) {
        this.handleConnectionFailure();
      }
      throw err;
    }
  }

  public async publish<T = any>(params: QueueMessage<T>): Promise<boolean> {
    try {
      const channel = await this.ensureChannel();
      const { exchange, routingKey, message, options = {} } = params;
      const content = Buffer.from(JSON.stringify(message));
      const publishOptions = {
        persistent: options.persistent !== false,
        priority: options.priority || 0,
        expiration: options.expiration,
        headers: options.headers || {}
      };

      const result = channel.publish(exchange, routingKey, content, publishOptions);
      if (!result) {
        logger.warn({ exchange, routingKey }, 'Publication de message en attente (backpressure). Attente du drain...');
        await new Promise<void>(resolve => channel.once('drain', resolve));
        logger.info('Canal RabbitMQ drainé, nouvelle tentative de publication...');
        return this.publish(params); // Nouvelle tentative
      }
      logger.debug({ exchange, routingKey, messageId: publishOptions.headers['message-id'] || 'unknown' }, 'Message publié');
      
      // Opération réussie, réinitialiser le circuit breaker si en demi-ouvert
      if (this.circuitState === CircuitState.HALF_OPEN) {
        this.resetCircuitBreaker();
      }
      
      return true;
    } catch (err) {
      logger.error({ err, exchange: params.exchange, routingKey: params.routingKey }, 'Échec de publication de message');
      
      // Gestion du circuit breaker en cas d'erreur
      if (this.circuitState === CircuitState.HALF_OPEN) {
        this.handleConnectionFailure();
      }
      
      throw err; // Rethrow pour que l'appelant puisse gérer
    }
  }

  public async consume<T = any>(queue: string, handler: MessageHandler<T>, options: { noAck?: boolean } = {}): Promise<void> {
    try {
      const channel = await this.ensureChannel();
      await channel.consume(queue, async (msg: ConsumeMessage | null) => {
        if (!msg) return;
        
        // Vérifier si le canal existe toujours, car la connexion a pu être perdue
        if (!this.channel) {
          logger.warn(`Canal non disponible pendant la consommation du message de la file '${queue}'. Message non traité.`);
          // Ne pas ack/nack si le canal n'existe plus. Le message restera dans la file.
          // Ou, si une stratégie de requeue est souhaitée ici, elle devrait être implémentée avec prudence.
          return;
        }

        try {
          const content = msg.content.toString();
          const messageData = JSON.parse(content) as T;
          
          const startTime = Date.now();
          const success = await handler(messageData, msg);
          const processingTime = (Date.now() - startTime) / 1000; // Convertir en secondes pour Prometheus
          
          logger.debug({ queue, processingTime, messageId: msg.properties.messageId || 'unknown' }, `Message traité en ${processingTime * 1000}ms`);

          if (this.channel) { // Vérifier à nouveau avant ack/nack
              if (success) {
                  this.channel.ack(msg);
              } else if (!options.noAck) {
                  this.channel.nack(msg, false, false); // Ne pas remettre en file pour éviter boucle infinie sur erreur persistante
              }
          }
        } catch (err) {
          logger.error({ err, queue, messageId: msg.properties.messageId }, 'Erreur lors du traitement du message');
          
          if (this.channel && !options.noAck) { // Vérifier à nouveau
            this.channel.nack(msg, false, false);
          }
        }
      }, { noAck: options.noAck || false });
      
      logger.info(`Consommateur démarré pour la queue '${queue}'`);
      
      // Opération réussie, réinitialiser le circuit breaker si en demi-ouvert
      if (this.circuitState === CircuitState.HALF_OPEN) {
        this.resetCircuitBreaker();
      }
    } catch (err) {
      // Gestion du circuit breaker en cas d'erreur
      if (this.circuitState === CircuitState.HALF_OPEN) {
        this.handleConnectionFailure();
      }
      throw err;
    }
  }

  public async close(): Promise<void> {
    this.isClosing = true;
    logger.info('Fermeture de la connexion RabbitMQ...');
    try {
        if (this.channel) {
            await this.channel.close();
            logger.info('Canal RabbitMQ fermé.');
        }
    } catch (err) {
        logger.error({ err }, 'Erreur lors de la fermeture du canal RabbitMQ.');
    }
    try {
        if (this.connection) {
            await this.connection.close(); // close() sur la connexion devrait aussi fermer les canaux
            logger.info('Connexion RabbitMQ fermée.');
        }
    } catch (err) {
        logger.error({ err }, 'Erreur lors de la fermeture de la connexion RabbitMQ.');
    }
    this.channel = null;
    this.connection = null;
    statusService.updateStatus(StatusTypes.RABBITMQ, false);
    this.isClosing = false; // Réinitialiser au cas où une nouvelle connexion serait tentée plus tard
  }
} 