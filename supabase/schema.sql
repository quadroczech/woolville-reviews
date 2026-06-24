-- Woolville Review Aggregator — Database Schema
-- Execute this in Supabase SQL Editor

-- Table: orders (Mocked data from current e-shop / Future Shopify Plus)
CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  external_order_id VARCHAR(255) UNIQUE NOT NULL,
  customer_email VARCHAR(255),
  customer_name VARCHAR(255),
  shipping_country VARCHAR(2),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table: reviews
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
  response_draft TEXT,
  status VARCHAR(50) DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  replied_at TIMESTAMPTZ
);
