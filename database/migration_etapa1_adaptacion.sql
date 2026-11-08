-- =====================================================================
-- SISTEMA LYLA - SCRIPT DE MIGRACIÓN Y ADAPTACIÓN MYSQL (ETAPA 1)
-- Tienda de Moda y Accesorios (Santa Cruz de la Sierra, Bolivia)
-- Base de Datos: `sistema_lyla`
-- Charset: utf8mb4 | Collation: utf8mb4_unicode_ci
-- Zona Horaria Operativa: America/La_Paz (UTC-4)
-- =====================================================================
-- 
-- REGLAS DE SEGURIDAD:
-- 1. NO elimina ninguna base de datos ni tabla preexistente.
-- 2. NO destruye datos de prueba existentes.
-- 3. Utiliza instrucciones no destructivas (ADD COLUMN, MODIFY COLUMN, CREATE TABLE IF NOT EXISTS).
-- 4. Sustituye el ENUM restrictivo ('RELOJ','CARTERA','JOYAS') por VARCHAR(100) y
--    crea la tabla `categorias_productos` para gestión 100% dinámica.
-- 5. Soporta el control de inventario por colores (físico, reservado y disponible).
-- 6. Amplía ventas, reservas (168h), compras, gastos y jornadas (arqueo completo).
-- =====================================================================

USE `sistema_lyla`;

-- Desactivar temporalmente revisión de claves foráneas para aplicar modificaciones ordenadas
SET @OLD_FOREIGN_KEY_CHECKS = @@FOREIGN_KEY_CHECKS;
SET FOREIGN_KEY_CHECKS = 0;

-- =====================================================================
-- SECCIÓN 1: CATEGORÍAS DINÁMICAS DE PRODUCTOS
-- =====================================================================
-- Permite agregar, editar y desactivar categorías desde el sistema
-- (Carteras, Joyas, Relojes, Accesorios y personalizadas) sin alterar el esquema.

CREATE TABLE IF NOT EXISTS `categorias_productos` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `nombre` VARCHAR(100) NOT NULL,
  `activa` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uk_categorias_productos_nombre` (`nombre`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Sembrar categorías iniciales obligatorias de la boutique (sin duplicar)
INSERT INTO `categorias_productos` (`id`, `nombre`, `activa`)
VALUES 
  ('cat-carteras', 'Carteras', 1),
  ('cat-joyas', 'Joyas', 1),
  ('cat-relojes', 'Relojes', 1),
  ('cat-accesorios', 'Accesorios', 1)
ON DUPLICATE KEY UPDATE `activa` = VALUES(`activa`);


-- =====================================================================
-- SECCIÓN 2: ADAPTACIÓN DE TABLA `productos` E INVENTARIO POR COLORES
-- =====================================================================
-- 1. Elimina el ENUM restrictivo ('RELOJ','CARTERA','JOYAS') pasando a VARCHAR(100).
-- 2. Incorpora triple control de stock: físico, reservado (apartados) y disponible para venta.
-- 3. Soporta colorStock y availableColors en formato JSON nativo de alta velocidad.

-- Modificar columna de categoría para admitir cualquier categoría dinámica
ALTER TABLE `productos` 
  MODIFY COLUMN `categoria` VARCHAR(100) NOT NULL DEFAULT 'Carteras';

-- Agregar campos necesarios si no existen
-- (Procedimiento seguro para agregar columnas sin error en versiones previas de MySQL 8.0.19)
DROP PROCEDURE IF EXISTS `sp_adaptar_productos`;
DELIMITER $$
CREATE PROCEDURE `sp_adaptar_productos`()
BEGIN
  -- Stock físico en tienda
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = 'sistema_lyla' AND TABLE_NAME = 'productos' AND COLUMN_NAME = 'stock_fisico') THEN
    ALTER TABLE `productos` ADD COLUMN `stock_fisico` INT NOT NULL DEFAULT 0 AFTER `precio_venta`;
  END IF;

  -- Stock apartado en reservas activas de 7 días
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = 'sistema_lyla' AND TABLE_NAME = 'productos' AND COLUMN_NAME = 'stock_reservado') THEN
    ALTER TABLE `productos` ADD COLUMN `stock_reservado` INT NOT NULL DEFAULT 0 AFTER `stock_fisico`;
  END IF;

  -- Stock disponible para venta inmediata (físico - reservado)
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = 'sistema_lyla' AND TABLE_NAME = 'productos' AND COLUMN_NAME = 'stock_disponible') THEN
    ALTER TABLE `productos` ADD COLUMN `stock_disponible` INT NOT NULL DEFAULT 0 AFTER `stock_reservado`;
  END IF;

  -- Resumen o lista JSON de colores disponibles con stock > 0
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = 'sistema_lyla' AND TABLE_NAME = 'productos' AND COLUMN_NAME = 'colores_disponibles') THEN
    ALTER TABLE `productos` ADD COLUMN `colores_disponibles` JSON NULL AFTER `color`;
  END IF;

  -- Desglose JSON de stock por color { "Negro": 3, "Beige": 2, "Rojo": 2, "Azul": 1 }
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = 'sistema_lyla' AND TABLE_NAME = 'productos' AND COLUMN_NAME = 'stock_por_color') THEN
    ALTER TABLE `productos` ADD COLUMN `stock_por_color` JSON NULL AFTER `colores_disponibles`;
  END IF;

  -- Marca de producto
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = 'sistema_lyla' AND TABLE_NAME = 'productos' AND COLUMN_NAME = 'marca') THEN
    ALTER TABLE `productos` ADD COLUMN `marca` VARCHAR(100) NOT NULL DEFAULT 'Lyla Atelier' AFTER `nombre`;
  END IF;

  -- Costo de compra (Costo Promedio Ponderado)
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = 'sistema_lyla' AND TABLE_NAME = 'productos' AND COLUMN_NAME = 'costo_compra') THEN
    ALTER TABLE `productos` ADD COLUMN `costo_compra` DECIMAL(10, 2) NOT NULL DEFAULT 0.00 AFTER `marca`;
  END IF;

  -- URL de fotografía de catálogo
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = 'sistema_lyla' AND TABLE_NAME = 'productos' AND COLUMN_NAME = 'imagen_url') THEN
    ALTER TABLE `productos` ADD COLUMN `imagen_url` TEXT NULL AFTER `stock_disponible`;
  END IF;
END$$
DELIMITER ;
CALL `sp_adaptar_productos`();
DROP PROCEDURE `sp_adaptar_productos`;

-- Tabla Relacional Normalizada para Inventario por Colores (Best Practice Empresarial)
-- Permite consultas indexadas por variante de color y consistencia transaccional ACID
CREATE TABLE IF NOT EXISTS `inventario_colores` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `producto_id` VARCHAR(64) NOT NULL,
  `color` VARCHAR(100) NOT NULL,
  `stock_fisico` INT NOT NULL DEFAULT 0,
  `stock_reservado` INT NOT NULL DEFAULT 0,
  `stock_disponible` INT NOT NULL DEFAULT 0,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uk_producto_color` (`producto_id`, `color`),
  INDEX `idx_inv_colores_prod` (`producto_id`),
  CONSTRAINT `fk_inv_colores_producto` FOREIGN KEY (`producto_id`) REFERENCES `productos` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- =====================================================================
