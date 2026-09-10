-- Woolville Review Aggregator — Database Schema
-- Execute this in Supabase SQL Editor

-- Table: orders (synced from the WPJ e-shop backend, see src/lib/platforms/wpj.ts)
CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  external_order_id VARCHAR(255) UNIQUE NOT NULL,
  customer_email VARCHAR(255),
  customer_name VARCHAR(255),
  shipping_country VARCHAR(2),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table: reviews (shop-level reviews: Trustpilot, Trusted Shops, Heureka shop rating,
-- Zbozi.cz shop rating via Sklik Fenix, Firmy.cz — about the shopping experience as a
-- whole: delivery, communication, the shop itself. See product_reviews for per-product
-- reviews about the goods themselves.)
CREATE TABLE reviews (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  platform_source VARCHAR(50) NOT NULL,
  external_review_id VARCHAR(255) UNIQUE NOT NULL,
  country_code VARCHAR(2) NOT NULL,
  rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
  review_text TEXT,
  review_text_cz TEXT,
  customer_name_extracted VARCHAR(255),
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  match_confidence VARCHAR(50) DEFAULT 'unverified',
  ai_category VARCHAR(50),
  ai_sentiment VARCHAR(20),
  ai_pain_points TEXT[],
  response_draft TEXT,
  -- Deep link to this specific review on the source platform, for the manual
  -- copy-paste reply flow on platforms with no reply API (Heureka, Firmy.cz, and
  -- Trustpilot unless/until the paid Business API is available).
  platform_review_url TEXT,
  status VARCHAR(50) DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  replied_at TIMESTAMPTZ
);

-- Table: products (mirrored from WPJ's product catalog — cached locally for fast joins
-- and so a review's product name/producer/section survive a WPJ-side rename or removal)
CREATE TABLE products (
  id INT PRIMARY KEY, -- WPJ's own product id, reused as-is
  code VARCHAR(100),
  ean VARCHAR(20),
  title VARCHAR(500) NOT NULL,
  producer_name VARCHAR(255),
  section_name VARCHAR(255),
  synced_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table: product_reviews (per-product reviews synced from WPJ's `reviews` GraphQL query,
-- which already aggregates Heureka CZ/SK, Arukereso HU, Compari RO, and Zbozi.cz product
-- reviews with productId/orderId already resolved — no fuzzy matching needed here).
CREATE TABLE product_reviews (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  wpj_review_id INT UNIQUE NOT NULL,
  product_id INT REFERENCES products(id) ON DELETE SET NULL,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  source VARCHAR(50) NOT NULL, -- HEUREKA_CZ, HEUREKA_SK, ARUKRESO_HU, COMPARI_RO, ZBOZI_CZ
  country_code VARCHAR(2) NOT NULL,
  rating NUMERIC(2, 1) NOT NULL,
  recommends BOOLEAN,
  pros TEXT,
  cons TEXT,
  summary TEXT,
  reviewer_name VARCHAR(255),
  language_code VARCHAR(5),
  -- Existing shop response already recorded in WPJ, mirrored read-only — WPJ's GraphQL
  -- API has no reply mutation, so a new reply still has to be sent on the source
  -- platform (or through WPJ's own admin) and re-synced, not sent from this app.
  shop_response TEXT,
  shop_response_at TIMESTAMPTZ,
  ai_category VARCHAR(50),
  ai_sentiment VARCHAR(20),
  ai_pain_points TEXT[],
  status VARCHAR(50) DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL,
  synced_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table: country_action_items (output of the batch AI run: recurring, actionable
-- problems grouped per country, not one entry per review)
CREATE TABLE country_action_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  country_code VARCHAR(2) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  severity VARCHAR(20) NOT NULL DEFAULT 'medium', -- low | medium | high
  category VARCHAR(50), -- product | logistics | web | service | mixed
  related_product_id INT REFERENCES products(id) ON DELETE SET NULL,
  -- Mixed-table references (reviews.id and/or product_reviews.id), so a plain FK
  -- array isn't possible; kept as text and resolved in application code.
  source_review_ids TEXT[] NOT NULL DEFAULT '{}',
  status VARCHAR(20) NOT NULL DEFAULT 'open', -- open | done
  created_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

-- Table: review_reply_log (audit trail for both automatic and manual replies)
CREATE TABLE review_reply_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  review_table VARCHAR(20) NOT NULL, -- 'reviews' | 'product_reviews'
  review_id UUID NOT NULL,
  sent_via VARCHAR(20) NOT NULL, -- 'api' | 'manual'
  reply_text TEXT NOT NULL,
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  sent_by VARCHAR(255)
);
