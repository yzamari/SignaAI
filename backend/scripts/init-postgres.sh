#!/bin/bash
set -e

# Create multiple databases for microservices
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" <<-EOSQL
    CREATE DATABASE auth_db;
    CREATE DATABASE document_db;
    CREATE DATABASE signature_db;
    CREATE DATABASE notification_db;
    CREATE DATABASE workflow_db;
    
    GRANT ALL PRIVILEGES ON DATABASE auth_db TO $POSTGRES_USER;
    GRANT ALL PRIVILEGES ON DATABASE document_db TO $POSTGRES_USER;
    GRANT ALL PRIVILEGES ON DATABASE signature_db TO $POSTGRES_USER;
    GRANT ALL PRIVILEGES ON DATABASE notification_db TO $POSTGRES_USER;
    GRANT ALL PRIVILEGES ON DATABASE workflow_db TO $POSTGRES_USER;
EOSQL

echo "✅ All microservice databases created successfully"