# Handoff — pokračování práce (např. z mobilu)

> Tento soubor slouží k navázání práce v nové Claude Code session (web / mobil).
> Historie chatu se nepřenáší — tady je shrnutý kontext, ať nemusíš začínat od nuly.
> Podrobný popis projektu je v [README.md](README.md).

**Poslední aktualizace:** 2026-08-04

## Kde jsme skončili

- Dokončena verze **1.02**: Zboží.cz a Firmy.cz jsou napojené na aplikaci (souborová perzistence, import historie, IMAP kanál pro nové recenze).
- Souborový store zobecněn z Trustpilotu na všechny platformy → `src/lib/platforms/review-store.ts`, soubory `data/{platforma}-reviews.json`.
- Přidán `scripts/import-review-history.mjs` (CSV i JSON) pro manuální import historie ze Zboží.cz / Firmy.cz.
- Přidán `POST /api/sync/email` (chráněno `CRON_SECRET`) pro stahování nových recenzí z notifikačních e-mailů.

## Jak navázat na mobilu

1. Otevři **claude.ai/code** (mobilní prohlížeč nebo Claude appka).
2. Propoj GitHub účet `quadroczech` a vyber repo **`woolville-reviews`**.
3. Řekni Claudovi: *„Přečti si HANDOFF.md a README.md a pokračujeme."*

## Důležitý kontext (detaily v README)

- **Supabase je vypnuté** (env proměnné zakomentované) → endpointy nad tabulkou `reviews` a AI funkce zatím nefungují.
- **Zboží API Seznam ukončil 16. 3. 2026** a data sjednotil do [Sklik API Fénix](https://api.sklik.cz/fenix/). Zboží.cz zároveň neposílá e-mailové notifikace o nových recenzích → dnes je jediná cesta manuální export z administrace.
- **Firmy.cz** nemá veřejné API; historie manuálně, nové recenze přes IMAP (pokud notifikace do mailboxu chodí).
- Trusted Shops a Heureka se tahají **živě** z API při každém requestu, cache 15 min.
- **Google Business** — modul existuje, ale není napojený.

## Co zbývá dodělat

- [ ] **Doplnit IMAP údaje** (`IMAP_HOST`, `IMAP_USER`, `IMAP_PASS`) do `.env.local` a otestovat `/api/sync/email`. Parsovací vzory v `src/lib/platforms/email-reviews.ts` byly napsané bez reálného vzorku e-mailu — podle pole `unparsed` v odpovědi je potřeba je doladit.
- [ ] **Naimportovat reálnou historii** ze Zboží.cz a Firmy.cz (`scripts/import-review-history.mjs`) — vyžaduje ruční export z administrací.
- [ ] **Napojit Sklik API Fénix** jako trvalý automatický kanál pro Zboží.cz (nahrazuje ukončené Zboží API). Potřeba API klíč ze správy klíčů v Skliku.
- [ ] Aktivovat Supabase (odkomentovat env + spustit `supabase/schema.sql`) a migrovat souborové úložiště do tabulky `reviews`.
- [ ] Zaregistrovat veřejnou webhook URL u Trustpilotu (po nasazení na veřejnou doménu).
- [ ] Vynutit autentizaci — bez Supabase je aplikace přístupná bez přihlášení a žádný middleware routy nechrání.

## Známá omezení nasazení

Souborový store (`data/`) **nepřežije** na serverless platformě s read-only/efemérním filesystémem (Netlify, Vercel). Před nasazením je potřeba buď aktivovat Supabase, nebo počítat s tím, že perzistence funguje jen na serveru s trvalým diskem.
