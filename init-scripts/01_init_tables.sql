-- init-scripts/01_init_tables.sql

-- Create tables for main entities
CREATE TABLE markets (
    id VARCHAR(255) PRIMARY KEY,
    address VARCHAR(255) UNIQUE NOT NULL,
    total_liquidity DECIMAL(36,18) NOT NULL DEFAULT 0,
    total_borrowed DECIMAL(36,18) NOT NULL DEFAULT 0,
    utilization_rate DECIMAL(7,4) NOT NULL DEFAULT 0,
    last_update TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ipfs_hash VARCHAR(255)
);

CREATE TABLE users (
    id VARCHAR(255) PRIMARY KEY,
    address VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE positions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(255) REFERENCES users(id),
    market_id VARCHAR(255) REFERENCES markets(id),
    deposit_amount DECIMAL(36,18) NOT NULL DEFAULT 0,
    borrow_amount DECIMAL(36,18) NOT NULL DEFAULT 0,
    health_factor DECIMAL(7,4) NOT NULL DEFAULT 0,
    liquidation_risk DECIMAL(7,4) NOT NULL DEFAULT 0,
    last_update TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE risk_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(255) REFERENCES users(id),
    market_id VARCHAR(255) REFERENCES markets(id),
    health_factor DECIMAL(7,4) NOT NULL,
    liquidation_risk DECIMAL(7,4) NOT NULL,
    timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better query performance
CREATE INDEX idx_markets_address ON markets(address);
CREATE INDEX idx_users_address ON users(address);
CREATE INDEX idx_positions_user_market ON positions(user_id, market_id);
CREATE INDEX idx_risk_metrics_user ON risk_metrics(user_id);

-- Insert some test data
INSERT INTO markets (id, address, total_liquidity, total_borrowed, utilization_rate) VALUES
('mainnet_eth', '0x1234567890123456789012345678901234567890', 1000.0, 500.0, 50.0),
('mainnet_usdc', '0x2345678901234567890123456789012345678901', 2000.0, 1000.0, 50.0);

-- Insert test users
INSERT INTO users (id, address) VALUES
('user1', '0x3456789012345678901234567890123456789012'),
('user2', '0x4567890123456789012345678901234567890123');

-- Insert test positions
INSERT INTO positions (user_id, market_id, deposit_amount, borrow_amount, health_factor, liquidation_risk) VALUES
('user1', 'mainnet_eth', 100.0, 50.0, 2.0, 0.0),
('user2', 'mainnet_eth', 200.0, 100.0, 1.8, 10.0);

-- Insert test risk metrics
INSERT INTO risk_metrics (user_id, market_id, health_factor, liquidation_risk) VALUES
('user1', 'mainnet_eth', 2.0, 0.0),
('user2', 'mainnet_eth', 1.8, 10.0);