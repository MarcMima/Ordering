# Next dev lock / poort 3000 al in gebruik

## Wat er gebeurt

Next.js 16 legt een **echte file lock** op `.next/dev/lock`. Als je alleen het bestand verwijdert terwijl er nog een **Node-proces** draait dat die lock vasthoudt, kan een nieuwe `next dev` **niet** opnieuw locken — je krijgt dan:

```text
Unable to acquire lock at .../.next/dev/lock, is another instance of next dev running?
```

Ook zie je vaak: **Port 3000 is in use** (bijv. door PID 8432) — dat is meestal **dezelfde** oude dev server.

## Oplossing (één commando)

```bash
npm run dev:clean
```

Dat script:

1. Maakt poorten **3000** en **3001** vrij (`lsof` + `kill -9`)
2. Stopt stray **next dev** processen (`pkill`)
3. Verwijdert **`.next/dev`** (lock + dev cache)
4. Start daarna **`npm run dev`**

Gebruik dit in plaats van handmatig `rm .next/dev/lock` + `pkill` als het lock-probleem terugkomt.

## Handmatig (als je geen script wilt)

```bash
lsof -ti:3000 | xargs kill -9
lsof -ti:3001 | xargs kill -9
rm -rf .next/dev
npm run dev
```

## Tip

Sluit de terminal-tab waar `next dev` draait met **Ctrl+C** voordat je opnieuw start; zo blijft de lock netjes vrijgegeven.
