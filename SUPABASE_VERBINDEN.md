# App verbinden met het juiste Supabase-project

Als de app **andere locaties** toont dan in je Supabase (bijv. "MIMA Central" / "MIMA North" in plaats van "Mima Amsterdam"), praat de app met een **ander project**. Zo zet je het goed:

---

## Stap 1: In Supabase Dashboard – URL en key ophalen

1. Ga in je browser naar **https://supabase.com/dashboard** en log in.
2. Klik op het **project** waar je "Mima Amsterdam" ziet (Table Editor → locations).
3. Klik linksonder op het **tandwiel-icoon** (Settings).
4. Klik in het linkermenu op **"API"**.
5. Op die pagina zie je:
   - **Project URL** (bijv. `https://abcdefghijk.supabase.co`)
   - **Project API keys** → onder "anon" / "public" staat de **anon key** (een lange string).

Dit zijn de twee waarden die in je app moeten staan.

---

## Stap 2: In je project – .env.local aanpassen

1. Open je project in Cursor (map **mima-kitchen**).
2. Open in de **File Explorer** (linkerkant) het bestand **`.env.local`** in de **root** van het project (niet in een submap).  
   - Als je het niet ziet: het kan verborgen zijn. Via **Terminal** in Cursor: `open .env.local` of open het via **File → Open File** en typ `.env.local`.
3. Zet of controleer deze twee regels (vervang door jouw waarden van Stap 1):

   ```
   NEXT_PUBLIC_SUPABASE_URL=https://JOUW-PROJECT-REF.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6... (jouw anon key)
   ```

   - Geen aanhalingstekens om de waarden.
   - Geen spaties rond de `=`.

4. **Sla het bestand op** (Cmd+S).

---

## Stap 3: Dev server opnieuw starten

Next.js leest `.env.local` alleen bij het starten. Hard refreshen is niet genoeg.

1. Ga in Cursor naar de **Terminal** (onderaan).
2. Als daar `npm run dev` draait: stop die met **Ctrl+C**.
3. Start opnieuw:

   ```bash
   npm run dev
   ```

4. Wacht tot je "Ready" ziet.
5. Open in je browser opnieuw het **dashboard** (bijv. http://127.0.0.1:3000/dashboard) en ververs de pagina.

---

## Controleren

Op het dashboard staat nu o.a.:

- **"App verbonden met project: …"** → dat moet **hetzelfde** zijn als het project-ref in de URL van je Supabase Dashboard (bijv. `https://supabase.com/dashboard/project/abcdefghijk` → ref is `abcdefghijk`).
- **"Supabase: 1 locatie(s) geladen — Mima Amsterdam"** (of het aantal locaties dat in de tabel staat).

Als die project-ref klopt en je ziet nog steeds andere locaties, herstart dan nog eens de dev server en ververs de pagina.
