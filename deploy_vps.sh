#!/bin/bash
# Script de deploy — rodar na VPS Ubuntu/Debian

set -e

echo "=== 1. Dependências do sistema ==="
sudo apt update && sudo apt install -y python3-pip python3-venv redis-server

echo "=== 2. Redis ==="
sudo systemctl start redis
sudo systemctl enable redis

echo "=== 3. Ambiente Python ==="
cd /opt/fbs-impressao/backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

echo "=== 4. Copia .env ==="
# Certifique-se de que o .env existe com suas credenciais antes de continuar
if [ ! -f .env ]; then
  echo "ERRO: arquivo .env não encontrado. Copie .env.example e preencha."
  exit 1
fi

echo "=== 5. Inicia FastAPI com systemd (ou use pm2/screen) ==="
# Exemplo com screen:
screen -dmS fastapi bash -c "source venv/bin/activate && uvicorn main:app --host 0.0.0.0 --port 8000"
screen -dmS celery bash -c "source venv/bin/activate && celery -A workers.celery_app worker --loglevel=info"

echo "=== Deploy concluído ==="
echo "FastAPI: http://0.0.0.0:8000"
echo "Webhook esperado em: POST /webhook/nova-arte"
