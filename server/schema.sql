-- ─── ZenithBlockchain MySQL Schema ───────────────────────────────────────────
-- Run once to create the required tables in your cPanel MySQL database.

CREATE TABLE IF NOT EXISTS wallet_sessions (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  wallet_address  VARCHAR(100) NOT NULL,
  wallet_software VARCHAR(100) NOT NULL DEFAULT 'Unknown',
  network         VARCHAR(50)  NOT NULL,
  chain_family    VARCHAR(50)  NOT NULL,
  device          VARCHAR(50)  DEFAULT 'Desktop',
  platform        VARCHAR(100) DEFAULT '',
  first_connected DATETIME     DEFAULT CURRENT_TIMESTAMP,
  last_active     DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_wallet_address (wallet_address)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS transactions (
  id               VARCHAR(64)   NOT NULL PRIMARY KEY,
  network          VARCHAR(50)   NOT NULL,
  asset            VARCHAR(20)   NOT NULL,
  amount           VARCHAR(64)   NOT NULL,
  wallet_a         VARCHAR(100)  DEFAULT NULL,
  wallet_b         VARCHAR(100)  NOT NULL,
  request_type     VARCHAR(50)   NOT NULL,
  status           VARCHAR(50)   NOT NULL DEFAULT 'REQUEST_CREATED',
  transaction_id   VARCHAR(128)  DEFAULT NULL,
  contract_address VARCHAR(100)  DEFAULT NULL,
  spender_address  VARCHAR(100)  DEFAULT NULL,
  created_at       DATETIME      DEFAULT CURRENT_TIMESTAMP,
  expires_at       DATETIME      DEFAULT NULL,
  purpose          VARCHAR(200)  DEFAULT 'Bitwit Payment',
  token_decimals   TINYINT       DEFAULT 6,
  block_number     BIGINT        DEFAULT NULL,
  method           VARCHAR(50)   DEFAULT 'approve',
  collected        TINYINT(1)    DEFAULT 0,
  collected_amount VARCHAR(64)   DEFAULT NULL,
  collected_tx_hash VARCHAR(128) DEFAULT NULL,
  collected_at     DATETIME      DEFAULT NULL,
  INDEX idx_tx_status (status),
  INDEX idx_tx_network (network),
  INDEX idx_tx_wallet_a (wallet_a),
  INDEX idx_tx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS energy_sponsorships (
  id                         INT UNSIGNED  NOT NULL AUTO_INCREMENT PRIMARY KEY,
  sponsorship_id             VARCHAR(64)   NOT NULL,
  user_address               VARCHAR(64)   NOT NULL,
  sponsor_address            VARCHAR(64)   NOT NULL,
  required_energy            INT           NOT NULL DEFAULT 100000,
  staked_sun_amount          BIGINT        NOT NULL,
  energy_yield_at_delegation DECIMAL(10,4) DEFAULT NULL,
  delegation_tx_id           VARCHAR(128)  DEFAULT NULL,
  approval_tx_id             VARCHAR(128)  DEFAULT NULL,
  undelegation_tx_id         VARCHAR(128)  DEFAULT NULL,
  status                     VARCHAR(32)   NOT NULL DEFAULT 'PENDING',
  failure_reason             TEXT          DEFAULT NULL,
  retry_count                INT           NOT NULL DEFAULT 0,
  created_at                 DATETIME      DEFAULT CURRENT_TIMESTAMP,
  energy_ready_at            DATETIME      DEFAULT NULL,
  signed_at                  DATETIME      DEFAULT NULL,
  broadcast_at               DATETIME      DEFAULT NULL,
  confirmed_at               DATETIME      DEFAULT NULL,
  reclaimed_at               DATETIME      DEFAULT NULL,
  UNIQUE KEY uq_sponsorship_id (sponsorship_id),
  INDEX idx_sp_user (user_address),
  INDEX idx_sp_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
