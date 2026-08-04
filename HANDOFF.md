# Handoff — pokračování práce (např. z mobilu)

> Tento soubor slouží k navázání práce v nové Claude Code session (web / mobil).
> Historie chatu se nepřenáší — tady je shrnutý kontext, ať nemusíš začínat od nuly.
> Podrobný popis projektu je v [README.md](README.md).

**Poslední aktualizace:** 2026-08-04

## Kde jsme skončili

- Repo je čisté, `master` synchronizované s `origin/master` (poslední commit: *Add per-country period comparison and visual rating bars*).
- Aplikace ověřeně **běží lokálně** (`npm run dev` → http://localhost:3000, HTTP 200, Next.js 16.2.6 / Turbopack).
- Závislosti nainstalované, `.env.local` existuje.
- **Žádná rozpracovaná změna** — čistý start pro další úkol.

## Jak navázat na mobilu

1. Otevři **claude.ai/code** (mobilní prohlížeč nebo Claude appka).
2. Propoj GitHub účet `quadroczech` a vyber repo **`woolville-reviews`**.
3. Řekni Claudovi: *„Přečti si HANDOFF.md a README.md a pokračujeme."*

## Důležitý kontext (detaily v README)

- **Supabase je vypnuté** (env proměnné zakomentované) → endpointy nad tabulkou `reviews` a AI funkce zatím nefungují.
- Data se tahají **živě** z API (Trusted Shops, Heureka) při každém requestu, cache 15 min.
- **Trustpilot** je jediný s trvalou perzistencí (souborový store), webhook funkční, ale bez zaregistrované veřejné URL.
- **Zboží.cz/Firmy.cz** a **Google Business** — moduly existují, ale nejsou napojené.

## Možné další kroky (nezávazný seznam)

- [ ] Aktivovat Supabase (odkomentovat env + spustit `supabase/schema.sql`).
- [ ] Zaregistrovat veřejnou webhook URL u Trustpilotu (po nasazení na veřejnou doménu).
- [ ] Napojit e-mailový (IMAP) kanál pro Zboží.cz / Firmy.cz.