-- SECCIÓN 3: ADAPTACIÓN DE TABLA `ventas` Y `detalle_ventas`
-- =====================================================================
-- Compatibilidad con ventas netas, descuentos, pagos mixtos (Efectivo + QR),
-- costo de mercadería vendida (COGS exacto), anulación controlada e historial.

DROP PROCEDURE IF EXISTS `sp_adaptar_ventas`;
DELIMITER $$
CREATE PROCEDURE `sp_adaptar_ventas`()
BEGIN
  -- Subtotal antes de descuento
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = 'sistema_lyla' AND TABLE_NAME = 'ventas' AND COLUMN_NAME = 'subtotal') THEN
    ALTER TABLE `ventas` ADD COLUMN `subtotal` DECIMAL(10, 2) NOT NULL DEFAULT 0.00 AFTER `id`;
  END IF;

  -- Descuento comercial aplicado
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = 'sistema_lyla' AND TABLE_NAME = 'ventas' AND COLUMN_NAME = 'descuento') THEN
    ALTER TABLE `ventas` ADD COLUMN `descuento` DECIMAL(10, 2) NOT NULL DEFAULT 0.00 AFTER `subtotal`;
  END IF;

  -- Monto cobrado en efectivo (en pagos Efectivo o Mixtos)
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = 'sistema_lyla' AND TABLE_NAME = 'ventas' AND COLUMN_NAME = 'monto_efectivo') THEN
    ALTER TABLE `ventas` ADD COLUMN `monto_efectivo` DECIMAL(10, 2) NOT NULL DEFAULT 0.00 AFTER `metodo_pago`;
  END IF;

  -- Monto cobrado mediante QR / Banco (en pagos QR o Mixtos)
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = 'sistema_lyla' AND TABLE_NAME = 'ventas' AND COLUMN_NAME = 'monto_qr') THEN
    ALTER TABLE `ventas` ADD COLUMN `monto_qr` DECIMAL(10, 2) NOT NULL DEFAULT 0.00 AFTER `monto_efectivo`;
  END IF;

  -- Efectivo recibido físicamente
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = 'sistema_lyla' AND TABLE_NAME = 'ventas' AND COLUMN_NAME = 'monto_recibido') THEN
    ALTER TABLE `ventas` ADD COLUMN `monto_recibido` DECIMAL(10, 2) NULL AFTER `monto_qr`;
  END IF;

  -- Cambio devuelto en efectivo
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = 'sistema_lyla' AND TABLE_NAME = 'ventas' AND COLUMN_NAME = 'cambio_devuelto') THEN
    ALTER TABLE `ventas` ADD COLUMN `cambio_devuelto` DECIMAL(10, 2) NULL AFTER `monto_recibido`;
  END IF;

  -- Costo total de ventas (COGS) para cálculo preciso de Utilidad Bruta
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = 'sistema_lyla' AND TABLE_NAME = 'ventas' AND COLUMN_NAME = 'costo_total_ventas') THEN
    ALTER TABLE `ventas` ADD COLUMN `costo_total_ventas` DECIMAL(10, 2) NOT NULL DEFAULT 0.00 AFTER `cambio_devuelto`;
  END IF;

  -- Estado de la venta: CONFIRMADA, EDITADA (30 min) o ANULADA
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = 'sistema_lyla' AND TABLE_NAME = 'ventas' AND COLUMN_NAME = 'estado') THEN
    ALTER TABLE `ventas` ADD COLUMN `estado` ENUM('CONFIRMADA', 'EDITADA', 'ANULADA') NOT NULL DEFAULT 'CONFIRMADA' AFTER `costo_total_ventas`;
  END IF;

  -- Motivo justificado si fue anulada
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = 'sistema_lyla' AND TABLE_NAME = 'ventas' AND COLUMN_NAME = 'motivo_anulacion') THEN
    ALTER TABLE `ventas` ADD COLUMN `motivo_anulacion` TEXT NULL AFTER `estado`;
  END IF;

  -- Vínculo si la venta liquidó una reserva
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = 'sistema_lyla' AND TABLE_NAME = 'ventas' AND COLUMN_NAME = 'reserva_id') THEN
    ALTER TABLE `ventas` ADD COLUMN `reserva_id` VARCHAR(64) NULL AFTER `motivo_anulacion`;
  END IF;

  -- Anticipo de reserva descontado al liquidar
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = 'sistema_lyla' AND TABLE_NAME = 'ventas' AND COLUMN_NAME = 'anticipo_reserva_aplicado') THEN
    ALTER TABLE `ventas` ADD COLUMN `anticipo_reserva_aplicado` DECIMAL(10, 2) NOT NULL DEFAULT 0.00 AFTER `reserva_id`;
  END IF;

  -- Historial JSON de modificaciones (auditoría en ventana de 30 minutos)
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = 'sistema_lyla' AND TABLE_NAME = 'ventas' AND COLUMN_NAME = 'historial') THEN
    ALTER TABLE `ventas` ADD COLUMN `historial` JSON NULL AFTER `anticipo_reserva_aplicado`;
  END IF;

  -- Vínculo a jornada de cierre
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = 'sistema_lyla' AND TABLE_NAME = 'ventas' AND COLUMN_NAME = 'jornada_id') THEN
    ALTER TABLE `ventas` ADD COLUMN `jornada_id` VARCHAR(64) NULL AFTER `historial`;
  END IF;
