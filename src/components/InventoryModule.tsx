import React, { useState, useMemo, useRef } from 'react';
import {
  Plus,
  Search,
  Filter,
  Edit2,
  Trash2,
  Upload,
  Image as ImageIcon,
  Eye,
  EyeOff,
  AlertCircle,
  CheckCircle,
  PackageCheck,
  Tag,
  Boxes,
  X,
} from 'lucide-react';
import { Product, ProductCategory, ProductCategoryItem } from '../types';
import { formatBs, round2, formatDateTime } from '../utils/formatters';
import { DEFAULT_PRODUCT_CATEGORIES } from '../utils/storage';

interface InventoryModuleProps {
  products: Product[];
  productCategories?: ProductCategoryItem[];
  onUpdateProductCategories?: (updated: ProductCategoryItem[], renameMap?: { oldName: string; newName: string }) => void;
  onAddProduct: (product: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onUpdateProduct: (product: Product) => void;
  onDeleteProduct: (id: string) => void;
}

export const InventoryModule: React.FC<InventoryModuleProps> = ({
  products,
  productCategories,
  onUpdateProductCategories,
  onAddProduct,
  onUpdateProduct,
  onDeleteProduct,
}) => {
  // Filters & State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<'Todas' | ProductCategory>('Todas');
  const [stockStatusFilter, setStockStatusFilter] = useState<'all' | 'in_stock' | 'low_stock' | 'out_of_stock'>('all');
  const [showInternalCosts, setShowInternalCosts] = useState(true);

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [deletingProductId, setDeletingProductId] = useState<string | null>(null);

  // Category Administration State
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [newCatNameInput, setNewCatNameInput] = useState('');
  const [catModalError, setCatModalError] = useState('');
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [editingCatName, setEditingCatName] = useState('');

  // Resolved categories list
  const allCategories = useMemo(() => {
    return productCategories && productCategories.length > 0
      ? productCategories
      : DEFAULT_PRODUCT_CATEGORIES;
  }, [productCategories]);

  const activeCategories = useMemo(() => {
    return allCategories.filter((c) => c.active);
  }, [allCategories]);

  // Handlers for Category Management
  const handleAddNewCategory = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setCatModalError('');
    const trimmed = newCatNameInput.trim();
    if (!trimmed) {
      setCatModalError('El nombre de la categoría no puede estar vacío.');
      return;
    }
    const exists = allCategories.some(
      (c) => c.name.trim().toLowerCase() === trimmed.toLowerCase()
    );
    if (exists) {
      setCatModalError(`La categoría "${trimmed}" ya existe en el sistema.`);
      return;
    }

    const newCategoryItem: ProductCategoryItem = {
      id: `cat-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      name: trimmed,
      active: true,
      createdAt: new Date().toISOString(),
    };

    const updated = [...allCategories, newCategoryItem];
    if (onUpdateProductCategories) {
      onUpdateProductCategories(updated);
    }
    setNewCatNameInput('');
  };

  const handleToggleCategoryActive = (catId: string) => {
    const updated = allCategories.map((c) => {
      if (c.id === catId) {
        return { ...c, active: !c.active };
      }
      return c;
    });
    if (onUpdateProductCategories) {
      onUpdateProductCategories(updated);
    }
  };

  const handleStartEditCategory = (cat: ProductCategoryItem) => {
    setEditingCatId(cat.id);
    setEditingCatName(cat.name);
    setCatModalError('');
  };

  const handleSaveEditCategory = (catId: string) => {
    const trimmed = editingCatName.trim();
    if (!trimmed) {
      setCatModalError('El nombre de la categoría no puede estar vacío.');
      return;
    }
    const currentCat = allCategories.find((c) => c.id === catId);
    if (!currentCat) return;

    if (currentCat.name.trim().toLowerCase() !== trimmed.toLowerCase()) {
      const exists = allCategories.some(
        (c) => c.id !== catId && c.name.trim().toLowerCase() === trimmed.toLowerCase()
      );
      if (exists) {
        setCatModalError(`Ya existe otra categoría llamada "${trimmed}".`);
        return;
      }
    }

    const oldName = currentCat.name;
    const updated = allCategories.map((c) => {
      if (c.id === catId) {
        return { ...c, name: trimmed };
      }
      return c;
    });

    if (onUpdateProductCategories) {
      onUpdateProductCategories(updated, { oldName, newName: trimmed });
    }
    setEditingCatId(null);
    setEditingCatName('');
  };

  // Form State
  const [formCategory, setFormCategory] = useState<ProductCategory>('Carteras');
  const [formCode, setFormCode] = useState('');
  const [formName, setFormName] = useState('');
  const [formColor, setFormColor] = useState('');
  const [formColorsList, setFormColorsList] = useState<string[]>([]);
  const [formColorStockMap, setFormColorStockMap] = useState<Record<string, number>>({});
  const [formColorInput, setFormColorInput] = useState('');
  const [formBrand, setFormBrand] = useState('');
  const [formPurchaseCost, setFormPurchaseCost] = useState('');
  const [formSalePrice, setFormSalePrice] = useState('');
  const [formStock, setFormStock] = useState('1');
  const [formImageUrl, setFormImageUrl] = useState('');
  const [formError, setFormError] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Common boutique color recommendations
  const COMMON_COLORS = ['Negro', 'Blanco', 'Dorado', 'Plata', 'Oro Rosa', 'Rojo', 'Beige', 'Café', 'Azul', 'Rosa', 'Verde'];

  const handleAddColorChip = (colorName: string) => {
    const trimmed = colorName.trim();
    if (!trimmed) return;
    const parts = trimmed.split(',').map((c) => c.trim()).filter(Boolean);
    const updated = Array.from(new Set([...formColorsList, ...parts]));
    setFormColorsList(updated);
    setFormColor(updated.join(', '));
    setFormColorInput('');
    setFormColorStockMap((prev) => {
      const next = { ...prev };
      parts.forEach((p) => {
        if (next[p] === undefined) next[p] = 1;
      });
      const total = Object.values(next).reduce((s, v) => s + (Number(v) || 0), 0);
      setFormStock(total.toString());
      return next;
    });
  };

  const handleRemoveColorChip = (colorToRemove: string) => {
    const updated = formColorsList.filter((c) => c !== colorToRemove);
    setFormColorsList(updated);
    setFormColor(updated.join(', '));
    setFormColorStockMap((prev) => {
      const next = { ...prev };
      delete next[colorToRemove];
      const total = Object.values(next).reduce((s, v) => s + (Number(v) || 0), 0);
      setFormStock(total > 0 ? total.toString() : '0');
      return next;
    });
  };

  const handleUpdateColorQuantity = (col: string, qty: number) => {
    const safeQty = Math.max(0, qty);
    setFormColorStockMap((prev) => {
      const next = { ...prev, [col]: safeQty };
      const total = Object.values(next).reduce((s, v) => s + (Number(v) || 0), 0);
      setFormStock(total.toString());
      return next;
    });
  };

  // Open Add Modal
  const handleOpenAddModal = () => {
    setFormCategory(activeCategories[0]?.name || 'Carteras');
    setFormCode(`PROD-${Math.floor(1000 + Math.random() * 9000)}`);
    setFormName('');
    setFormColor('');
    setFormColorsList([]);
    setFormColorStockMap({});
    setFormColorInput('');
    setFormBrand('');
    setFormPurchaseCost('');
    setFormSalePrice('');
    setFormStock('1');
    setFormImageUrl('');
    setFormError('');
    setIsAddModalOpen(true);
  };

  // Open Edit Modal
  const handleOpenEditModal = (p: Product) => {
    setEditingProduct(p);
    setFormCategory(p.category);
    setFormCode(p.code);
    setFormName(p.name);
    setFormColor(p.color);
    const initialColors =
      p.availableColors && p.availableColors.length > 0
        ? p.availableColors
        : p.color
        ? p.color.split(',').map((c) => c.trim()).filter(Boolean)
        : [];
    setFormColorsList(initialColors);

    const stockMap: Record<string, number> = p.colorStock ? { ...p.colorStock } : {};
    if (Object.keys(stockMap).length === 0 && initialColors.length > 0) {
      const perCol = Math.floor(p.stock / initialColors.length);
      let rem = p.stock % initialColors.length;
      initialColors.forEach((c) => {
        stockMap[c] = perCol + (rem > 0 ? 1 : 0);
        if (rem > 0) rem--;
      });
    }
    setFormColorStockMap(stockMap);

    setFormColorInput('');
    setFormBrand(p.brand);
    setFormPurchaseCost(p.purchaseCost.toString());
    setFormSalePrice(p.salePrice.toString());
    setFormStock(p.stock.toString());
    setFormImageUrl(p.imageUrl || '');
    setFormError('');
  };

  // Image Upload handler (reads local file to base64)
  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setFormError('Por favor seleccione un archivo de imagen válido.');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setFormError('La imagen no debe superar los 5MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      setFormImageUrl(result);
      setFormError('');
    };
    reader.readAsDataURL(file);
  };

  // Save Add
  const handleSaveAdd = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    const trimmedCode = formCode.trim().toUpperCase();
    const trimmedName = formName.trim();
    const purchaseCostNum = parseFloat(formPurchaseCost);
    const salePriceNum = parseFloat(formSalePrice);
    const stockNum = parseInt(formStock, 10);

    if (!trimmedCode) {
      setFormError('El código del producto es obligatorio.');
      return;
    }
    if (products.some((p) => p.code.toUpperCase() === trimmedCode)) {
      setFormError(`El código "${trimmedCode}" ya existe. Por favor use un código único.`);
      return;
    }
    if (!trimmedName) {
      setFormError('El nombre o referencia del producto es obligatorio.');
      return;
    }
    if (isNaN(purchaseCostNum) || purchaseCostNum < 0) {
      setFormError('El costo de compra debe ser un número mayor o igual a 0.');
      return;
    }
    if (isNaN(salePriceNum) || salePriceNum <= 0) {
      setFormError('El precio de venta debe ser mayor a 0.');
      return;
    }
    if (isNaN(stockNum) || stockNum < 0) {
      setFormError('La cantidad disponible debe ser un número entero mayor o igual a 0.');
      return;
    }

    const finalColors =
      formColorsList.length > 0
        ? formColorsList
        : formColorInput.trim()
        ? formColorInput.split(',').map((c) => c.trim()).filter(Boolean)
        : formColor.trim()
        ? formColor.split(',').map((c) => c.trim()).filter(Boolean)
        : [];
    const colorStr = finalColors.join(', ') || formColor.trim();

    // Calculate colorStock from formColorStockMap
    let calculatedColorStock: Record<string, number> = {};
    if (finalColors.length > 0) {
      finalColors.forEach((c) => {
        calculatedColorStock[c] = Number(formColorStockMap[c]) || 0;
      });
      const sumColors = Object.values(calculatedColorStock).reduce((a, b) => a + b, 0);
      if (sumColors === 0 && stockNum > 0) {
        const perCol = Math.floor(stockNum / finalColors.length);
        let rem = stockNum % finalColors.length;
        finalColors.forEach((c) => {
          calculatedColorStock[c] = perCol + (rem > 0 ? 1 : 0);
          if (rem > 0) rem--;
        });
      }
    } else {
      const defaultColor = colorStr || 'Único';
      calculatedColorStock = { [defaultColor]: stockNum };
    }

    const totalCalculatedStock = Object.values(calculatedColorStock).reduce((a, b) => a + b, 0);
    const activeColors = Object.entries(calculatedColorStock)
      .filter(([_, q]) => q > 0)
      .map(([c]) => c);

    onAddProduct({
      code: trimmedCode,
      name: trimmedName,
      category: formCategory,
      color: colorStr,
      availableColors: activeColors.length > 0 ? activeColors : finalColors,
      colorStock: calculatedColorStock,
      brand: formBrand.trim(),
      purchaseCost: round2(purchaseCostNum),
      salePrice: round2(salePriceNum),
      stock: totalCalculatedStock,
      imageUrl: formImageUrl || '',
    });

    setIsAddModalOpen(false);
  };

  // Save Edit
  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct) return;
    setFormError('');

    const trimmedCode = formCode.trim().toUpperCase();
    const trimmedName = formName.trim();
    const purchaseCostNum = parseFloat(formPurchaseCost);
    const salePriceNum = parseFloat(formSalePrice);
    const stockNum = parseInt(formStock, 10);

    if (!trimmedCode) {
      setFormError('El código del producto es obligatorio.');
      return;
    }
    // Check code duplication with other products
    if (products.some((p) => p.id !== editingProduct.id && p.code.toUpperCase() === trimmedCode)) {
      setFormError(`El código "${trimmedCode}" ya pertenece a otro producto.`);
      return;
    }
    if (!trimmedName) {
      setFormError('El nombre o referencia del producto es obligatorio.');
      return;
    }
    if (isNaN(purchaseCostNum) || purchaseCostNum < 0) {
      setFormError('El costo de compra debe ser un número mayor o igual a 0.');
      return;
    }
    if (isNaN(salePriceNum) || salePriceNum <= 0) {
      setFormError('El precio de venta debe ser mayor a 0.');
      return;
    }
    if (isNaN(stockNum) || stockNum < 0) {
      setFormError('La cantidad disponible debe ser un número entero mayor o igual a 0.');
      return;
    }

    const finalColors =
      formColorsList.length > 0
        ? formColorsList
        : formColorInput.trim()
        ? formColorInput.split(',').map((c) => c.trim()).filter(Boolean)
        : formColor.trim()
        ? formColor.split(',').map((c) => c.trim()).filter(Boolean)
        : [];
    const colorStr = finalColors.join(', ') || formColor.trim();

    let calculatedColorStock: Record<string, number> = {};
    if (finalColors.length > 0) {
      finalColors.forEach((c) => {
        calculatedColorStock[c] = Number(formColorStockMap[c]) ?? 0;
      });
      const sumColors = Object.values(calculatedColorStock).reduce((a, b) => a + b, 0);
      if (sumColors === 0 && stockNum > 0) {
        const perCol = Math.floor(stockNum / finalColors.length);
        let rem = stockNum % finalColors.length;
        finalColors.forEach((c) => {
          calculatedColorStock[c] = perCol + (rem > 0 ? 1 : 0);
          if (rem > 0) rem--;
        });
      }
    } else {
      const defaultColor = colorStr || 'Único';
      calculatedColorStock = { [defaultColor]: stockNum };
    }

    const totalCalculatedStock = Object.values(calculatedColorStock).reduce((a, b) => a + b, 0);
    const activeColors = Object.entries(calculatedColorStock)
      .filter(([_, q]) => q > 0)
      .map(([c]) => c);

    onUpdateProduct({
      ...editingProduct,
      code: trimmedCode,
      name: trimmedName,
      category: formCategory,
      color: colorStr,
      availableColors: activeColors.length > 0 ? activeColors : finalColors,
      colorStock: calculatedColorStock,
      brand: formBrand.trim(),
      purchaseCost: round2(purchaseCostNum),
      salePrice: round2(salePriceNum),
      stock: totalCalculatedStock,
      imageUrl: formImageUrl || editingProduct.imageUrl || '',
      updatedAt: new Date().toISOString(),
    });

    setEditingProduct(null);
  };

  // Filter products
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      // Search
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.code.toLowerCase().includes(q) ||
        p.brand.toLowerCase().includes(q) ||
        p.color.toLowerCase().includes(q) ||
        (p.availableColors && p.availableColors.some((c) => c.toLowerCase().includes(q)));

      if (!matchesSearch) return false;

      // Category
      if (selectedCategoryFilter !== 'Todas' && p.category !== selectedCategoryFilter) {
        return false;
      }

      // Stock status
      if (stockStatusFilter === 'in_stock' && p.stock <= 0) return false;
      if (stockStatusFilter === 'low_stock' && (p.stock <= 0 || p.stock > 3)) return false;
      if (stockStatusFilter === 'out_of_stock' && p.stock > 0) return false;

      return true;
    });
  }, [products, searchQuery, selectedCategoryFilter, stockStatusFilter]);

  // Inventory value summary
  const inventorySummary = useMemo(() => {
    let totalItems = 0;
    let totalCostVal = 0;
    let totalRetailVal = 0;

    products.forEach((p) => {
      totalItems += p.stock;
      totalCostVal += p.stock * p.purchaseCost;
      totalRetailVal += p.stock * p.salePrice;
    });

    return {
      totalItems,
      totalCostVal: round2(totalCostVal),
      totalRetailVal: round2(totalRetailVal),
      potentialProfit: round2(totalRetailVal - totalCostVal),
    };
  }, [products]);

  return (
    <div className="space-y-6">
      {/* Header and Controls */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-neutral-900">
            Inventario de Productos
          </h2>
          <p className="text-xs text-neutral-500">
            Registro manual, control de stock y costos de adquisición en bolivianos (Bs)
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => setShowInternalCosts(!showInternalCosts)}
            className="flex items-center gap-1.5 rounded-xl border border-neutral-200 bg-white px-3 py-2 text-xs font-semibold text-neutral-700 transition hover:bg-neutral-50"
            title="Alternar visibilidad del costo de compra interno"
          >
            {showInternalCosts ? (
              <>
                <EyeOff className="h-4 w-4 text-neutral-500" />
                <span>Ocultar Costos</span>
              </>
            ) : (
              <>
                <Eye className="h-4 w-4 text-neutral-500" />
                <span>Mostrar Costos</span>
              </>
            )}
          </button>

          <button
            onClick={() => setIsCategoryModalOpen(true)}
            className="flex items-center gap-1.5 rounded-xl border border-neutral-300 bg-white px-3.5 py-2.5 text-xs font-semibold text-neutral-800 shadow-2xs transition hover:bg-neutral-50 active:scale-95"
            title="Administrar categorías de productos"
          >
            <Tag className="h-4 w-4 text-rose-900" />
            <span>Agregar categoría</span>
          </button>

          <button
            onClick={handleOpenAddModal}
            className="flex items-center gap-2 rounded-xl bg-rose-900 px-4 py-2.5 text-xs font-semibold text-white shadow-xs transition hover:bg-rose-950"
          >
            <Plus className="h-4 w-4" />
            <span>Agregar Producto</span>
          </button>
        </div>
      </div>

      {/* Summary KPI Strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-xs">
          <span className="text-xs text-neutral-500">Unidades en Tienda</span>
          <p className="mt-1 font-mono-numbers text-xl font-bold text-neutral-900">
            {inventorySummary.totalItems} u.
          </p>
          <span className="text-[11px] text-neutral-400">Total físico</span>
        </div>

        <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-xs">
          <span className="text-xs text-neutral-500">Valor al Costo</span>
          <p className="mt-1 font-mono-numbers text-xl font-bold text-neutral-900">
            {showInternalCosts ? formatBs(inventorySummary.totalCostVal) : '••••••'}
          </p>
          <span className="text-[11px] text-neutral-400">Capital invertido</span>
        </div>

        <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-xs">
          <span className="text-xs text-neutral-500">Valor de Venta Total</span>
          <p className="mt-1 font-mono-numbers text-xl font-bold text-emerald-800">
            {formatBs(inventorySummary.totalRetailVal)}
          </p>
          <span className="text-[11px] text-neutral-400">Ingreso potencial</span>
        </div>

        <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-xs">
          <span className="text-xs text-neutral-500">Margen Potencial</span>
          <p className="mt-1 font-mono-numbers text-xl font-bold text-neutral-900">
            {showInternalCosts ? formatBs(inventorySummary.potentialProfit) : '••••••'}
          </p>
          <span className="text-[11px] text-neutral-400">Utilidad bruta esperada</span>
        </div>
      </div>

      {/* Search and Filters Bar */}
      <div className="flex flex-col gap-3 rounded-2xl border border-neutral-200 bg-white p-4 shadow-xs lg:flex-row lg:items-center lg:justify-between">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por código, nombre (ej: Reloj rojo, Cartera Carbella), marca o color..."
            className="w-full rounded-xl border border-neutral-200 bg-neutral-50/50 py-2.5 pl-10 pr-4 text-xs font-medium text-neutral-900 outline-none transition focus:border-rose-900 focus:bg-white"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Category Tabs */}
          <div className="flex flex-wrap items-center rounded-xl bg-neutral-100 p-1 gap-0.5">
            {['Todas', ...activeCategories.map((c) => c.name)].map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategoryFilter(cat)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  selectedCategoryFilter === cat
                    ? 'bg-white text-neutral-900 shadow-xs'
                    : 'text-neutral-500 hover:text-neutral-900'
                }`}
              >
                {cat}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setIsCategoryModalOpen(true)}
              className="rounded-lg px-2 py-1 text-xs font-bold text-rose-900 hover:bg-rose-50 transition"
              title="Administrar categorías"
            >
              +
            </button>
          </div>

