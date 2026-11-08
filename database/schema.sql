-- =====================================================================
-- SISTEMA LYLA - BASE DE DATOS MYSQL OFICIAL
-- Tienda de Moda y Accesorios (Santa Cruz de la Sierra, Bolivia)
-- Charset: utf8mb4_unicode_ci | Zona Horaria: America/La_Paz (UTC-4)
-- =====================================================================

CREATE DATABASE IF NOT EXISTS `sistema_lyla` 
  CHARACTER SET utf8mb4 
  COLLATE utf8mb4_unicode_ci;

USE `sistema_lyla`;

-- ---------------------------------------------------------------------
-- 1. TABLA: PRODUCTOS E INVENTARIO
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `products` (
  `id` VARCHAR(64) PRIMARY KEY,
  `code` VARCHAR(32) NOT NULL UNIQUE,
  `name` VARCHAR(150) NOT NULL,
  `category` ENUM('Carteras', 'Joyas', 'Relojes') NOT NULL,
  `color` VARCHAR(100) NOT NULL,
  `available_colors` JSON NULL,
  `color_stock` JSON NULL,
  `brand` VARCHAR(100) NOT NULL,
  `purchase_cost` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  `sale_price` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  `physical_stock` INT NOT NULL DEFAULT 0,
  `reserved_stock` INT NOT NULL DEFAULT 0,
  `stock` INT NOT NULL DEFAULT 0, -- Stock disponible = physical_stock - reserved_stock
  `image_url` TEXT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_products_category` (`category`),
  INDEX `idx_products_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 2. TABLA: VENTAS
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `sales` (
  `id` VARCHAR(64) PRIMARY KEY,
  `receipt_number` VARCHAR(32) NOT NULL UNIQUE,
  `subtotal` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  `discount` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  `total` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  `payment_method` ENUM('Efectivo', 'QR', 'Mixto') NOT NULL,
  `cash_amount` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  `qr_amount` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  `amount_received` DECIMAL(10, 2) NULL,
  `change_given` DECIMAL(10, 2) NULL,
  `total_cost_of_goods_sold` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  `status` ENUM('CONFIRMADA', 'EDITADA', 'ANULADA') NOT NULL DEFAULT 'CONFIRMADA',
  `cancellation_reason` TEXT NULL,
  `shift_closed_id` VARCHAR(64) NULL,
  `reservation_id` VARCHAR(64) NULL,
  `reservation_deposit_applied` DECIMAL(10, 2) NULL DEFAULT 0.00,
  `history` JSON NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_sales_receipt` (`receipt_number`),
  INDEX `idx_sales_status` (`status`),
  INDEX `idx_sales_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 3. TABLA: ITEMS DE VENTAS
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `sale_items` (
  `id` VARCHAR(64) PRIMARY KEY,
  `sale_id` VARCHAR(64) NOT NULL,
  `product_id` VARCHAR(64) NOT NULL,
  `code` VARCHAR(32) NOT NULL,
  `name` VARCHAR(150) NOT NULL,
  `category` ENUM('Carteras', 'Joyas', 'Relojes') NOT NULL,
  `selected_color` VARCHAR(50) NULL,
  `unit_price` DECIMAL(10, 2) NOT NULL,
  `quantity` INT NOT NULL,
  `subtotal` DECIMAL(10, 2) NOT NULL,
  `unit_purchase_cost` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  `total_purchase_cost` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  `image_url` TEXT NULL,
  INDEX `idx_sale_items_sale_id` (`sale_id`),
  INDEX `idx_sale_items_product_id` (`product_id`),
  CONSTRAINT `fk_sale_items_sale` FOREIGN KEY (`sale_id`) REFERENCES `sales` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 4. TABLA: RESERVAS Y APARTADOS (168 HORAS / 7 DÍAS)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `reservations` (
  `id` VARCHAR(64) PRIMARY KEY,
  `reservation_number` VARCHAR(32) NOT NULL UNIQUE,
  `customer_name` VARCHAR(150) NOT NULL,
  `customer_phone` VARCHAR(50) NULL,
  `customer_social_user` VARCHAR(100) NULL,
  `channel` VARCHAR(50) NOT NULL DEFAULT 'Live TikTok',
  `total_amount` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  `deposit_amount` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  `deposit_payment_method` ENUM('Efectivo', 'QR') NOT NULL,
  `remaining_balance` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  `status` ENUM('PENDIENTE', 'COMPLETADA', 'CANCELADA', 'VENCIDA') NOT NULL DEFAULT 'PENDIENTE',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `expires_at` DATETIME NOT NULL,
  `expiration_date` DATE NOT NULL,
  `completed_at` DATETIME NULL,
  `completed_sale_id` VARCHAR(64) NULL,
  `completion_payment_method` ENUM('Efectivo', 'QR', 'Mixto') NULL,
  `completion_cash_amount` DECIMAL(10, 2) NULL,
  `completion_qr_amount` DECIMAL(10, 2) NULL,
  `cancelled_at` DATETIME NULL,
  `cancellation_reason` TEXT NULL,
  `responsible` VARCHAR(100) NULL,
  `retained_deposit` DECIMAL(10, 2) NULL DEFAULT 0.00,
  `notes` TEXT NULL,
  INDEX `idx_res_status` (`status`),
  INDEX `idx_res_expires_at` (`expires_at`),
  INDEX `idx_res_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 5. TABLA: ITEMS DE RESERVAS
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `reservation_items` (
  `id` VARCHAR(64) PRIMARY KEY,
  `reservation_id` VARCHAR(64) NOT NULL,
  `product_id` VARCHAR(64) NOT NULL,
  `code` VARCHAR(32) NOT NULL,
  `name` VARCHAR(150) NOT NULL,
  `category` ENUM('Carteras', 'Joyas', 'Relojes') NOT NULL,
  `selected_color` VARCHAR(50) NULL,
  `unit_price` DECIMAL(10, 2) NOT NULL,
  `quantity` INT NOT NULL,
  `subtotal` DECIMAL(10, 2) NOT NULL,
  `unit_purchase_cost` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  `image_url` TEXT NULL,
  INDEX `idx_res_items_res_id` (`reservation_id`),
  CONSTRAINT `fk_res_items_reservation` FOREIGN KEY (`reservation_id`) REFERENCES `reservations` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 6. TABLA: COMPRAS DE INVENTARIO (COSTO PROMEDIO PONDERADO)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `inventory_purchases` (
  `id` VARCHAR(64) PRIMARY KEY,
  `purchase_number` VARCHAR(32) NOT NULL UNIQUE,
  `supplier` VARCHAR(150) NOT NULL,
  `date` DATE NOT NULL,
  `product_id` VARCHAR(64) NOT NULL,
  `product_code` VARCHAR(32) NOT NULL,
  `product_name` VARCHAR(150) NOT NULL,
  `category` ENUM('Carteras', 'Joyas', 'Relojes') NOT NULL,
  `quantity` INT NOT NULL,
  `unit_cost` DECIMAL(10, 2) NOT NULL,
  `total` DECIMAL(10, 2) NOT NULL,
  `is_new_product` BOOLEAN NOT NULL DEFAULT FALSE,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_purchases_date` (`date`),
  INDEX `idx_purchases_product` (`product_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 7. TABLA: GASTOS OPERATIVOS
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `expenses` (
  `id` VARCHAR(64) PRIMARY KEY,
  `category` VARCHAR(100) NOT NULL,
  `description` TEXT NOT NULL,
  `amount` DECIMAL(10, 2) NOT NULL,
  `payment_method` ENUM('Efectivo', 'QR', 'Mixto') NOT NULL,
  `responsible` VARCHAR(100) NOT NULL,
  `date` DATETIME NOT NULL,
  `shift_closed_id` VARCHAR(64) NULL,
  INDEX `idx_expenses_date` (`date`),
  INDEX `idx_expenses_category` (`category`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 8. TABLA: APERTURAS DE JORNADA (CAJA CHICA)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `shift_openings` (
  `id` VARCHAR(64) PRIMARY KEY,
  `date` DATE NOT NULL UNIQUE,
  `opened_at` DATETIME NOT NULL,
  `opened_by` VARCHAR(100) NOT NULL,
  `initial_cash` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  `initial_qr` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  `total_initial` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  `notes` TEXT NULL,
  INDEX `idx_openings_date` (`date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 9. TABLA: CIERRES DE JORNADA (ARQUEO Y AUDITORÍA)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `shift_closes` (
  `id` VARCHAR(64) PRIMARY KEY,
  `date` DATE NOT NULL,
  `opened_at` DATETIME NULL,
  `opened_by` VARCHAR(100) NULL,
  `closed_at` DATETIME NOT NULL,
  `closed_by` VARCHAR(100) NOT NULL,
  `initial_cash` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  `initial_qr` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  `total_initial` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  `total_sales` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  `cash_sales` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  `qr_sales` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  `sales_count` INT NOT NULL DEFAULT 0,
  `total_discounts` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  `total_expenses` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  `cash_expenses` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  `qr_expenses` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  `expenses_by_category` JSON NULL,
  `expenses_summary` JSON NULL,
  `operational_flow` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  `final_expected_cash` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  `final_expected_qr` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  `real_cash_counted` DECIMAL(10, 2) NULL,
  `real_qr_verified` DECIMAL(10, 2) NULL,
  `cash_difference` DECIMAL(10, 2) NULL,
  `qr_difference` DECIMAL(10, 2) NULL,
  `difference_reason` TEXT NULL,
  `is_reopened` BOOLEAN NOT NULL DEFAULT FALSE,
  `reopened_at` DATETIME NULL,
  `reopened_by` VARCHAR(100) NULL,
  `reopen_reason` TEXT NULL,
  `notes` TEXT NULL,
  INDEX `idx_shifts_date` (`date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 10. TABLA: REGISTRO DE AUDITORÍA Y TRAZABILIDAD
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `audit_logs` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `entity_type` VARCHAR(50) NOT NULL,
  `entity_id` VARCHAR(64) NOT NULL,
  `action` VARCHAR(50) NOT NULL,
  `details` JSON NULL,
  `user` VARCHAR(100) NOT NULL,
  `timestamp` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_audit_entity` (`entity_type`, `entity_id`),
  INDEX `idx_audit_timestamp` (`timestamp`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
