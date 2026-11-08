import React, { useState, useMemo } from 'react';
import {
  Truck,
  Plus,
  Search,
  Package,
  Calendar,
  DollarSign,
  AlertCircle,
  CheckCircle,
  HelpCircle,
  ArrowRight,
  Boxes,
} from 'lucide-react';
import { Product, ProductCategory, ProductCategoryItem, InventoryPurchase } from '../types';
import { formatBs, round2, formatDate, getTodayDateString } from '../utils/formatters';

interface PurchasesModuleProps {
  products: Product[];
  purchases: InventoryPurchase[];
  productCategories?: ProductCategoryItem[];
  onConfirmPurchase: (
    purchaseData: Omit<InventoryPurchase, 'id' | 'createdAt'>,
    newProductData?: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>
  ) => void;
}

export const PurchasesModule: React.FC<PurchasesModuleProps> = ({
  products,
  purchases,
  productCategories,
  onConfirmPurchase,
}) => {
  const activeCategories = useMemo(() => {
    if (productCategories && productCategories.length > 0) {
      const active = productCategories.filter((c) => c.active);
      return active.length > 0
        ? active
        : [
            { id: 'cat-carteras', name: 'Carteras', active: true },
            { id: 'cat-joyas', name: 'Joyas', active: true },
            { id: 'cat-relojes', name: 'Relojes', active: true },
            { id: 'cat-accesorios', name: 'Accesorios', active: true },
          ];
    }
    return [
      { id: 'cat-carteras', name: 'Carteras', active: true },
      { id: 'cat-joyas', name: 'Joyas', active: true },
      { id: 'cat-relojes', name: 'Relojes', active: true },
      { id: 'cat-accesorios', name: 'Accesorios', active: true },
    ];
  }, [productCategories]);
  // Mode: Existing product or New product
  const [purchaseMode, setPurchaseMode] = useState<'existing' | 'new'>('existing');

  // Form Fields
  const [supplier, setSupplier] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(getTodayDateString());
  const [selectedProductId, setSelectedProductId] = useState<string>(products[0]?.id || '');

  // Numeric fields
  const [quantityStr, setQuantityStr] = useState('1');
  const [unitCostStr, setUnitCostStr] = useState('');
  const [selectedColor, setSelectedColor] = useState('');
  const [customColor, setCustomColor] = useState('');

  // If new product
  const [newCategory, setNewCategory] = useState<ProductCategory>('Carteras');
  const [newCode, setNewCode] = useState('');
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState('');
  const [newBrand, setNewBrand] = useState('');
  const [newSalePriceStr, setNewSalePriceStr] = useState('');

  const [formError, setFormError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [searchHistoryQuery, setSearchHistoryQuery] = useState('');

  // Selected existing product
  const currentSelectedProduct = useMemo(() => {
    return products.find((p) => p.id === selectedProductId);
  }, [products, selectedProductId]);

  // Update default unit cost and default color when selecting existing product
  React.useEffect(() => {
    if (purchaseMode === 'existing' && currentSelectedProduct) {
      if (!unitCostStr) {
        setUnitCostStr(currentSelectedProduct.purchaseCost.toString());
      }
      const existingColors = currentSelectedProduct.availableColors && currentSelectedProduct.availableColors.length > 0
        ? currentSelectedProduct.availableColors
        : Object.keys(currentSelectedProduct.colorStock || {});
      if (existingColors.length > 0 && (!selectedColor || !existingColors.includes(selectedColor))) {
        setSelectedColor(existingColors[0]);
      }
    }
  }, [currentSelectedProduct, purchaseMode, selectedColor, unitCostStr]);

  const quantityNum = useMemo(() => {
    const q = parseInt(quantityStr, 10);
    return isNaN(q) || q <= 0 ? 0 : q;
  }, [quantityStr]);

  const unitCostNum = useMemo(() => {
    const c = parseFloat(unitCostStr);
    return isNaN(c) || c < 0 ? 0 : round2(c);
  }, [unitCostStr]);

  // Cálculo automático: Total = Cantidad * Precio Unitario
  const totalPurchaseAmount = useMemo(() => {
    return round2(quantityNum * unitCostNum);
  }, [quantityNum, unitCostNum]);

  // Cálculo del Costo Promedio Ponderado si el producto ya existe
  const weightedAveragePreview = useMemo(() => {
    if (purchaseMode !== 'existing' || !currentSelectedProduct || quantityNum <= 0 || unitCostNum <= 0) {
      return null;
    }
    const currentStock = currentSelectedProduct.stock;
    const currentCost = currentSelectedProduct.purchaseCost;
    const newTotalStock = currentStock + quantityNum;

    if (newTotalStock <= 0) return null;

    const currentTotalValue = currentStock * currentCost;
    const purchaseTotalValue = quantityNum * unitCostNum;
    const weightedAvg = round2((currentTotalValue + purchaseTotalValue) / newTotalStock);

    return {
      currentStock,
      currentCost,
      newTotalStock,
      weightedAvg,
    };
  }, [purchaseMode, currentSelectedProduct, quantityNum, unitCostNum]);

  // Confirm Purchase
  const handleSubmitPurchase = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setSuccessMessage('');

    if (!supplier.trim()) {
      setFormError('Por favor introduzca el nombre del proveedor.');
      return;
    }
    if (!purchaseDate) {
      setFormError('Seleccione la fecha de compra.');
      return;
    }
    if (quantityNum <= 0) {
      setFormError('La cantidad adquirida debe ser al menos 1 unidad.');
      return;
    }
    if (unitCostNum <= 0) {
      setFormError('El costo por unidad debe ser mayor a 0 Bs.');
      return;
    }

    const purchaseNumber = `COM-${String(purchases.length + 1).padStart(4, '0')}`;

    if (purchaseMode === 'existing') {
      if (!currentSelectedProduct) {
        setFormError('Seleccione un producto existente del inventario.');
        return;
      }

      const finalColor = selectedColor === '__nuevo__' ? customColor.trim() : (selectedColor.trim() || currentSelectedProduct.availableColors?.[0] || currentSelectedProduct.color || 'Único');

      onConfirmPurchase({
        purchaseNumber,
        supplier: supplier.trim(),
        date: purchaseDate,
        productId: currentSelectedProduct.id,
        productCode: currentSelectedProduct.code,
        productName: currentSelectedProduct.name,
        category: currentSelectedProduct.category,
        selectedColor: finalColor,
        quantity: quantityNum,
        unitCost: unitCostNum,
        total: totalPurchaseAmount,
        isNewProduct: false,
      });

      setSuccessMessage(`Compra registrada. Se agregaron ${quantityNum} unidades (Color: ${finalColor}) a "${currentSelectedProduct.name}".`);
    } else {
      // New product
      const trimmedCode = newCode.trim().toUpperCase();
      const trimmedName = newName.trim();
      const salePriceNum = parseFloat(newSalePriceStr);

      if (!trimmedCode) {
        setFormError('Introduzca un código para el nuevo producto.');
        return;
      }
      if (products.some((p) => p.code.toUpperCase() === trimmedCode)) {
        setFormError(`El código "${trimmedCode}" ya existe en el inventario.`);
        return;
      }
      if (!trimmedName) {
        setFormError('Introduzca el nombre o referencia del nuevo producto.');
        return;
      }
      if (isNaN(salePriceNum) || salePriceNum <= 0) {
        setFormError('Introduzca un precio de venta al público válido.');
        return;
      }

      const tempId = `prod-${Date.now()}`;
      onConfirmPurchase(
        {
          purchaseNumber,
          supplier: supplier.trim(),
          date: purchaseDate,
          productId: tempId,
          productCode: trimmedCode,
          productName: trimmedName,
          category: newCategory,
          quantity: quantityNum,
          unitCost: unitCostNum,
          total: totalPurchaseAmount,
          isNewProduct: true,
        },
        {
          code: trimmedCode,
          name: trimmedName,
          category: newCategory,
          color: newColor.trim(),
          brand: newBrand.trim(),
          purchaseCost: unitCostNum,
          salePrice: round2(salePriceNum),
          stock: quantityNum,
          imageUrl: '',
        }
      );

      setSuccessMessage(`Nuevo producto "${trimmedName}" creado e ingresado a inventario con éxito.`);
      setNewCode('');
      setNewName('');
      setNewColor('');
      setNewBrand('');
      setNewSalePriceStr('');
    }

    // Reset base fields
    setQuantityStr('1');
    setUnitCostStr('');
  };

  // Filter history
  const filteredPurchases = useMemo(() => {
    return purchases.filter((p) => {
      const q = searchHistoryQuery.toLowerCase().trim();
      if (!q) return true;
      return (
        p.supplier.toLowerCase().includes(q) ||
        p.productName.toLowerCase().includes(q) ||
        p.productCode.toLowerCase().includes(q) ||
        p.purchaseNumber.toLowerCase().includes(q)
      );
    });
  }, [purchases, searchHistoryQuery]);

  const totalPurchasesAccumulated = useMemo(() => {
    return round2(purchases.reduce((acc, p) => acc + p.total, 0));
  }, [purchases]);

  return (
    <div className="space-y-6">
      {/* Header and Mandatory Accounting Note */}
      <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Truck className="h-6 w-6 text-rose-950" />
              <h2 className="text-xl font-bold text-neutral-900">
                Compras de Inventario y Mercadería
              </h2>
            </div>
            <p className="mt-1 text-xs text-neutral-500">
              Ingreso de artículos, aumento de existencias y valoración por Costo Promedio Ponderado
            </p>
          </div>

          <div className="rounded-xl bg-amber-50 p-3 border border-amber-200 text-amber-900 text-xs max-w-md">
            <span className="font-bold flex items-center gap-1.5">
              <AlertCircle className="h-4 w-4 text-amber-700 shrink-0" />
              Regla Contable Importante:
            </span>
            <p className="mt-0.5 text-[11px] text-amber-800">
              La compra de mercadería <strong>NO es un gasto operativo</strong>. Incrementa el inventario de LYLA y se reconoce como Costo de Ventas únicamente cuando el producto se vende.
            </p>
          </div>
        </div>
      </div>

      {/* Main Form & Purchase Action */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Purchase Form (7 cols) */}
        <div className="lg:col-span-7">
          <form
            onSubmit={handleSubmitPurchase}
            className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-xs space-y-5"
          >
            <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
              <h3 className="text-sm font-bold text-neutral-900">
                Registrar Ingreso de Mercadería
              </h3>
              {/* Toggle Mode */}
              <div className="flex items-center rounded-xl bg-neutral-100 p-1">
                <button
                  type="button"
                  onClick={() => setPurchaseMode('existing')}
                  className={`rounded-lg px-3 py-1 text-xs font-semibold transition ${
                    purchaseMode === 'existing'
                      ? 'bg-white text-neutral-900 shadow-xs'
                      : 'text-neutral-500 hover:text-neutral-900'
                  }`}
                >
                  Producto Existente
                </button>
                <button
                  type="button"
                  onClick={() => setPurchaseMode('new')}
                  className={`rounded-lg px-3 py-1 text-xs font-semibold transition ${
                    purchaseMode === 'new'
                      ? 'bg-white text-neutral-900 shadow-xs'
                      : 'text-neutral-500 hover:text-neutral-900'
                  }`}
                >
                  + Nuevo Producto
                </button>
              </div>
            </div>

            {formError && (
              <div className="flex items-center gap-2 rounded-xl bg-rose-50 p-3 text-xs text-rose-800 border border-rose-200">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            {successMessage && (
              <div className="flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-xs text-emerald-800 border border-emerald-200">
                <CheckCircle className="h-4 w-4 shrink-0" />
                <span>{successMessage}</span>
              </div>
            )}

            {/* General Fields: Proveedor & Fecha */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">
                  1. Nombre del Proveedor *
                </label>
                <input
                  type="text"
                  required
                  value={supplier}
                  onChange={(e) => setSupplier(e.target.value)}
                  placeholder="Ej: Distribuidora Moda Bolivia, Importadora Relojes SRL"
                  className="w-full rounded-xl border border-neutral-200 px-3.5 py-2.5 text-xs font-medium outline-none focus:border-rose-900"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">
                  2. Fecha de Compra *
                </label>
                <input
                  type="date"
                  required
                  value={purchaseDate}
                  onChange={(e) => setPurchaseDate(e.target.value)}
                  className="w-full rounded-xl border border-neutral-200 px-3.5 py-2.5 text-xs font-medium outline-none focus:border-rose-900"
                />
              </div>
            </div>

            {/* Product Selection */}
            {purchaseMode === 'existing' ? (
              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">
                  3. Seleccionar Producto del Inventario *
                </label>
                <select
                  value={selectedProductId}
                  onChange={(e) => {
                    setSelectedProductId(e.target.value);
                    const p = products.find((prod) => prod.id === e.target.value);
                    if (p) setUnitCostStr(p.purchaseCost.toString());
                  }}
                  className="w-full rounded-xl border border-neutral-200 bg-white px-3.5 py-2.5 text-xs font-medium outline-none focus:border-rose-900"
                >
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      [{p.category}] {p.code} - {p.name} (Stock actual: {p.stock} u. · Costo actual: {formatBs(p.purchaseCost)})
                    </option>
                  ))}
                </select>

                {/* Color específico a aumentar */}
                {currentSelectedProduct && (
                  <div className="mt-3">
                    <label className="block text-xs font-semibold text-neutral-700 mb-1">
                      Color Específico a Aumentar / Reabastecer *
                    </label>
                    <div className="flex gap-2">
                      <select
                        value={selectedColor}
                        onChange={(e) => setSelectedColor(e.target.value)}
                        className="flex-1 rounded-xl border border-neutral-200 bg-white px-3 py-2 text-xs font-medium outline-none focus:border-rose-900"
                      >
                        {Array.from(
                          new Set([
                            ...(currentSelectedProduct.availableColors || []),
                            ...Object.keys(currentSelectedProduct.colorStock || {}),
                            ...(currentSelectedProduct.color ? currentSelectedProduct.color.split(',').map((c) => c.trim()) : []),
                          ])
                        ).filter(Boolean).map((col) => {
                          const colStock = currentSelectedProduct.colorStock?.[col] ?? 0;
                          return (
                            <option key={col} value={col}>
                              Color: {col} (Stock actual: {colStock} u.)
                            </option>
                          );
                        })}
                        <option value="__nuevo__">+ Registrar nuevo color...</option>
                      </select>
                      {selectedColor === '__nuevo__' && (
                        <input
                          type="text"
                          required
                          value={customColor}
                          onChange={(e) => setCustomColor(e.target.value)}
                          placeholder="Nombre del nuevo color..."
                          className="w-48 rounded-xl border border-neutral-300 bg-white px-3 py-2 text-xs font-medium outline-none focus:border-rose-900"
                        />
                      )}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-xl border border-rose-200 bg-rose-50/30 p-4 space-y-4">
                <span className="text-xs font-bold uppercase tracking-wider text-rose-900">
                  Ficha de Nuevo Producto a Incorporar
                </span>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 mb-1">
                      Categoría *
                    </label>
                    <select
                      value={newCategory}
                      onChange={(e) => setNewCategory(e.target.value as ProductCategory)}
                      className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-xs font-medium"
                    >
                      {activeCategories.map((cat) => (
                        <option key={cat.id} value={cat.name}>
                          {cat.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 mb-1">
                      Código *
                    </label>
                    <input
                      type="text"
                      required
                      value={newCode}
                      onChange={(e) => setNewCode(e.target.value)}
                      placeholder="Ej: CAR-003, REL-004"
                      className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 font-mono text-xs uppercase"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-neutral-700 mb-1">
                      Nombre o Referencia *
                    </label>
                    <input
                      type="text"
                      required
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder="Ej: Cartera Cuero Nácar, Reloj Elegance"
                      className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-xs font-medium"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 mb-1">
                      Marca
                    </label>
                    <input
                      type="text"
                      value={newBrand}
                      onChange={(e) => setNewBrand(e.target.value)}
                      placeholder="Marca comercial"
                      className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 mb-1">
                      Color
                    </label>
                    <input
                      type="text"
                      value={newColor}
                      onChange={(e) => setNewColor(e.target.value)}
                      placeholder="Color o acabado"
                      className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-xs"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-neutral-700 mb-1">
                      Precio de Venta al Público (Bs) *
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      required
                      value={newSalePriceStr}
                      onChange={(e) => setNewSalePriceStr(e.target.value)}
                      placeholder="0.00"
                      className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 font-mono text-xs font-bold"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Cantidad y Costo por Unidad (Cálculo Automático) */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">
                  4. Cantidad Adquirida *
                </label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  required
                  value={quantityStr}
                  onChange={(e) => setQuantityStr(e.target.value)}
                  placeholder="1"
                  className="w-full rounded-xl border border-neutral-200 px-3.5 py-2.5 font-mono text-xs font-bold outline-none focus:border-rose-900"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">
                  5. Costo por Unidad (Bs) *
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-mono text-xs text-neutral-400">
                    Bs
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    value={unitCostStr}
                    onChange={(e) => setUnitCostStr(e.target.value)}
                    placeholder="0.00"
                    className="w-full rounded-xl border border-neutral-200 py-2.5 pl-10 pr-3.5 font-mono text-xs font-bold outline-none focus:border-rose-900"
                  />
                </div>
              </div>
            </div>

            {/* Total Automático (Requisito: Total = Cantidad × Precio unitario) */}
            <div className="rounded-xl bg-neutral-50 p-4 border border-neutral-200 flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-neutral-600 uppercase tracking-wider">
                  6. Total de la Compra (Automático)
                </span>
                <p className="text-[11px] text-neutral-400">
                  {quantityNum} u. × {formatBs(unitCostNum)} =
                </p>
              </div>
              <span className="font-mono-numbers text-2xl font-bold text-neutral-900">
                {formatBs(totalPurchaseAmount)}
              </span>
            </div>

            {/* Botón de Confirmación */}
            <button
              type="submit"
              disabled={quantityNum <= 0 || unitCostNum <= 0}
              className={`w-full rounded-xl py-3.5 text-xs font-bold uppercase tracking-wider text-white shadow-md transition ${
                quantityNum <= 0 || unitCostNum <= 0
                  ? 'bg-neutral-300 cursor-not-allowed'
                  : 'bg-rose-950 hover:bg-rose-900'
              }`}
            >
              Confirmar Ingreso a Inventario
            </button>
          </form>
        </div>

        {/* Right Column: Weighted Average Cost Preview & Help (5 cols) */}
        <div className="lg:col-span-5 space-y-5">
          {/* Weighted Average Cost Card */}
          {weightedAveragePreview && (
            <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-xs space-y-4">
              <div className="flex items-center gap-2 text-rose-950">
                <Boxes className="h-5 w-5" />
                <h4 className="text-sm font-bold">
                  Valoración de Inventario (Costo Ponderado)
                </h4>
              </div>
              <p className="text-xs text-neutral-500">
                El sistema actualiza de manera matemáticamente exacta el costo unitario de adquisición:
              </p>

              <div className="space-y-2 rounded-xl bg-neutral-50 p-3.5 text-xs border border-neutral-100">
                <div className="flex justify-between">
                  <span className="text-neutral-500">Stock Actual en Tienda:</span>
                  <span className="font-mono-numbers font-medium text-neutral-900">
                    {weightedAveragePreview.currentStock} u.
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-500">Costo Actual Registrado:</span>
                  <span className="font-mono-numbers font-medium text-neutral-900">
                    {formatBs(weightedAveragePreview.currentCost)}
                  </span>
                </div>
                <div className="flex justify-between border-t border-neutral-200 pt-2">
                  <span className="text-neutral-500">+ Nuevas Unidades:</span>
                  <span className="font-mono-numbers font-medium text-neutral-900">
                    +{quantityNum} u. a {formatBs(unitCostNum)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-500">Nuevo Stock Total:</span>
                  <span className="font-mono-numbers font-bold text-neutral-900">
                    {weightedAveragePreview.newTotalStock} u.
                  </span>
                </div>
                <div className="flex justify-between border-t border-neutral-200 pt-2 text-emerald-900 font-bold">
                  <span>Nuevo Costo Ponderado:</span>
                  <span className="font-mono-numbers text-sm">
                    {formatBs(weightedAveragePreview.weightedAvg)}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Quick Stats */}
          <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-xs">
            <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-500 mb-3">
              Acumulado de Compras
            </h4>
            <div className="space-y-3">
              <div className="flex justify-between items-center text-xs">
                <span className="text-neutral-500">Total Compras Registradas:</span>
                <span className="font-mono-numbers font-bold text-neutral-900">{purchases.length} órdenes</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-neutral-500">Capital Total Invertido:</span>
                <span className="font-mono-numbers font-bold text-neutral-900">{formatBs(totalPurchasesAccumulated)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Historial de Compras de Mercadería */}
      <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <div>
            <h3 className="text-base font-bold text-neutral-900">
              Historial de Compras de Inventario
            </h3>
            <p className="text-xs text-neutral-500">
              Registro histórico de compras a proveedores para auditoría y costeo
            </p>
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-400" />
            <input
              type="text"
              value={searchHistoryQuery}
              onChange={(e) => setSearchHistoryQuery(e.target.value)}
              placeholder="Buscar por proveedor, código..."
              className="w-full rounded-xl border border-neutral-200 py-1.5 pl-9 pr-3 text-xs outline-none focus:border-rose-900"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-neutral-200 bg-neutral-50 font-semibold text-neutral-600">
              <tr>
                <th className="py-3 pl-4 pr-2">Nº Compra</th>
                <th className="px-2 py-3">Fecha</th>
                <th className="px-2 py-3">Proveedor</th>
                <th className="px-2 py-3">Producto</th>
                <th className="px-2 py-3">Categoría</th>
                <th className="px-2 py-3 text-center">Cantidad</th>
                <th className="px-2 py-3 text-right">Costo Unit.</th>
                <th className="py-3 pl-2 pr-4 text-right">Total Compra</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 text-neutral-800">
              {filteredPurchases.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-xs text-neutral-400">
                    No se han registrado compras de mercadería todavía.
                  </td>
                </tr>
              ) : (
                filteredPurchases.map((purchase) => (
                  <tr key={purchase.id} className="hover:bg-neutral-50">
                    <td className="py-3 pl-4 pr-2 font-mono font-bold text-neutral-900">
                      {purchase.purchaseNumber}
                    </td>
                    <td className="px-2 py-3 text-neutral-500">
                      {formatDate(purchase.date)}
                    </td>
                    <td className="px-2 py-3 font-medium text-neutral-900">
                      {purchase.supplier}
                    </td>
                    <td className="px-2 py-3">
                      <div>
                        <span className="font-mono text-[10px] text-rose-950 block">
                          {purchase.productCode}
                        </span>
                        <span className="font-semibold text-neutral-900">
                          {purchase.productName}
                        </span>
                      </div>
                    </td>
                    <td className="px-2 py-3 text-neutral-600">
                      {purchase.category}
                    </td>
                    <td className="px-2 py-3 text-center font-mono-numbers font-bold">
                      +{purchase.quantity} u.
                    </td>
                    <td className="px-2 py-3 text-right font-mono-numbers text-neutral-600">
                      {formatBs(purchase.unitCost)}
                    </td>
                    <td className="py-3 pl-2 pr-4 text-right font-mono-numbers font-bold text-neutral-900">
                      {formatBs(purchase.total)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