          {/* Stock Filter */}
          <select
            value={stockStatusFilter}
            onChange={(e) => setStockStatusFilter(e.target.value as any)}
            className="rounded-xl border border-neutral-200 bg-white px-3 py-2 text-xs font-medium text-neutral-700 outline-none transition focus:border-rose-900"
          >
            <option value="all">Todas las existencias</option>
            <option value="in_stock">Solo disponibles</option>
            <option value="low_stock">Stock bajo (≤ 3)</option>
            <option value="out_of_stock">Agotados (0)</option>
          </select>
        </div>
      </div>

      {/* Products Table */}
      <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-neutral-200 bg-neutral-50 font-semibold text-neutral-600">
              <tr>
                <th className="py-3.5 pl-5 pr-3">Producto</th>
                <th className="px-3 py-3.5">Categoría</th>
                <th className="px-3 py-3.5">Detalles</th>
                <th className="px-3 py-3.5 text-center">Existencias</th>
                {showInternalCosts && (
                  <th className="px-3 py-3.5 text-right">Costo Compra (Interno)</th>
                )}
                <th className="px-3 py-3.5 text-right">Precio Venta</th>
                {showInternalCosts && (
                  <th className="px-3 py-3.5 text-right">Margen Unitario</th>
                )}
                <th className="py-3.5 pl-3 pr-5 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 text-neutral-800">
              {filteredProducts.length === 0 ? (
                <tr>
                  <td
                    colSpan={showInternalCosts ? 8 : 6}
                    className="py-12 text-center text-xs text-neutral-400"
                  >
                    No se encontraron productos con los criterios especificados.
                  </td>
                </tr>
              ) : (
                filteredProducts.map((p) => {
                  const unitMargin = p.salePrice - p.purchaseCost;
                  const isLow = p.stock > 0 && p.stock <= 3;
                  const isOut = p.stock === 0;

                  return (
                    <tr key={p.id} className="transition hover:bg-neutral-50/70">
                      {/* Product Column with Photo */}
                      <td className="py-3 pl-5 pr-3">
                        <div className="flex items-center gap-3">
                          <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl border border-neutral-200 bg-neutral-100">
                            {p.imageUrl ? (
                              <img
                                src={p.imageUrl}
                                alt={p.name}
                                className="h-full w-full object-cover"
                                referrerPolicy="no-referrer"
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-neutral-400">
                                <ImageIcon className="h-5 w-5" />
                              </div>
                            )}
                          </div>
                          <div>
                            <span className="font-mono text-[11px] font-semibold text-rose-950">
                              {p.code}
                            </span>
                            <h4 className="font-semibold text-neutral-900">
                              {p.name}
                            </h4>
                          </div>
                        </div>
                      </td>

                      {/* Category */}
                      <td className="px-3 py-3 text-neutral-600">
                        {p.category}
                      </td>

                      {/* Brand & Colores */}
                      <td className="px-3 py-3 text-neutral-600">
                        <div>
                          <span className="font-semibold text-neutral-800">{p.brand || '—'}</span>
                          <div className="mt-1 flex flex-wrap gap-1">
                            {p.colorStock && Object.keys(p.colorStock).length > 0 ? (
                              Object.entries(p.colorStock).map(([col, qty]) => (
                                <span
                                  key={col}
                                  className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium border ${
                                    qty === 0
                                      ? 'bg-rose-50 text-rose-700 border-rose-200 line-through opacity-75'
                                      : 'bg-neutral-100 text-neutral-800 border-neutral-200'
                                  }`}
                                  title={`${col}: ${qty} unidades`}
                                >
                                  <span>{col}</span>
                                  <span className="font-mono font-bold">({qty})</span>
                                </span>
                              ))
                            ) : p.availableColors && p.availableColors.length > 0 ? (
                              p.availableColors.map((col, idx) => (
                                <span
                                  key={idx}
                                  className="inline-flex items-center rounded-md bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium text-neutral-700 border border-neutral-200"
                                >
                                  {col}
                                </span>
                              ))
                            ) : p.color ? (
                              <span className="text-xs text-neutral-500">{p.color}</span>
                            ) : (
                              <span className="text-xs text-neutral-400">—</span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Stock / Existencias */}
                      <td className="px-3 py-3 text-center">
                        <span
                          className={`font-mono-numbers inline-block rounded-md px-2.5 py-1 text-xs font-bold ${
                            isOut
                              ? 'bg-rose-100 text-rose-800'
                              : isLow
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-neutral-100 text-neutral-800'
                          }`}
                        >
                          {p.stock} unid.
                        </span>
                        {isOut && (
                          <span className="block text-[10px] font-medium text-rose-600 mt-0.5">
                            Agotado
                          </span>
                        )}
                        {isLow && (
                          <span className="block text-[10px] font-medium text-amber-600 mt-0.5">
                            Stock Bajo
                          </span>
                        )}
                      </td>

                      {/* Costo de compra interno */}
                      {showInternalCosts && (
                        <td className="px-3 py-3 text-right font-mono-numbers text-neutral-600">
                          {formatBs(p.purchaseCost)}
                        </td>
                      )}

                      {/* Precio de venta */}
                      <td className="px-3 py-3 text-right font-mono-numbers font-bold text-neutral-900">
                        {formatBs(p.salePrice)}
                      </td>

                      {/* Margen */}
                      {showInternalCosts && (
                        <td className="px-3 py-3 text-right font-mono-numbers font-semibold text-emerald-700">
                          +{formatBs(unitMargin)}
                        </td>
                      )}

                      {/* Actions */}
                      <td className="py-3 pl-3 pr-5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => handleOpenEditModal(p)}
                            className="rounded-lg p-1.5 text-neutral-500 hover:bg-neutral-200 hover:text-neutral-900"
                            title="Editar producto"
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => setDeletingProductId(p.id)}
                            className="rounded-lg p-1.5 text-rose-600 hover:bg-rose-100 hover:text-rose-900"
                            title="Eliminar producto"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Agregar / Editar Producto */}
      {(isAddModalOpen || editingProduct) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-2xl rounded-2xl bg-white shadow-xl max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-neutral-200 px-6 py-4">
              <h3 className="font-brand text-lg font-bold text-neutral-900">
                {isAddModalOpen ? 'Agregar Nuevo Producto al Inventario' : `Editar Producto: ${editingProduct?.name}`}
              </h3>
              <button
                onClick={() => {
                  setIsAddModalOpen(false);
                  setEditingProduct(null);
                }}
                className="rounded-lg p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={isAddModalOpen ? handleSaveAdd : handleSaveEdit} className="p-6 space-y-5">
              {formError && (
                <div className="flex items-center gap-2 rounded-xl bg-rose-50 p-3 text-xs text-rose-800 border border-rose-200">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* 1. Selector de Tipo de Producto */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-bold uppercase tracking-wider text-neutral-600">
                    1. Seleccione la Categoría de Producto *
                  </label>
                  <button
                    type="button"
                    onClick={() => setIsCategoryModalOpen(true)}
                    className="text-[11px] font-semibold text-rose-900 hover:text-rose-950 flex items-center gap-1"
                  >
                    <Plus className="h-3 w-3" />
                    <span>Administrar Categorías</span>
                  </button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {activeCategories.map((catItem) => {
                    const isSelected = formCategory.trim().toLowerCase() === catItem.name.trim().toLowerCase();
                    return (
                      <button
                        type="button"
                        key={catItem.id || catItem.name}
                        onClick={() => setFormCategory(catItem.name)}
                        className={`flex flex-col items-center justify-center rounded-xl border p-3.5 text-center transition ${
                          isSelected
                            ? 'border-rose-900 bg-rose-950 text-white shadow-xs font-bold'
                            : 'border-neutral-200 bg-white text-neutral-700 hover:border-neutral-300 hover:bg-neutral-50 font-medium'
                        }`}
                      >
                        <span className="text-xs font-bold">{catItem.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 2. Form Fields Grid */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {/* Código */}
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">
                    Código del Producto *
                  </label>
                  <input
                    type="text"
                    required
                    value={formCode}
                    onChange={(e) => setFormCode(e.target.value)}
                    placeholder="Ej: CAR-010, REL-005, JOY-020"
                    className="w-full rounded-xl border border-neutral-200 bg-white px-3.5 py-2.5 text-xs uppercase font-mono font-bold outline-none focus:border-rose-900"
                  />
                  <p className="text-[10px] text-neutral-400 mt-1">Identificador único en inventario</p>
                </div>

                {/* Nombre o Referencia */}
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">
                    Nombre o Referencia *
                  </label>
                  <input
                    type="text"
                    required
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="Ej: Reloj rojo, Cartera Carbella, Collar tulipán"
                    className="w-full rounded-xl border border-neutral-200 bg-white px-3.5 py-2.5 text-xs font-medium outline-none focus:border-rose-900"
                  />
                  <p className="text-[10px] text-neutral-400 mt-1">Nombre comercial descriptivo</p>
                </div>

                {/* Marca */}
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">
                    Marca
                  </label>
                  <input
                    type="text"
                    value={formBrand}
                    onChange={(e) => setFormBrand(e.target.value)}
                    placeholder="Ej: Carbella, Aurelian, Lyla Atelier"
                    className="w-full rounded-xl border border-neutral-200 bg-white px-3.5 py-2.5 text-xs font-medium outline-none focus:border-rose-900"
                  />
                  <p className="text-[10px] text-neutral-400 mt-1">Marca o procedencia</p>
                </div>

                {/* Colores Disponibles para este mismo código */}
                <div className="sm:col-span-2 rounded-xl border border-neutral-200 bg-neutral-50/80 p-3.5">
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-bold text-neutral-800">
                      Colores Disponibles en este Código de Producto
                    </label>
                    <span className="text-[11px] text-neutral-500 font-medium">
                      {formColorsList.length} color{formColorsList.length === 1 ? '' : 'es'} seleccionado{formColorsList.length === 1 ? '' : 's'}
                    </span>
                  </div>
                  <p className="text-[11px] text-neutral-500 mb-2.5">
                    Permite definir todos los colores que existen para este modelo (ej. Negro, Dorado, Beige, Rojo). Al vender o reservar, podrá elegir cuál se lleva la clienta.
                  </p>

                  {/* Input y botón agregar */}
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={formColorInput}
                      onChange={(e) => setFormColorInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddColorChip(formColorInput);
                        }
                      }}
                      placeholder="Escriba un color (ej: Negro, Oro rosa) o varios separados por coma..."
                      className="flex-1 rounded-xl border border-neutral-300 bg-white px-3.5 py-2 text-xs font-medium outline-none focus:border-rose-900"
                    />
                    <button
                      type="button"
                      onClick={() => handleAddColorChip(formColorInput)}
                      className="rounded-xl bg-neutral-900 px-4 py-2 text-xs font-semibold text-white hover:bg-neutral-800 transition active:scale-95"
                    >
                      + Agregar Color
                    </button>
                  </div>

                  {/* Sugerencias Rápidas */}
                  <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                    <span className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider mr-1">
                      Sugerencias:
                    </span>
                    {COMMON_COLORS.map((col) => {
                      const alreadyAdded = formColorsList.includes(col);
                      return (
                        <button
                          type="button"
                          key={col}
                          onClick={() => handleAddColorChip(col)}
                          disabled={alreadyAdded}
                          className={`rounded-lg px-2 py-0.5 text-[11px] font-medium transition ${
                            alreadyAdded
                              ? 'bg-neutral-200 text-neutral-400 cursor-not-allowed'
                              : 'bg-white border border-neutral-300 text-neutral-700 hover:border-neutral-400 hover:bg-neutral-100 active:scale-95'
                          }`}
                        >
                          + {col}
                        </button>
                      );
                    })}
                  </div>

                  {/* Badges y Stock Individual por Color */}
                  {formColorsList.length > 0 && (
                    <div className="mt-3 space-y-2 border-t border-neutral-200 pt-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-neutral-800">
                          Inventario físico por color:
                        </span>
                        <span className="text-[10px] text-neutral-500">
                          Total: <strong className="text-neutral-900 font-mono">{Object.values(formColorStockMap).reduce((s, v) => s + (Number(v) || 0), 0)} u.</strong>
                        </span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {formColorsList.map((col) => (
                          <div
                            key={col}
                            className="flex items-center justify-between gap-1.5 rounded-xl border border-neutral-200 bg-white p-2 shadow-2xs"
                          >
                            <span className="truncate text-xs font-semibold text-neutral-800" title={col}>
                              {col}
                            </span>
                            <div className="flex items-center gap-1">
                              <input
                                type="number"
                                min="0"
                                step="1"
                                value={formColorStockMap[col] ?? 0}
                                onChange={(e) => handleUpdateColorQuantity(col, parseInt(e.target.value, 10) || 0)}
                                className="w-12 rounded-lg border border-neutral-300 px-1.5 py-1 text-center font-mono text-xs font-bold outline-none focus:border-rose-900"
                                title="Unidades de este color"
                              />
                              <button
                                type="button"
                                onClick={() => handleRemoveColorChip(col)}
                                className="text-neutral-400 hover:text-rose-600 transition p-0.5"
                                title={`Quitar color ${col}`}
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Costo de compra (Bs) */}
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">
                    Costo de Compra (Bs) * <span className="text-neutral-400 font-normal">(Interno)</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-mono text-xs text-neutral-400">
                      Bs
                    </span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      required
                      value={formPurchaseCost}
                      onChange={(e) => setFormPurchaseCost(e.target.value)}
                      placeholder="0.00"
                      className="w-full rounded-xl border border-neutral-200 bg-white py-2.5 pl-10 pr-3.5 font-mono text-xs font-bold outline-none focus:border-rose-900"
                    />
                  </div>
                  <p className="text-[10px] text-neutral-400 mt-1">Nunca se mostrará en el módulo de ventas</p>
                </div>

                {/* Precio de venta (Bs) */}
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">
                    Precio de Venta al Público (Bs) *
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
                      value={formSalePrice}
                      onChange={(e) => setFormSalePrice(e.target.value)}
                      placeholder="0.00"
                      className="w-full rounded-xl border border-neutral-200 bg-white py-2.5 pl-10 pr-3.5 font-mono text-xs font-bold outline-none focus:border-rose-900"
                    />
                  </div>
                  <p className="text-[10px] text-neutral-400 mt-1">Precio cobrado al cliente en tienda</p>
                </div>

                {/* Cantidad disponible */}
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">
                    Cantidad Disponible (Stock inicial) *
                  </label>
                  <input
                    type="number"
                    step="1"
                    min="0"
                    required
                    value={formStock}
                    onChange={(e) => setFormStock(e.target.value)}
                    placeholder="1"
                    className="w-full rounded-xl border border-neutral-200 bg-white px-3.5 py-2.5 font-mono text-xs font-bold outline-none focus:border-rose-900"
                  />
                  <p className="text-[10px] text-neutral-400 mt-1">Número de unidades físicas disponibles (1, 2, 3...)</p>
                </div>
              </div>

              {/* Fotografía del Producto (Upload desde archivos locales + Vista previa) */}
              <div className="border-t border-neutral-200 pt-4">
                <label className="block text-xs font-semibold text-neutral-700 mb-2">
                  Fotografía del Producto (Carga desde archivo local)
                </label>

                <div className="flex flex-col sm:flex-row items-center gap-4">
                  {/* Vista Previa */}
                  <div className="h-28 w-28 shrink-0 overflow-hidden rounded-2xl border-2 border-dashed border-neutral-300 bg-neutral-50 flex items-center justify-center">
                    {formImageUrl ? (
                      <img
                        src={formImageUrl}
                        alt="Vista previa"
                        className="h-full w-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="text-center p-2 text-neutral-400">
                        <ImageIcon className="h-6 w-6 mx-auto mb-1" />
                        <span className="text-[10px]">Sin foto</span>
                      </div>
                    )}
                  </div>

                  {/* Upload Controls */}
                  <div className="space-y-2 flex-1">
                    <input
                      type="file"
                      ref={fileInputRef}
                      accept="image/*"
                      onChange={handleImageFileChange}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="flex items-center gap-2 rounded-xl border border-neutral-300 bg-neutral-50 px-4 py-2.5 text-xs font-semibold text-neutral-800 transition hover:bg-neutral-100"
                    >
                      <Upload className="h-4 w-4" />
                      <span>Subir foto desde la computadora</span>
                    </button>
                    {formImageUrl && (
                      <button
                        type="button"
                        onClick={() => setFormImageUrl('')}
                        className="block text-[11px] text-rose-600 hover:underline"
                      >
                        Quitar fotografía
                      </button>
                    )}
                    <p className="text-[11px] text-neutral-400">
                      Soporta JPG, PNG, WEBP. Se genera una vista previa instantánea antes de guardar.
                    </p>
                  </div>
                </div>
              </div>

              {/* Modal Buttons */}
              <div className="flex items-center justify-end gap-3 border-t border-neutral-200 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setIsAddModalOpen(false);
                    setEditingProduct(null);
                  }}
                  className="rounded-xl border border-neutral-200 px-4 py-2 text-xs font-semibold text-neutral-600 hover:bg-neutral-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-rose-900 px-6 py-2.5 text-xs font-semibold text-white shadow-xs hover:bg-rose-950 transition"
                >
                  {isAddModalOpen ? 'Guardar Producto' : 'Actualizar Producto'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Confirmar Eliminación */}
      {deletingProductId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-center gap-3 text-rose-600 mb-3">
              <AlertCircle className="h-6 w-6" />
              <h3 className="text-base font-bold text-neutral-900">
                Confirmar Eliminación de Producto
              </h3>
            </div>
            <p className="text-xs text-neutral-600">
              ¿Está seguro de que desea eliminar este producto del inventario? Esta acción no se puede deshacer.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setDeletingProductId(null)}
                className="rounded-xl border border-neutral-200 px-4 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  if (deletingProductId) {
                    onDeleteProduct(deletingProductId);
                    setDeletingProductId(null);
                  }
                }}
                className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-700"
              >
                Sí, Eliminar Producto
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Administrar Categorías de Inventario */}
      {isCategoryModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
              <div className="flex items-center gap-2 text-rose-950">
                <Tag className="h-5 w-5" />
                <h3 className="text-base font-bold text-neutral-900">
                  Administrar Categorías de Inventario
                </h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsCategoryModalOpen(false);
                  setEditingCatId(null);
                  setCatModalError('');
                }}
                className="rounded-lg p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="text-xs text-neutral-500">
              Administre las categorías activas de su boutique. Puede añadir nuevas (ej: Accesorios, Ropa), renombrar existentes o desactivar las que ya no use sin afectar los registros históricos.
            </p>

            {/* Error Message */}
            {catModalError && (
              <div className="flex items-center gap-2 rounded-xl bg-rose-50 p-3 text-xs text-rose-800 border border-rose-200">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{catModalError}</span>
              </div>
            )}

            {/* Formulario Agregar Nueva Categoría */}
            <form onSubmit={handleAddNewCategory} className="rounded-xl border border-neutral-200 bg-neutral-50/70 p-3.5 space-y-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-neutral-700">
                + Agregar Nueva Categoría
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newCatNameInput}
                  onChange={(e) => {
                    setNewCatNameInput(e.target.value);
                    if (catModalError) setCatModalError('');
                  }}
                  placeholder="Ej: Accesorios, Cinturones, Pañuelos..."
                  className="flex-1 rounded-xl border border-neutral-300 bg-white px-3.5 py-2 text-xs font-medium outline-none focus:border-rose-900"
                />
                <button
                  type="submit"
                  className="rounded-xl bg-rose-900 px-4 py-2 text-xs font-bold text-white hover:bg-rose-950 transition active:scale-95 shadow-2xs shrink-0"
                >
                  Agregar categoría
                </button>
              </div>
            </form>

            {/* Lista de Categorías Existentes */}
            <div className="space-y-2">
              <span className="text-xs font-bold uppercase tracking-wider text-neutral-600 block">
                Categorías Registradas ({allCategories.length})
              </span>

              <div className="divide-y divide-neutral-100 rounded-xl border border-neutral-200 bg-white max-h-64 overflow-y-auto">
                {allCategories.map((cat) => {
                  const isEditing = editingCatId === cat.id;
                  const prodsCount = products.filter(
                    (p) => p.category.trim().toLowerCase() === cat.name.trim().toLowerCase()
                  ).length;

                  return (
                    <div key={cat.id} className="p-3 flex items-center justify-between gap-3 text-xs">
                      {isEditing ? (
                        <div className="flex-1 flex items-center gap-2">
                          <input
                            type="text"
                            value={editingCatName}
                            onChange={(e) => setEditingCatName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleSaveEditCategory(cat.id);
                              } else if (e.key === 'Escape') {
                                setEditingCatId(null);
                              }
                            }}
                            className="flex-1 rounded-lg border border-rose-300 px-2.5 py-1 text-xs font-bold outline-none focus:border-rose-900"
                            autoFocus
                          />
                          <button
                            type="button"
                            onClick={() => handleSaveEditCategory(cat.id)}
                            className="rounded-lg bg-rose-900 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-rose-950"
                          >
                            Guardar
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingCatId(null)}
                            className="rounded-lg border border-neutral-200 px-2 py-1 text-[11px] text-neutral-600 hover:bg-neutral-50"
                          >
                            Cancelar
                          </button>
                        </div>
                      ) : (
                        <>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className={`font-bold text-sm ${cat.active ? 'text-neutral-900' : 'text-neutral-400 line-through'}`}>
                                {cat.name}
                              </span>
                              <span className={`rounded-md px-2 py-0.5 text-[10px] font-semibold ${
                                cat.active
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-neutral-200 text-neutral-600'
                              }`}>
                                {cat.active ? 'Activa' : 'Desactivada'}
                              </span>
                            </div>
                            <span className="text-[11px] text-neutral-400">
                              {prodsCount} producto{prodsCount === 1 ? '' : 's'} en inventario
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleStartEditCategory(cat)}
                              className="rounded-lg border border-neutral-200 p-1.5 text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900 transition"
                              title="Editar nombre de categoría"
                            >
                              <Edit2 className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleToggleCategoryActive(cat.id)}
                              className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition ${
                                cat.active
                                  ? 'border border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100'
                                  : 'border border-emerald-300 bg-emerald-50 text-emerald-900 hover:bg-emerald-100'
                              }`}
                              title={cat.active ? 'Desactivar esta categoría' : 'Activar esta categoría'}
                            >
                              {cat.active ? 'Desactivar' : 'Activar'}
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Note & Close button */}
            <div className="rounded-xl bg-amber-50/80 p-3 text-[11px] text-amber-950 border border-amber-200 flex items-start gap-2">
              <span className="text-amber-700 font-bold">ℹ️</span>
              <p>
                <strong>Nota sobre desactivación:</strong> Al desactivar una categoría, no se podrá seleccionar para nuevos productos ni aparecerá en filtros principales, pero los productos, ventas y compras históricas correspondientes se mantendrán intactos.
              </p>
            </div>

            <div className="flex justify-end pt-2 border-t border-neutral-100">
              <button
                type="button"
                onClick={() => {
                  setIsCategoryModalOpen(false);
                  setEditingCatId(null);
                  setCatModalError('');
                }}
                className="rounded-xl bg-neutral-900 px-5 py-2 text-xs font-semibold text-white hover:bg-neutral-800 transition shadow-xs"
              >
                Listo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