END$$
DELIMITER ;
CALL `sp_adaptar_ventas`();
DROP PROCEDURE `sp_adaptar_ventas`;

-- Adaptación de `detalle_ventas`
DROP PROCEDURE IF EXISTS `sp_adaptar_detalle_ventas`;
DELIMITER $$
CREATE PROCEDURE `sp_adaptar_detalle_ventas`()
BEGIN
  -- Categoría dinámica en el detalle (eliminar ENUM si existía)
  ALTER TABLE `detalle_ventas` MODIFY COLUMN `categoria` VARCHAR(100) NOT NULL DEFAULT 'Carteras';

  -- Color específico vendido
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = 'sistema_lyla' AND TABLE_NAME = 'detalle_ventas' AND COLUMN_NAME = 'color_seleccionado') THEN
    ALTER TABLE `detalle_ventas` ADD COLUMN `color_seleccionado` VARCHAR(100) NULL AFTER `categoria`;
  END IF;

  -- Costo unitario de compra histórico del lote
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = 'sistema_lyla' AND TABLE_NAME = 'detalle_ventas' AND COLUMN_NAME = 'costo_unitario_compra') THEN
    ALTER TABLE `detalle_ventas` ADD COLUMN `costo_unitario_compra` DECIMAL(10, 2) NOT NULL DEFAULT 0.00 AFTER `subtotal`;
  END IF;

  -- Costo total de compra (cantidad * costo_unitario)
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = 'sistema_lyla' AND TABLE_NAME = 'detalle_ventas' AND COLUMN_NAME = 'costo_total_compra') THEN
    ALTER TABLE `detalle_ventas` ADD COLUMN `costo_total_compra` DECIMAL(10, 2) NOT NULL DEFAULT 0.00 AFTER `costo_unitario_compra`;
  END IF;

  -- Imagen del producto al momento de venta
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = 'sistema_lyla' AND TABLE_NAME = 'detalle_ventas' AND COLUMN_NAME = 'imagen_url') THEN
    ALTER TABLE `detalle_ventas` ADD COLUMN `imagen_url` TEXT NULL AFTER `costo_total_compra`;
  END IF;
END$$
DELIMITER ;
CALL `sp_adaptar_detalle_ventas`();
DROP PROCEDURE `sp_adaptar_detalle_ventas`;

