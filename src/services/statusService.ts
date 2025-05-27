import { logger } from '../utils/logger';

/**
 * Type pour les fonctions d'écoute des changements de statut
 */
type StatusListener = (status: boolean) => void;

/**
 * Service de gestion des statuts partagés dans l'application
 * Utilise le pattern Observer pour éviter les dépendances circulaires
 */
class StatusService {
  private listeners: Map<string, StatusListener[]> = new Map();
  private statuses: Map<string, boolean> = new Map();
  
  /**
   * Ajoute un écouteur pour un type de statut spécifique
   */
  public addListener(statusType: string, listener: StatusListener): void {
    if (!this.listeners.has(statusType)) {
      this.listeners.set(statusType, []);
    }
    
    this.listeners.get(statusType)?.push(listener);
    
    // Si un statut existe déjà, notifier immédiatement le nouveau listener
    if (this.statuses.has(statusType)) {
      const currentStatus = this.statuses.get(statusType) || false;
      listener(currentStatus);
    }
  }
  
  /**
   * Met à jour un statut et notifie tous les écouteurs
   */
  public updateStatus(statusType: string, status: boolean): void {
    this.statuses.set(statusType, status);
    
    logger.debug(`Statut '${statusType}' mis à jour: ${status}`);
    
    const statusListeners = this.listeners.get(statusType) || [];
    statusListeners.forEach(listener => {
      try {
        listener(status);
      } catch (error) {
        logger.error({ error }, `Erreur lors de la notification du statut '${statusType}'`);
      }
    });
  }
  
  /**
   * Récupère l'état actuel d'un statut
   */
  public getStatus(statusType: string): boolean {
    return this.statuses.get(statusType) || false;
  }
}

// Exporter une instance singleton du service
export const statusService = new StatusService();

// Constantes pour les types de statut
export const StatusTypes = {
  RABBITMQ: 'rabbitmq',
}; 