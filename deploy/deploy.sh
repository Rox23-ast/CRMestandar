#!/usr/bin/env bash
# Despliegue del CRM Mudanzas Chico en el VPS (Docker + Nginx).
#
# Uso:
#   ./deploy.sh                          # solo el CRM (backend + proxy)
#   ./deploy.sh --cotizador <dir>        # también despliega el stack del cotizador
#
# Requisitos previos en el servidor:
#   - Repo clonado y .env en la raíz (nunca commitearlo)
#   - Certificados Let's Encrypt en /etc/letsencrypt/live/cotizador.chicologistica.com/
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="deploy/docker-compose.yml"
COTIZADOR_DIR=""

usage() {
  sed -n '2,8p' "$0" | sed 's/^# \{0,1\}//'
  exit 0
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --cotizador)
      shift
      if [[ $# -eq 0 ]]; then
        echo "Error: --cotizador requiere una ruta" >&2
        exit 1
      fi
      COTIZADOR_DIR="$1"
      ;;
    -h|--help)
      usage
      ;;
    *)
      echo "Argumento desconocido: $1" >&2
      exit 1
      ;;
  esac
  shift
done

cd "$REPO_DIR"

if [[ ! -f .env ]]; then
  echo "Error: no existe .env en $REPO_DIR (cópialo en el servidor, no se versiona)." >&2
  exit 1
fi

echo "==> git pull"
git pull --ff-only

echo "==> Asegurando permisos del volumen SQLite (el contenedor corre como usuario no-root)"
# El nombre físico del volumen depende del proyecto Compose: se resuelve desde
# el contenedor actual y, si aún no existe, se usa el prefijo por defecto.
SQLITE_VOLUME="$(docker inspect mudanzas_backend --format '{{range .Mounts}}{{if eq .Destination "/app/data"}}{{.Name}}{{end}}{{end}}' 2>/dev/null || true)"
if [[ -z "$SQLITE_VOLUME" ]]; then
  SQLITE_VOLUME="deploy_sqlite_data"
fi
docker volume create "$SQLITE_VOLUME" >/dev/null
docker run --rm -v "$SQLITE_VOLUME:/data" node:22.23.4-alpine chown -R 1000:1000 /data

echo "==> Compilando y desplegando el backend CRM (ejecuta prisma migrate deploy al arrancar)"
docker compose -f "$COMPOSE_FILE" up -d --build app

echo "==> Aplicando configuración de Nginx"
docker compose -f "$COMPOSE_FILE" up -d nginx
docker exec mudanzas_proxy nginx -t
docker exec mudanzas_proxy nginx -s reload || docker compose -f "$COMPOSE_FILE" restart nginx

if [[ -n "$COTIZADOR_DIR" ]]; then
  echo "==> Desplegando cotizador desde $COTIZADOR_DIR"
  ( cd "$COTIZADOR_DIR" && git pull --ff-only && docker compose up -d --build )
fi

echo "==> Verificando salud del CRM"
for i in $(seq 1 30); do
  if curl -fsS -k -o /dev/null https://127.0.0.1/health; then
    echo "    CRM OK (https://127.0.0.1/health)"
    break
  fi
  if [[ "$i" == 30 ]]; then
    echo "Error: el backend no respondió en /health tras 30 intentos. Revisa: docker logs mudanzas_backend" >&2
    exit 1
  fi
  sleep 2
done

if [[ -n "$COTIZADOR_DIR" ]]; then
  code="$(curl -s -k -o /dev/null -w '%{http_code}' https://127.0.0.1/cotizador/ || true)"
  if [[ "$code" == "200" ]]; then
    echo "    Cotizador OK (https://cotizador.chicologistica.com/cotizador/)"
  else
    echo "    Aviso: /cotizador/ responde $code (¿está desplegado el stack del cotizador?)" >&2
  fi
fi

echo "Despliegue completado. Panel: https://cotizador.chicologistica.com/crm/"
