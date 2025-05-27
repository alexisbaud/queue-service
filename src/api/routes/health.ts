import { Hono } from 'hono';
import { statusService, StatusTypes } from '../../services/statusService';

const healthRoutes = new Hono();

// Endpoint de santé du service
healthRoutes.get('/', (c) => {
  const rabbitMQStatus = statusService.getStatus(StatusTypes.RABBITMQ);
  
  return c.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    rabbitmq: rabbitMQStatus ? 'connected' : 'disconnected',
    version: process.env.npm_package_version || '1.0.0'
  });
});

// Endpoint pour vérifier la capacité de gérer les requêtes
healthRoutes.get('/ready', (c) => {
  const rabbitMQStatus = statusService.getStatus(StatusTypes.RABBITMQ);
  
  if (!rabbitMQStatus) {
    return c.json({ status: 'not_ready', reason: 'rabbitmq_disconnected' }, 503);
  }
  
  return c.json({ status: 'ready' });
});

// Endpoint alive pour les health checks basiques
healthRoutes.get('/live', (c) => {
  return c.json({ status: 'alive' });
});

export { healthRoutes }; 