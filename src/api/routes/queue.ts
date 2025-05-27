import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { RabbitMQService, type QueueMessage } from '../../services/rabbitmq';

// Instanciation du service RabbitMQ
const rabbitMQService = new RabbitMQService();
const queueRoutes = new Hono();

// Schéma de validation pour la publication de messages
const publishSchema = z.object({
  exchange: z.string(),
  routingKey: z.string(),
  message: z.any().refine(val => val !== undefined, { message: "Le champ message est requis." }),
  options: z.object({
    persistent: z.boolean().optional(),
    priority: z.number().optional(),
    expiration: z.string().optional(),
    headers: z.record(z.any()).optional()
  }).optional()
});

// Schéma pour la création de files d'attente
const queueSchema = z.object({
  name: z.string(),
  options: z.object({
    durable: z.boolean().optional(),
    exclusive: z.boolean().optional(),
    autoDelete: z.boolean().optional(),
    deadLetterExchange: z.string().optional(),
    arguments: z.record(z.any()).optional()
  }).optional()
});

// Schéma pour la liaison de queues aux exchanges
const bindingSchema = z.object({
  queue: z.string(),
  exchange: z.string(),
  routingKey: z.string()
});

// Route pour publier un message
queueRoutes.post('/publish', zValidator('json', publishSchema), async (c) => {
  const data = c.req.valid('json');
  
  try {
    // Assurer la conformité avec QueueMessage<any>
    const queueMessage: QueueMessage<any> = {
      exchange: data.exchange,
      routingKey: data.routingKey,
      message: data.message, // Zod s'assure que `message` est là grâce au refine
      options: data.options
    };
    await rabbitMQService.publish(queueMessage);
    return c.json({ success: true, message: 'Message publié avec succès' });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return c.json({ success: false, error: errorMessage }, 500);
  }
});

// Route pour créer une file d'attente
queueRoutes.post('/queues', zValidator('json', queueSchema), async (c) => {
  const { name, options } = c.req.valid('json');
  
  try {
    const queue = await rabbitMQService.createQueue(name, options);
    return c.json({ success: true, queue });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return c.json({ success: false, error: errorMessage }, 500);
  }
});

// Route pour lier une file à un exchange
queueRoutes.post('/bindings', zValidator('json', bindingSchema), async (c) => {
  const { queue, exchange, routingKey } = c.req.valid('json');
  
  try {
    await rabbitMQService.bindQueue(queue, exchange, routingKey);
    return c.json({ success: true, message: 'Liaison créée avec succès' });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return c.json({ success: false, error: errorMessage }, 500);
  }
});

// Route pour obtenir la liste des files d'attente (à implémenter si le service RabbitMQ le supporte)
queueRoutes.get('/queues', async (c) => {
  return c.json({
    message: "Fonctionnalité à implémenter: liste des files d'attente"
  });
});

export { queueRoutes }; 