import { Hono } from 'hono';
import { healthRoutes } from './health';
import { queueRoutes } from './queue';

const api = new Hono();

// Middleware pour les logs et la gestion des erreurs
api.use('*', async (c, next) => {
  try {
    await next();
  } catch (error) {
    // Gestion des erreurs centralisée
    const status = error instanceof Error ? 500 : 400;
    return c.json({ 
      error: error instanceof Error ? error.message : String(error),
      status 
    }, status);
  }
});

// Groupes de routes
api.route('/healthz', healthRoutes);
api.route('/api/v1', queueRoutes);

export { api }; 