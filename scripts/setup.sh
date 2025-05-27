#!/bin/bash

# Couleurs pour les messages
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== Configuration du Queue Service ===${NC}"

# Vérification de Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}Node.js n'est pas installé. Veuillez l'installer avant de continuer.${NC}"
    exit 1
fi

# Vérification de Docker
if ! command -v docker &> /dev/null; then
    echo -e "${RED}Docker n'est pas installé. Veuillez l'installer avant de continuer.${NC}"
    exit 1
fi

# Vérification de Docker Compose
if ! command -v docker compose &> /dev/null; then
    echo -e "${RED}Docker Compose n'est pas installé. Veuillez l'installer avant de continuer.${NC}"
    exit 1
fi

# Installation des dépendances
echo -e "${YELLOW}Installation des dépendances...${NC}"
npm install

# Création du fichier .env s'il n'existe pas
if [ ! -f .env ]; then
    echo -e "${YELLOW}Création du fichier .env à partir de .env.example...${NC}"
    cp .env.example .env
    echo -e "${GREEN}Fichier .env créé avec succès.${NC}"
fi

# Démarrage des services Docker
echo -e "${YELLOW}Démarrage des services Docker...${NC}"
docker compose up -d

# Attente que RabbitMQ soit prêt
echo -e "${YELLOW}Attente du démarrage de RabbitMQ...${NC}"
sleep 10

# Construction du projet
echo -e "${YELLOW}Construction du projet...${NC}"
npm run build

echo -e "${GREEN}=== Configuration terminée ===${NC}"
echo -e "${GREEN}Pour démarrer le service:${NC}"
echo -e "${YELLOW}npm run dev${NC} (développement)"
echo -e "${YELLOW}npm start${NC} (production)"

echo -e "${GREEN}Pour visualiser l'interface:${NC}"
echo -e "RabbitMQ Management: ${YELLOW}http://localhost:15672${NC} (guest/guest)" 