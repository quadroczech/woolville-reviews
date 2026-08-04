# Woolville Reviews — agregátor recenzí

Interní nástroj pro sběr a přehled zákaznických recenzí Woolville / Ovečkárna napříč všemi evropskými trhy a recenzními portály na jednom místě.

**Verze: 1.02** (2026-08-04)

## Co aplikace dělá

Aplikace stahuje recenze z jednotlivých recenzních portálů, párovala je (kde je to možné) s objednávkami a zobrazuje je v jednotném přehledu (`/`) s filtrováním podle statusu, platformy a země, dále v tabulkovém i kartovém zobrazení, s analytikou (`/analytics`) a přehledem podle trhů (`/markets`).

## Stav napojení jednotlivých portálů

| Portál | Stav | Poznámka |
|---|---|---|
| **Trusted Shops** (eTrusted) | ✅ Živé | OAuth2 client credentials, per-country kanály (DE, AT, CH, FR, IT, NL, BE). Data se tahají živě z API při každém requestu (`/api/reviews/live`, 15min cache). |
| **Heureka** CZ/SK | ⚠️ Živé, ale omezené | XML export přes secret key. Heurekin export vrací jen posledních cca 1000 recenzí na zemi — starší historie není dostupná přes tento kanál. |
| **Trustpilot** | ✅ Historie + webhook | Trustpilot API je jen na vyšším (placeném) plánu, který nepoužíváme. Historických **357 recenzí** (2015–dnes) bylo ručně vytaženo z Trustpilot business administrace a uloženo do souborového úložiště (`data/trustpilot-reviews.json`, viz níže). Nové recenze přibývají přes webhook (`/api/webhooks/trustpilot`), který ukládá do stejného úložiště. Webhook je funkční a otestovaný, ale zatím **není zaregistrovaná veřejná URL** u Trustpilotu (aplikace zatím neběží na veřejně dostupné doméně) — to je potřeba doplnit při nasazení. |
| **Zboží.cz** | ⚠️ Manuální import | **Zboží API Seznam ukončil 16. 3. 2026** a data sjednotil do [Sklik API Fénix](https://api.sklik.cz/fenix/) — samostatné Zboží API už neexistuje. Zboží.cz navíc na novou recenzi neposílá e-mailovou notifikaci. Historie i nové recenze se proto zatím dostávají do aplikace **manuálním exportem z administrace** přes `scripts/import-review-history.mjs` (viz níže). Trvalý automatický kanál = napojit Sklik API Fénix. |
| **Firmy.cz** | ⚠️ Manuální import + IMAP | Firmy.cz nemá veřejné API pro export recenzí. Historie se importuje manuálně (`scripts/import-review-history.mjs`), nové recenze umí stahovat IMAP kanál (`/api/sync/email`), pokud do sledovaného mailboxu chodí notifikace o nových recenzích. |
| **Google Business** | 🔴 Nenapojeno (experimentální) | Modul (`src/lib/platforms/google-business.ts`) existuje, ale nikde se nevolá a OAuth token chybí. |

## Import historie recenzí (Zboží.cz, Firmy.cz)

Ani Zboží.cz, ani Firmy.cz nenabízí použitelné API pro export recenzí, takže historie se — stejně jako u Trustpilotu — vytahuje ručně z administrace a importuje skriptem:

```bash
node scripts/import-review-history.mjs zbozi ./export-zbozi.csv
node scripts/import-review-history.mjs firmy ./export-firmy.json
```

- Vstup může být **CSV** (s hlavičkou, oddělovač `,` nebo `;`) nebo **JSON** (pole objektů).
- Skript rozpozná běžné české i anglické názvy sloupců (`hodnoceni`/`rating`, `datum`/`date`, `co_se_mi_libilo`/`pros`, `cislo_objednavky`/`order_id`, …) — kompletní seznam je v komentáři na začátku skriptu.
- Hodnocení na stupnici 0–100 se přepočítá na 1–5. Řádky bez čitelného hodnocení nebo datumu se **přeskočí a vypíšou** — skript nikdy nedoplňuje chybějící hodnocení odhadem, aby nezkresloval průměry.
- Data se ukládají do `data/{zbozi,firmy}-reviews.json` a rovnou se objeví v přehledu, analytice i přehledu trhů. Opakovaný import je bezpečný — recenze se páruje podle ID a přepisuje se.

## Zboží.cz — cesta k automatickému kanálu (Sklik API Fénix)

Zboží API bylo ukončeno 16. 3. 2026 a nahrazeno [Sklik API Fénix](https://api.sklik.cz/fenix/). API klíč se vytváří v Skliku: **Nastavení účtu → Správa klíčů API Fénix** (přístup má jen vlastník účtu, tedy e-mail, na který je reklamní účet založený). Klíči stačí oprávnění na **čtení** a hodnota se zobrazí jen jednou.

Přesné cesty endpointů pro hodnocení a recenze nejsou veřejně zdokumentované, takže před napsáním konektoru je potřeba je zjistit:

```bash
SKLIK_API_KEY=<fenix-api-key> node scripts/sklik-fenix-discover.mjs
```

Skript vymění klíč (refresh token) za access token, najde OpenAPI spec a vypíše endpointy související s hodnocením/recenzemi. Výsledek uloží do `sklik-fenix-discovery.json` — soubor obsahuje jen metadata endpointů, **žádné tokeny**.

## Nové recenze přes e-mail (IMAP)

Endpoint `POST /api/sync/email` (chráněný `CRON_SECRET`) přečte notifikační e-maily z INBOXu, zparsuje z nich recenze a uloží je do stejného úložiště:

```bash
curl -X POST http://localhost:3000/api/sync/email \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"sources":["firmy"]}'
```

Stahuje se inkrementálně od data nejnovější uložené recenze. E-maily, ze kterých se nepodařilo přečíst hodnocení, se **neukládají** — vrátí se v odpovědi v poli `unparsed`, aby se podle skutečné podoby e-mailu doladily parsovací vzory v `src/lib/platforms/email-reviews.ts`.

## Persistence dat — důležité omezení

Hlavní databáze (Supabase) **není aktivní** — proměnné `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` jsou v `.env.local` zakomentované. To znamená:

- Trusted Shops a Heureka se tahají **živě** při každém requestu (nic se needukládá, jen krátkodobě cachuje 15 minut) — funguje to, ale je to závislé na dostupnosti externích API při každém načtení stránky.
- Trustpilot, Zboží.cz a Firmy.cz mají trvalou perzistenci — přes souborový store (`src/lib/platforms/review-store.ts`, soubory `data/{platforma}-reviews.json`), který přežije restart serveru.
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
src/app/api/sync/email     # stažení nových recenzí z notifikačních e-mailů (IMAP)
src/app/api/webhooks/trustpilot  # příjem nových Trustpilot recenzí, ukládá do review-store
src/lib/platforms/          # konektory na jednotlivé portály (Trusted Shops, Trustpilot, Heureka, email, Google)
src/lib/platforms/review-store.ts  # souborová perzistence per platforma (data/{platforma}-reviews.json)
scripts/                    # jednorázové importní a exportní skripty (CSV exporty, historické importy recenzí)
data/                       # lokální souborová data (gitignored — obsahuje osobní údaje zákazníků)
```

## Changelog

### 1.02 (2026-08-04)
- Souborové úložiště zobecněno z Trustpilotu na libovolnou platformu (`review-store.ts`), takže Zboží.cz a Firmy.cz mají stejnou trvalou perzistenci.
- Přidán import skript pro manuální export historie recenzí ze Zboží.cz a Firmy.cz (`scripts/import-review-history.mjs`, CSV i JSON).
- Napojen IMAP kanál pro nové recenze (`POST /api/sync/email`) — dosud existující modul se nikde nevolal.
- Zboží.cz a Firmy.cz recenze se zobrazují v přehledu, analytice i přehledu trhů (`/api/reviews/live`).
- Zdokumentováno, že **Zboží API bylo 16. 3. 2026 ukončeno** a nahrazeno Sklik API Fénix.

### 1.01 (2026-08-03)
- Dotažena kompletní historie Trustpilot recenzí (357 recenzí, 2015–dnes) ručním exportem z administrace, protože API je jen na placeném tieru.
- Přidáno souborové úložiště pro Trustpilot (`trustpilot-store.ts`), které nahrazuje dřívější dočasné ukládání recenzí z webhooku jen v paměti (mizelo při restartu serveru).
- Webhook (`/api/webhooks/trustpilot`) přepojen na trvalé úložiště a otestován end-to-end. Zbývá zaregistrovat veřejnou URL u Trustpilotu po nasazení.
