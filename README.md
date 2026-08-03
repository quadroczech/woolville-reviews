# Woolville Reviews — agregátor recenzí

Interní nástroj pro sběr a přehled zákaznických recenzí Woolville / Ovečkárna napříč všemi evropskými trhy a recenzními portály na jednom místě.

**Verze: 1.01** (2026-08-03)

## Co aplikace dělá

Aplikace stahuje recenze z jednotlivých recenzních portálů, párovala je (kde je to možné) s objednávkami a zobrazuje je v jednotném přehledu (`/`) s filtrováním podle statusu, platformy a země, dále v tabulkovém i kartovém zobrazení, s analytikou (`/analytics`) a přehledem podle trhů (`/markets`).

## Stav napojení jednotlivých portálů

| Portál | Stav | Poznámka |
|---|---|---|
| **Trusted Shops** (eTrusted) | ✅ Živé | OAuth2 client credentials, per-country kanály (DE, AT, CH, FR, IT, NL, BE). Data se tahají živě z API při každém requestu (`/api/reviews/live`, 15min cache). |
| **Heureka** CZ/SK | ⚠️ Živé, ale omezené | XML export přes secret key. Heurekin export vrací jen posledních cca 1000 recenzí na zemi — starší historie není dostupná přes tento kanál. |
| **Trustpilot** | ✅ Historie + webhook | Trustpilot API je jen na vyšším (placeném) plánu, který nepoužíváme. Historických **357 recenzí** (2015–dnes) bylo ručně vytaženo z Trustpilot business administrace a uloženo do souborového úložiště (`data/trustpilot-reviews.json`, viz níže). Nové recenze přibývají přes webhook (`/api/webhooks/trustpilot`), který ukládá do stejného úložiště. Webhook je funkční a otestovaný, ale zatím **není zaregistrovaná veřejná URL** u Trustpilotu (aplikace zatím neběží na veřejně dostupné doméně) — to je potřeba doplnit při nasazení. |
| **Zboží.cz / Firmy.cz** (e-mail/IMAP) | 🔴 Nenapojeno | Modul (`src/lib/platforms/email-reviews.ts`) existuje, ale nikde se nevolá a IMAP přihlašovací údaje v `.env.local` chybí. |
| **Google Business** | 🔴 Nenapojeno (experimentální) | Modul (`src/lib/platforms/google-business.ts`) existuje, ale nikde se nevolá a OAuth token chybí. |

## Persistence dat — důležité omezení

Hlavní databáze (Supabase) **není aktivní** — proměnné `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` jsou v `.env.local` zakomentované. To znamená:

- Trusted Shops a Heureka se tahají **živě** při každém requestu (nic se needukládá, jen krátkodobě cachuje 15 minut) — funguje to, ale je to závislé na dostupnosti externích API při každém načtení stránky.
- Trustpilot je jediný portál s trvalou perzistencí — přes vlastní souborový store (`src/lib/platforms/trustpilot-store.ts`), který přežije restart serveru.
- Endpoint `/api/reviews` (čtení ze Supabase tabulky `reviews`) a AI funkce (kategorizace, překlad, generování odpovědi — `/api/reviews/[id]/ai`) **nefungují**, dokud se Supabase neaktivuje.
- Až se Supabase zprovozní (stačí odkomentovat env proměnné a spustit `supabase/schema.sql` v Supabase SQL editoru — projekt i anon klíč už existují), doporučujeme migrovat i Trustpilot store do Supabase tabulky `reviews`.

## Spuštění lokálně

```bash
npm install
npm run dev
```

Aplikace poběží na `http://localhost:3000`. Proměnné prostředí viz `.env.local.example` / `.env.example`.

## Struktura projektu

```
src/app/(dashboard)/       # UI: přehled recenzí, analytika, trhy, nastavení
src/app/api/reviews/live   # živé sloučení Trusted Shops + Heureka + Trustpilot
src/app/api/reviews        # čtení/zápis recenzí ze Supabase (vyžaduje aktivní Supabase)
src/app/api/sync           # jednorázový/cron sync do Supabase (Trusted Shops, Trustpilot, Heureka)
src/app/api/cron           # endpoint pro plánovaný sync (chráněno CRON_SECRET)
src/app/api/webhooks/trustpilot  # příjem nových Trustpilot recenzí, ukládá do trustpilot-store
src/lib/platforms/          # konektory na jednotlivé portály (Trusted Shops, Trustpilot, Heureka, email, Google)
src/lib/platforms/trustpilot-store.ts  # souborová perzistence pro Trustpilot (data/trustpilot-reviews.json)
scripts/                    # jednorázové importní a exportní skripty (CSV exporty, Trustpilot historický import)
data/                       # lokální souborová data (gitignored — obsahuje osobní údaje zákazníků)
```

## Changelog

### 1.01 (2026-08-03)
- Dotažena kompletní historie Trustpilot recenzí (357 recenzí, 2015–dnes) ručním exportem z administrace, protože API je jen na placeném tieru.
- Přidáno souborové úložiště pro Trustpilot (`trustpilot-store.ts`), které nahrazuje dřívější dočasné ukládání recenzí z webhooku jen v paměti (mizelo při restartu serveru).
- Webhook (`/api/webhooks/trustpilot`) přepojen na trvalé úložiště a otestován end-to-end. Zbývá zaregistrovat veřejnou URL u Trustpilotu po nasazení.
