#!/usr/bin/env bash
# Eén commando om lock/poort-problemen met `next dev` op te lossen.
# Gebruik: npm run dev:clean   (of: bash scripts/dev-clean.sh)

set -e
cd "$(dirname "$0")/.."

echo "== MIMA dev:clean =="
echo "1) Poorten 3000 en 3001 vrijmaken..."
for port in 3000 3001; do
  pids=$(lsof -ti:"$port" 2>/dev/null || true)
  if [ -n "$pids" ]; then
    echo "   Poort $port in gebruik door PID(s): $pids — stoppen..."
    echo "$pids" | xargs kill -9 2>/dev/null || true
  else
    echo "   Poort $port is vrij."
  fi
done

echo "2) Stray next/node dev processen stoppen..."
pkill -f "next dev" 2>/dev/null || true
pkill -f "next/dist/bin/next" 2>/dev/null || true
sleep 1

echo "3) .next/dev verwijderen (lock + cache dev)..."
rm -rf .next/dev

echo "4) Dev server starten..."
exec npm run dev