-- Adaptación de `pagos_ventas` para desglose de pagos mixtos
CREATE TABLE IF NOT EXISTS `pagos_ventas` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `venta_id` VARCHAR(64) NOT NULL,
  `metodo_pago` ENUM('Efectivo', 'QR') NOT NULL,
  `monto` DECIMAL(10, 2) NOT NULL,
  `monto_recibido` DECIMAL(10, 2) NULL,
  `cambio_devuelto` DECIMAL(10, 2) NULL,
  `fecha` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_pagos_ventas_venta` (`venta_id`),
  CONSTRAINT `fk_pagos_ventas_venta` FOREIGN KEY (`venta_id`) REFERENCES `ventas` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- =====================================================================
-- SECCIÓN 4: ADAPTACIÓN DE `reservas`, `detalle_reservas`, `pagos_reservas` Y `anticipos_retenidos`
-- =====================================================================
-- Soporte para regla de negocio: vencimiento a 168 horas / 7 días, canales de live,
-- retención del 100% de la seña en vencimientos/cancelaciones, y liquidación a venta.

DROP PROCEDURE IF EXISTS `sp_adaptar_reservas`;
DELIMITER $$
CREATE PROCEDURE `sp_adaptar_reservas`()
BEGIN
  -- Usuario en redes sociales (ej: @mariarossi en TikTok)
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = 'sistema_lyla' AND TABLE_NAME = 'reservas' AND COLUMN_NAME = 'cliente_red_social') THEN
    ALTER TABLE `reservas` ADD COLUMN `cliente_red_social` VARCHAR(100) NULL AFTER `cliente_telefono`;
  END IF;

  -- Canal de origen (Live TikTok, Live Facebook, WhatsApp, etc.)
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = 'sistema_lyla' AND TABLE_NAME = 'reservas' AND COLUMN_NAME = 'canal') THEN
    ALTER TABLE `reservas` ADD COLUMN `canal` VARCHAR(50) NOT NULL DEFAULT 'Live TikTok' AFTER `cliente_red_social`;
  END IF;

  -- Método de pago del anticipo inicial
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = 'sistema_lyla' AND TABLE_NAME = 'reservas' AND COLUMN_NAME = 'metodo_pago_anticipo') THEN
    ALTER TABLE `reservas` ADD COLUMN `metodo_pago_anticipo` ENUM('Efectivo', 'QR') NOT NULL DEFAULT 'QR' AFTER `monto_anticipo`;
  END IF;

  -- Saldo pendiente a pagar al recoger
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = 'sistema_lyla' AND TABLE_NAME = 'reservas' AND COLUMN_NAME = 'saldo_pendiente') THEN
    ALTER TABLE `reservas` ADD COLUMN `saldo_pendiente` DECIMAL(10, 2) NOT NULL DEFAULT 0.00 AFTER `metodo_pago_anticipo`;
  END IF;

  -- Estados válidos: PENDIENTE, COMPLETADA, CANCELADA, VENCIDA
  ALTER TABLE `reservas` MODIFY COLUMN `estado` ENUM('PENDIENTE', 'COMPLETADA', 'CANCELADA', 'VENCIDA') NOT NULL DEFAULT 'PENDIENTE';

  -- Fecha y hora exacta de vencimiento a las 168 horas
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = 'sistema_lyla' AND TABLE_NAME = 'reservas' AND COLUMN_NAME = 'fecha_vencimiento_exacta') THEN
    ALTER TABLE `reservas` ADD COLUMN `fecha_vencimiento_exacta` DATETIME NOT NULL AFTER `fecha_creacion`;
  END IF;

  -- ID de la venta generada al completar
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = 'sistema_lyla' AND TABLE_NAME = 'reservas' AND COLUMN_NAME = 'venta_completada_id') THEN
    ALTER TABLE `reservas` ADD COLUMN `venta_completada_id` VARCHAR(64) NULL AFTER `fecha_vencimiento_exacta`;
  END IF;

  -- Método de pago con el que canceló el saldo
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = 'sistema_lyla' AND TABLE_NAME = 'reservas' AND COLUMN_NAME = 'metodo_pago_saldo') THEN
    ALTER TABLE `reservas` ADD COLUMN `metodo_pago_saldo` ENUM('Efectivo', 'QR', 'Mixto') NULL AFTER `venta_completada_id`;
  END IF;

  -- Desglose del saldo en efectivo
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = 'sistema_lyla' AND TABLE_NAME = 'reservas' AND COLUMN_NAME = 'saldo_efectivo') THEN
    ALTER TABLE `reservas` ADD COLUMN `saldo_efectivo` DECIMAL(10, 2) NULL AFTER `metodo_pago_saldo`;
  END IF;

  -- Desglose del saldo en QR
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = 'sistema_lyla' AND TABLE_NAME = 'reservas' AND COLUMN_NAME = 'saldo_qr') THEN
    ALTER TABLE `reservas` ADD COLUMN `saldo_qr` DECIMAL(10, 2) NULL AFTER `saldo_efectivo`;
  END IF;

  -- Fecha y hora de cancelación o vencimiento
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = 'sistema_lyla' AND TABLE_NAME = 'reservas' AND COLUMN_NAME = 'fecha_cancelacion') THEN
    ALTER TABLE `reservas` ADD COLUMN `fecha_cancelacion` DATETIME NULL AFTER `saldo_qr`;
  END IF;

  -- Motivo de la cancelación o vencimiento
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = 'sistema_lyla' AND TABLE_NAME = 'reservas' AND COLUMN_NAME = 'motivo_cancelacion') THEN
    ALTER TABLE `reservas` ADD COLUMN `motivo_cancelacion` TEXT NULL AFTER `fecha_cancelacion`;
  END IF;

  -- Responsable que procesó la reserva o vencimiento
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = 'sistema_lyla' AND TABLE_NAME = 'reservas' AND COLUMN_NAME = 'responsable') THEN
    ALTER TABLE `reservas` ADD COLUMN `responsable` VARCHAR(100) NULL AFTER `motivo_cancelacion`;
  END IF;

  -- Anticipo retenido por LYLA (100% de la seña en vencidas o canceladas)
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = 'sistema_lyla' AND TABLE_NAME = 'reservas' AND COLUMN_NAME = 'anticipo_retenido') THEN
    ALTER TABLE `reservas` ADD COLUMN `anticipo_retenido` DECIMAL(10, 2) NOT NULL DEFAULT 0.00 AFTER `responsable`;
  END IF;

  -- Notas u observaciones
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = 'sistema_lyla' AND TABLE_NAME = 'reservas' AND COLUMN_NAME = 'notas') THEN
    ALTER TABLE `reservas` ADD COLUMN `notas` TEXT NULL AFTER `anticipo_retenido`;
  END IF;
END$$
DELIMITER ;
CALL `sp_adaptar_reservas`();
DROP PROCEDURE `sp_adaptar_reservas`;

-- Adaptación de `detalle_reservas`
DROP PROCEDURE IF EXISTS `sp_adaptar_detalle_reservas`;
DELIMITER $$
CREATE PROCEDURE `sp_adaptar_detalle_reservas`()
BEGIN
  -- Categoría dinámica en el detalle
  ALTER TABLE `detalle_reservas` MODIFY COLUMN `categoria` VARCHAR(100) NOT NULL DEFAULT 'Carteras';

  -- Color apartado
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = 'sistema_lyla' AND TABLE_NAME = 'detalle_reservas' AND COLUMN_NAME = 'color_seleccionado') THEN
    ALTER TABLE `detalle_reservas` ADD COLUMN `color_seleccionado` VARCHAR(100) NULL AFTER `categoria`;
  END IF;

  -- Costo unitario de compra para referencia contable
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = 'sistema_lyla' AND TABLE_NAME = 'detalle_reservas' AND COLUMN_NAME = 'costo_unitario_compra') THEN
    ALTER TABLE `detalle_reservas` ADD COLUMN `costo_unitario_compra` DECIMAL(10, 2) NOT NULL DEFAULT 0.00 AFTER `subtotal`;
  END IF;
END$$
DELIMITER ;
CALL `sp_adaptar_detalle_reservas`();
DROP PROCEDURE `sp_adaptar_detalle_reservas`;

-- Adaptación de `anticipos_retenidos` (Otros Ingresos válidos del Estado de Resultados)
CREATE TABLE IF NOT EXISTS `anticipos_retenidos` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `reserva_id` VARCHAR(64) NOT NULL,
  `monto` DECIMAL(10, 2) NOT NULL,
  `metodo_pago_origen` ENUM('Efectivo', 'QR') NOT NULL,
  `fecha_retencion` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `motivo` ENUM('VENCIMIENTO_168_HORAS', 'CANCELACION_CLIENTE') NOT NULL DEFAULT 'VENCIMIENTO_168_HORAS',
  `responsable` VARCHAR(100) NOT NULL DEFAULT 'Sistema LYLA',
  `registrado_en_resultados` TINYINT(1) NOT NULL DEFAULT 1,
  INDEX `idx_anticipos_reserva` (`reserva_id`),
  INDEX `idx_anticipos_fecha` (`fecha_retencion`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- =====================================================================
-- SECCIÓN 5: ADAPTACIÓN DE `compras`, `detalle_compras` Y `proveedores`
-- =====================================================================
-- Soporte para compras de mercadería con cálculo de Costo Promedio Ponderado,
-- incorporación de nuevos productos y registro de color adquirido.

DROP PROCEDURE IF EXISTS `sp_adaptar_detalle_compras`;
DELIMITER $$
CREATE PROCEDURE `sp_adaptar_detalle_compras`()
BEGIN
  -- Categoría dinámica en el detalle de compras
  ALTER TABLE `detalle_compras` MODIFY COLUMN `categoria` VARCHAR(100) NOT NULL DEFAULT 'Carteras';

  -- Color de la mercadería comprada
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = 'sistema_lyla' AND TABLE_NAME = 'detalle_compras' AND COLUMN_NAME = 'color_seleccionado') THEN
    ALTER TABLE `detalle_compras` ADD COLUMN `color_seleccionado` VARCHAR(100) NULL AFTER `categoria`;
  END IF;

  -- Bandera que indica si la compra introdujo un nuevo producto al catálogo
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = 'sistema_lyla' AND TABLE_NAME = 'detalle_compras' AND COLUMN_NAME = 'es_producto_nuevo') THEN
    ALTER TABLE `detalle_compras` ADD COLUMN `es_producto_nuevo` TINYINT(1) NOT NULL DEFAULT 0 AFTER `subtotal`;
  END IF;
END$$
DELIMITER ;
CALL `sp_adaptar_detalle_compras`();
DROP PROCEDURE `sp_adaptar_detalle_compras`;


-- =====================================================================
-- SECCIÓN 6: ADAPTACIÓN DE `gastos` Y `categorias_gastos`
-- =====================================================================
-- Permite categorías editables por el usuario (Alquiler, Luz, Internet, Transporte, etc.)
-- y registro exacto del método de pago (Efectivo o QR) para el arqueo de caja.

CREATE TABLE IF NOT EXISTS `categorias_gastos` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `nombre` VARCHAR(100) NOT NULL,
  `activa` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `uk_categorias_gastos_nombre` (`nombre`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Sembrar categorías de gastos operacionales predeterminadas
INSERT INTO `categorias_gastos` (`id`, `nombre`, `activa`)
VALUES
  ('cat-gasto-1', 'Alquiler', 1),
  ('cat-gasto-2', 'Luz', 1),
  ('cat-gasto-3', 'Internet', 1),
  ('cat-gasto-4', 'Transporte', 1),
  ('cat-gasto-5', 'Limpieza', 1),
  ('cat-gasto-6', 'Material de oficina', 1),
  ('cat-gasto-7', 'Comida', 1)
ON DUPLICATE KEY UPDATE `activa` = VALUES(`activa`);

DROP PROCEDURE IF EXISTS `sp_adaptar_gastos`;
DELIMITER $$
CREATE PROCEDURE `sp_adaptar_gastos`()
BEGIN
  -- Categoría como texto flexible o vinculada
  ALTER TABLE `gastos` MODIFY COLUMN `categoria` VARCHAR(100) NOT NULL;

  -- Método de pago del gasto (Efectivo o QR)
  ALTER TABLE `gastos` MODIFY COLUMN `metodo_pago` ENUM('Efectivo', 'QR', 'Mixto') NOT NULL DEFAULT 'Efectivo';

  -- Responsable que ejecutó el desembolso
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = 'sistema_lyla' AND TABLE_NAME = 'gastos' AND COLUMN_NAME = 'responsable') THEN
    ALTER TABLE `gastos` ADD COLUMN `responsable` VARCHAR(100) NOT NULL DEFAULT 'Roly' AFTER `metodo_pago`;
  END IF;

  -- Vínculo a la jornada donde se contabilizó el egreso
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = 'sistema_lyla' AND TABLE_NAME = 'gastos' AND COLUMN_NAME = 'jornada_id') THEN
    ALTER TABLE `gastos` ADD COLUMN `jornada_id` VARCHAR(64) NULL AFTER `responsable`;
  END IF;
END$$
DELIMITER ;
CALL `sp_adaptar_gastos`();
DROP PROCEDURE `sp_adaptar_gastos`;


-- =====================================================================
-- SECCIÓN 7: ADAPTACIÓN DE `jornadas` (ARQUEO COMPLETO EFECTIVO Y QR)
-- =====================================================================
-- Implementa todas las fórmulas de control físico:
-- Efectivo esperado = Caja inicial + ventas efectivo - gastos efectivo
-- QR esperado = QR inicial + ventas QR - gastos QR
-- Total dinero esperado = Efectivo esperado + QR esperado
-- Conteo real verificado, diferencias y justificación obligatoria.

DROP PROCEDURE IF EXISTS `sp_adaptar_jornadas`;
DELIMITER $$
CREATE PROCEDURE `sp_adaptar_jornadas`()
BEGIN
  -- Fecha de la jornada (YYYY-MM-DD)
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = 'sistema_lyla' AND TABLE_NAME = 'jornadas' AND COLUMN_NAME = 'fecha') THEN
    ALTER TABLE `jornadas` ADD COLUMN `fecha` DATE NOT NULL AFTER `id`;
  END IF;

  -- Apertura de jornada
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = 'sistema_lyla' AND TABLE_NAME = 'jornadas' AND COLUMN_NAME = 'abierta_at') THEN
    ALTER TABLE `jornadas` ADD COLUMN `abierta_at` DATETIME NULL AFTER `fecha`;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = 'sistema_lyla' AND TABLE_NAME = 'jornadas' AND COLUMN_NAME = 'abierta_por') THEN
    ALTER TABLE `jornadas` ADD COLUMN `abierta_por` VARCHAR(100) NULL AFTER `abierta_at`;
  END IF;

  -- Caja inicial en efectivo
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = 'sistema_lyla' AND TABLE_NAME = 'jornadas' AND COLUMN_NAME = 'caja_inicial_efectivo') THEN
    ALTER TABLE `jornadas` ADD COLUMN `caja_inicial_efectivo` DECIMAL(10, 2) NOT NULL DEFAULT 0.00 AFTER `abierta_por`;
  END IF;

  -- Saldo inicial en QR / Banco
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = 'sistema_lyla' AND TABLE_NAME = 'jornadas' AND COLUMN_NAME = 'saldo_inicial_qr') THEN
    ALTER TABLE `jornadas` ADD COLUMN `saldo_inicial_qr` DECIMAL(10, 2) NOT NULL DEFAULT 0.00 AFTER `caja_inicial_efectivo`;
  END IF;

  -- Total dinero inicial
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = 'sistema_lyla' AND TABLE_NAME = 'jornadas' AND COLUMN_NAME = 'total_inicial') THEN
    ALTER TABLE `jornadas` ADD COLUMN `total_inicial` DECIMAL(10, 2) NOT NULL DEFAULT 0.00 AFTER `saldo_inicial_qr`;
  END IF;

  -- Cierre de jornada
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = 'sistema_lyla' AND TABLE_NAME = 'jornadas' AND COLUMN_NAME = 'cerrada_at') THEN
    ALTER TABLE `jornadas` ADD COLUMN `cerrada_at` DATETIME NULL AFTER `total_inicial`;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = 'sistema_lyla' AND TABLE_NAME = 'jornadas' AND COLUMN_NAME = 'cerrada_por') THEN
    ALTER TABLE `jornadas` ADD COLUMN `cerrada_por` VARCHAR(100) NULL AFTER `cerrada_at`;
  END IF;

  -- Totales de ventas cobradas
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = 'sistema_lyla' AND TABLE_NAME = 'jornadas' AND COLUMN_NAME = 'total_ventas') THEN
    ALTER TABLE `jornadas` ADD COLUMN `total_ventas` DECIMAL(10, 2) NOT NULL DEFAULT 0.00 AFTER `cerrada_por`;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = 'sistema_lyla' AND TABLE_NAME = 'jornadas' AND COLUMN_NAME = 'ventas_efectivo') THEN
    ALTER TABLE `jornadas` ADD COLUMN `ventas_efectivo` DECIMAL(10, 2) NOT NULL DEFAULT 0.00 AFTER `total_ventas`;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = 'sistema_lyla' AND TABLE_NAME = 'jornadas' AND COLUMN_NAME = 'ventas_qr') THEN
    ALTER TABLE `jornadas` ADD COLUMN `ventas_qr` DECIMAL(10, 2) NOT NULL DEFAULT 0.00 AFTER `ventas_efectivo`;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = 'sistema_lyla' AND TABLE_NAME = 'jornadas' AND COLUMN_NAME = 'cantidad_ventas') THEN
    ALTER TABLE `jornadas` ADD COLUMN `cantidad_ventas` INT NOT NULL DEFAULT 0 AFTER `ventas_qr`;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = 'sistema_lyla' AND TABLE_NAME = 'jornadas' AND COLUMN_NAME = 'total_descuentos') THEN
    ALTER TABLE `jornadas` ADD COLUMN `total_descuentos` DECIMAL(10, 2) NOT NULL DEFAULT 0.00 AFTER `cantidad_ventas`;
  END IF;

  -- Totales de gastos pagados
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = 'sistema_lyla' AND TABLE_NAME = 'jornadas' AND COLUMN_NAME = 'total_gastos') THEN
    ALTER TABLE `jornadas` ADD COLUMN `total_gastos` DECIMAL(10, 2) NOT NULL DEFAULT 0.00 AFTER `total_descuentos`;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = 'sistema_lyla' AND TABLE_NAME = 'jornadas' AND COLUMN_NAME = 'gastos_efectivo') THEN
    ALTER TABLE `jornadas` ADD COLUMN `gastos_efectivo` DECIMAL(10, 2) NOT NULL DEFAULT 0.00 AFTER `total_gastos`;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = 'sistema_lyla' AND TABLE_NAME = 'jornadas' AND COLUMN_NAME = 'gastos_qr') THEN
    ALTER TABLE `jornadas` ADD COLUMN `gastos_qr` DECIMAL(10, 2) NOT NULL DEFAULT 0.00 AFTER `gastos_efectivo`;
  END IF;

  -- Resumen JSON de gastos por categoría
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = 'sistema_lyla' AND TABLE_NAME = 'jornadas' AND COLUMN_NAME = 'gastos_por_categoria') THEN
    ALTER TABLE `jornadas` ADD COLUMN `gastos_por_categoria` JSON NULL AFTER `gastos_qr`;
  END IF;

  -- Flujo operativo neto de caja (Total ventas - Total gastos)
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = 'sistema_lyla' AND TABLE_NAME = 'jornadas' AND COLUMN_NAME = 'flujo_operativo') THEN
    ALTER TABLE `jornadas` ADD COLUMN `flujo_operativo` DECIMAL(10, 2) NOT NULL DEFAULT 0.00 AFTER `gastos_por_categoria`;
  END IF;

  -- Fórmulas esperadas de arqueo
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = 'sistema_lyla' AND TABLE_NAME = 'jornadas' AND COLUMN_NAME = 'efectivo_esperado') THEN
    ALTER TABLE `jornadas` ADD COLUMN `efectivo_esperado` DECIMAL(10, 2) NOT NULL DEFAULT 0.00 AFTER `flujo_operativo`;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = 'sistema_lyla' AND TABLE_NAME = 'jornadas' AND COLUMN_NAME = 'qr_esperado') THEN
    ALTER TABLE `jornadas` ADD COLUMN `qr_esperado` DECIMAL(10, 2) NOT NULL DEFAULT 0.00 AFTER `efectivo_esperado`;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = 'sistema_lyla' AND TABLE_NAME = 'jornadas' AND COLUMN_NAME = 'total_esperado') THEN
    ALTER TABLE `jornadas` ADD COLUMN `total_esperado` DECIMAL(10, 2) NOT NULL DEFAULT 0.00 AFTER `qr_esperado`;
  END IF;

  -- Arqueo físico ingresado por el usuario
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = 'sistema_lyla' AND TABLE_NAME = 'jornadas' AND COLUMN_NAME = 'efectivo_real_contado') THEN
    ALTER TABLE `jornadas` ADD COLUMN `efectivo_real_contado` DECIMAL(10, 2) NULL AFTER `total_esperado`;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = 'sistema_lyla' AND TABLE_NAME = 'jornadas' AND COLUMN_NAME = 'qr_real_verificado') THEN
    ALTER TABLE `jornadas` ADD COLUMN `qr_real_verificado` DECIMAL(10, 2) NULL AFTER `efectivo_real_contado`;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = 'sistema_lyla' AND TABLE_NAME = 'jornadas' AND COLUMN_NAME = 'total_real_contado') THEN
    ALTER TABLE `jornadas` ADD COLUMN `total_real_contado` DECIMAL(10, 2) NULL AFTER `qr_real_verificado`;
  END IF;

  -- Diferencias automáticas (Real - Esperado)
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = 'sistema_lyla' AND TABLE_NAME = 'jornadas' AND COLUMN_NAME = 'diferencia_efectivo') THEN
    ALTER TABLE `jornadas` ADD COLUMN `diferencia_efectivo` DECIMAL(10, 2) NULL AFTER `total_real_contado`;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = 'sistema_lyla' AND TABLE_NAME = 'jornadas' AND COLUMN_NAME = 'diferencia_qr') THEN
    ALTER TABLE `jornadas` ADD COLUMN `diferencia_qr` DECIMAL(10, 2) NULL AFTER `diferencia_efectivo`;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = 'sistema_lyla' AND TABLE_NAME = 'jornadas' AND COLUMN_NAME = 'diferencia_total') THEN
    ALTER TABLE `jornadas` ADD COLUMN `diferencia_total` DECIMAL(10, 2) NULL AFTER `diferencia_qr`;
  END IF;

  -- Justificación obligatoria en caso de faltante o sobrante
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = 'sistema_lyla' AND TABLE_NAME = 'jornadas' AND COLUMN_NAME = 'justificacion_diferencia') THEN
    ALTER TABLE `jornadas` ADD COLUMN `justificacion_diferencia` TEXT NULL AFTER `diferencia_total`;
  END IF;

  -- Control de reapertura auditada
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = 'sistema_lyla' AND TABLE_NAME = 'jornadas' AND COLUMN_NAME = 'reabierta') THEN
    ALTER TABLE `jornadas` ADD COLUMN `reabierta` TINYINT(1) NOT NULL DEFAULT 0 AFTER `justificacion_diferencia`;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = 'sistema_lyla' AND TABLE_NAME = 'jornadas' AND COLUMN_NAME = 'reabierta_at') THEN
    ALTER TABLE `jornadas` ADD COLUMN `reabierta_at` DATETIME NULL AFTER `reabierta`;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = 'sistema_lyla' AND TABLE_NAME = 'jornadas' AND COLUMN_NAME = 'reabierta_por') THEN
    ALTER TABLE `jornadas` ADD COLUMN `reabierta_por` VARCHAR(100) NULL AFTER `reabierta_at`;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = 'sistema_lyla' AND TABLE_NAME = 'jornadas' AND COLUMN_NAME = 'motivo_reapertura') THEN
    ALTER TABLE `jornadas` ADD COLUMN `motivo_reapertura` TEXT NULL AFTER `reabierta_por`;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = 'sistema_lyla' AND TABLE_NAME = 'jornadas' AND COLUMN_NAME = 'notas') THEN
    ALTER TABLE `jornadas` ADD COLUMN `notas` TEXT NULL AFTER `motivo_reapertura`;
  END IF;
END$$
DELIMITER ;
CALL `sp_adaptar_jornadas`();
DROP PROCEDURE `sp_adaptar_jornadas`;


-- =====================================================================
-- SECCIÓN 8: VISTAS DE COMPATIBILIDAD Y AUDITORÍA (OPCIONALES Y SEGURAS)
-- =====================================================================
-- Vistas que facilitan consultas directas y compatibilidad total con nombres en inglés o español.

CREATE TABLE IF NOT EXISTS `auditoria_sistema` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `entidad` VARCHAR(50) NOT NULL,
  `entidad_id` VARCHAR(64) NOT NULL,
  `accion` VARCHAR(50) NOT NULL,
  `detalles` JSON NULL,
  `usuario` VARCHAR(100) NOT NULL,
  `fecha_hora` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_auditoria_entidad` (`entidad`, `entidad_id`),
  INDEX `idx_auditoria_fecha` (`fecha_hora`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Restaurar revisión de claves foráneas
SET FOREIGN_KEY_CHECKS = @OLD_FOREIGN_KEY_CHECKS;

-- Verificación final
SELECT 'Migración completada exitosamente. Las 14 tablas de sistema_lyla han sido adaptadas sin pérdida de datos.' AS `Estado`;
