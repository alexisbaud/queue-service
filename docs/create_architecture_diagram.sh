#!/bin/bash

# Vérifier si PlantUML est installé
if ! command -v plantuml &> /dev/null; then
    echo "PlantUML n'est pas installé. Installation requise."
    echo "Vous pouvez l'installer avec: 'brew install plantuml' sur macOS"
    echo "Ou télécharger depuis: https://plantuml.com/download"
    exit 1
fi

# Créer le fichier PlantUML
cat > architecture.puml << 'EOL'
@startuml
!theme plain
skinparam linetype ortho

rectangle "API Client" as client #lightblue
rectangle "Queue Service" as api #lightgreen
queue "RabbitMQ" as rabbitmq #orange
rectangle "Workers" as workers #pink
database "Prometheus" as prom #lightgrey
rectangle "Grafana" as grafana #gold

client -down-> api: 1. HTTP Request
api -down-> rabbitmq: 2. Publish Message
rabbitmq -down-> workers: 3. Consume Message
workers -right-> prom: 4. Store Metrics
prom -up-> grafana: 5. Visualize
api -right-> prom: Store API Metrics

note right of rabbitmq
  Exchanges:
  - default (direct)
  - email (direct)
  - notifications (fanout)
  - dlx (dead letter)
  
  Queues:
  - email_queue
  - dlq (dead letter queue)
end note

note right of workers
  Consumers:
  - EmailConsumer
end note

@enduml
EOL

# Générer l'image PNG
plantuml architecture.puml

echo "Diagramme architecture.png généré avec succès."

# Déplacer le diagramme dans le dossier parent
mv architecture.png ../architecture.png

# Nettoyer le fichier temporaire
rm architecture.puml

echo "Diagramme déplacé vers ../architecture.png" 