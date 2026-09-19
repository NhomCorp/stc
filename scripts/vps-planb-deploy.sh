#!/bin/bash
set -eu
cd /home/stcadmin/app

echo "== Kill hung docker builds =="
pkill -f 'docker-compose up -d --build app' 2>/dev/null || true
pkill -f 'docker-compose build' 2>/dev/null || true
sleep 1

# Remove non-project build containers only
for id in $(docker ps -q); do
  name=$(docker inspect -f '{{.Name}}' "$id")
  case "$name" in
    /stc-postgres|/stc-app) ;;
    *)
      echo "rm $name"
      docker rm -f "$id" >/dev/null || true
      ;;
  esac
done

echo "== Stop stc-app to free RAM =="
docker stop stc-app >/dev/null || true
free -h | head -2

echo "== Sync code already on origin/main? =="
git fetch origin main
git reset --hard origin/main
git clean -fd -e .env -e .env.local -e .env.production
test -f .env || { echo 'MISSING .env'; exit 1; }
git log -1 --oneline

echo "== Host npm build =="
export NODE_OPTIONS=--max-old-space-size=2048
export NEXT_TELEMETRY_DISABLED=1
if [ ! -d node_modules/next ]; then
  npm ci
fi
npm run build

test -f .next/standalone/server.js || { echo 'Missing standalone'; exit 1; }

echo "== Build runner image from temp context =="
CTX=/tmp/stc-image-context
rm -rf "$CTX"
mkdir -p "$CTX/.next/static"
cp -a public "$CTX/public"
cp -a .next/standalone/. "$CTX/"
cp -a .next/static/. "$CTX/.next/static/"
cat > "$CTX/Dockerfile" <<'EOF'
FROM node:22-alpine
RUN addgroup -S -g 1001 nextjs && adduser -S -u 1001 nextjs
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
COPY --chown=nextjs:nextjs . .
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
EOF
docker build -t stc-app:latest "$CTX"

DB_URL=$(python3 - <<'PY'
from pathlib import Path
for line in Path('/home/stcadmin/app/.env').read_text().splitlines():
    if line.startswith('DATABASE_URL='):
        print(line.split('=',1)[1].strip().strip('"').strip("'"))
        break
else:
    print('postgres://stcadmin:stcadmin123@postgres:5432/stc')
PY
)
NET=$(docker inspect stc-postgres -f '{{range $k,$v := .NetworkSettings.Networks}}{{println $k}}{{end}}' | head -1)
echo "NETWORK=$NET"

docker rm -f stc-app >/dev/null 2>&1 || true
docker run -d \
  --name stc-app \
  --restart unless-stopped \
  --network "$NET" \
  -p 127.0.0.1:3000:3000 \
  -e "DATABASE_URL=$DB_URL" \
  -e PORT=3000 \
  --health-cmd='wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1' \
  --health-interval=30s \
  --health-timeout=5s \
  --health-retries=3 \
  stc-app:latest

sleep 4
docker ps -f name=stc-app
curl -sS --max-time 10 http://127.0.0.1:3000/api/health || true
echo
git rev-parse --short HEAD
echo DONE
