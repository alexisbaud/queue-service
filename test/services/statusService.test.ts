import { statusService, StatusTypes } from '../../src/services/statusService';

describe('StatusService', () => {
  beforeEach(() => {
    // Réinitialiser tous les status avant chaque test
    statusService.updateStatus(StatusTypes.RABBITMQ, false);
  });

  it('devrait stocker et récupérer un statut', () => {
    // Initialiser à false
    expect(statusService.getStatus(StatusTypes.RABBITMQ)).toBe(false);
    
    // Mettre à jour à true
    statusService.updateStatus(StatusTypes.RABBITMQ, true);
    expect(statusService.getStatus(StatusTypes.RABBITMQ)).toBe(true);
    
    // Retour à false
    statusService.updateStatus(StatusTypes.RABBITMQ, false);
    expect(statusService.getStatus(StatusTypes.RABBITMQ)).toBe(false);
  });

  it('devrait gérer un statut inexistant', () => {
    expect(statusService.getStatus('inconnu')).toBe(false);
  });

  it('devrait notifier les écouteurs lors de la mise à jour du statut', () => {
    const listener = jest.fn();
    
    // Ajouter un écouteur
    statusService.addListener(StatusTypes.RABBITMQ, listener);
    
    // Vérifier que l'écouteur reçoit le statut actuel
    expect(listener).toHaveBeenCalledWith(false);
    
    // Réinitialiser le compteur d'appels
    listener.mockClear();
    
    // Mettre à jour le statut et vérifier que l'écouteur est appelé
    statusService.updateStatus(StatusTypes.RABBITMQ, true);
    expect(listener).toHaveBeenCalledWith(true);
  });

  it('devrait gérer plusieurs écouteurs', () => {
    const listener1 = jest.fn();
    const listener2 = jest.fn();
    
    statusService.addListener(StatusTypes.RABBITMQ, listener1);
    listener1.mockClear(); // Clear initial call
    
    statusService.addListener(StatusTypes.RABBITMQ, listener2);
    expect(listener2).toHaveBeenCalledWith(false);
    listener2.mockClear();
    
    statusService.updateStatus(StatusTypes.RABBITMQ, true);
    expect(listener1).toHaveBeenCalledWith(true);
    expect(listener2).toHaveBeenCalledWith(true);
  });
}); 