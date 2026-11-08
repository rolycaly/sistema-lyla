import React, { useState, useMemo } from 'react';
import {
  ReceiptText,
  Plus,
  Trash2,
  Calendar,
  Banknote,
  QrCode,
  User,
  Filter,
  Search,
  Settings,
  AlertCircle,
  CheckCircle,
  ListPlus,
  Edit2,
  Tag,
} from 'lucide-react';
import { Expense, PaymentMethod } from '../types';
import { formatBs, round2, formatDateTime, formatDate, formatTime, getTodayDateString } from '../utils/formatters';

interface ExpensesModuleProps {
  expenses: Expense[];
  categories: string[];
  onAddExpense: (expense: Omit<Expense, 'id' | 'date'>) => void;
  onAddMultipleExpenses: (expenses: Array<Omit<Expense, 'id' | 'date'>>) => void;
  onDeleteExpense: (id: string) => void;
  onUpdateCategories: (categories: string[]) => void;
  isShiftOpen?: boolean;
  isShiftClosed?: boolean;
  onTriggerStartShift?: () => void;
}

interface MultiExpenseRow {
  concept: string;
  amount: string;
}

export const ExpensesModule: React.FC<ExpensesModuleProps> = ({
  expenses,
  categories,
  onAddExpense,
  onAddMultipleExpenses,
  onDeleteExpense,
  onUpdateCategories,
  isShiftOpen = true,
  isShiftClosed = false,
  onTriggerStartShift,
}) => {
  // Modes: 'single' | 'batch'
  const [entryMode, setEntryMode] = useState<'single' | 'batch'>('single');

  // Single Form State
  const [singleCategory, setSingleCategory] = useState(categories[0] || 'Alquiler');
  const [singleAmount, setSingleAmount] = useState('');
  const [singleDescription, setSingleDescription] = useState('');
  const [singlePaymentMethod, setSinglePaymentMethod] = useState<PaymentMethod>('Efectivo');
  const [singleResponsible, setSingleResponsible] = useState<'Roly' | 'Keyla'>('Roly');

  // Batch Form State (Registro detallado por categoría)
  const [batchCategory, setBatchCategory] = useState(categories[0] || 'Material de oficina');
  const [batchPaymentMethod, setBatchPaymentMethod] = useState<PaymentMethod>('Efectivo');
  const [batchResponsible, setBatchResponsible] = useState<'Roly' | 'Keyla'>('Roly');
  const [batchRows, setBatchRows] = useState<MultiExpenseRow[]>([
    { concept: '', amount: '' },
    { concept: '', amount: '' },
    { concept: '', amount: '' },
  ]);

  // Categories Manager Modal
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [editingCategoryIdx, setEditingCategoryIdx] = useState<number | null>(null);
  const [editingCategoryName, setEditingCategoryName] = useState('');

  // Table Filters
  const [filterPeriod, setFilterPeriod] = useState<'all' | 'today' | 'week' | 'month' | 'year'>('all');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterResponsible, setFilterResponsible] = useState<string>('all');
  const [filterMethod, setFilterMethod] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const [formError, setFormError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Handle single submit
  const handleSingleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setSuccessMessage('');

    if (!isShiftOpen) {
      setFormError('No se puede registrar gastos de caja. Primero debe abrir la jornada del día desde el módulo de Jornada.');
      return;
    }
    if (isShiftClosed) {
      setFormError('La jornada de hoy se encuentra cerrada. Debe solicitar una reapertura auditada desde el módulo de Jornada para registrar operaciones.');
      return;
    }

    const amountNum = parseFloat(singleAmount);
    if (isNaN(amountNum) || amountNum <= 0) {
      setFormError('Por favor introduzca un monto válido mayor a 0 Bs.');
      return;
    }
    if (!singleDescription.trim()) {
      setFormError('Por favor especifique la descripción detallada del gasto.');
      return;
    }

    onAddExpense({
      category: singleCategory,
      description: singleDescription.trim(),
      amount: round2(amountNum),
      paymentMethod: singlePaymentMethod,
      responsible: singleResponsible,
    });

    setSuccessMessage(`Gasto de ${formatBs(amountNum)} registrado correctamente.`);
    setSingleAmount('');
    setSingleDescription('');
  };

  // Handle batch rows manipulation
  const handleAddBatchRow = () => {
    setBatchRows((prev) => [...prev, { concept: '', amount: '' }]);
  };

  const handleUpdateBatchRow = (index: number, field: keyof MultiExpenseRow, value: string) => {
    setBatchRows((prev) =>
      prev.map((row, i) => (i === index ? { ...row, [field]: value } : row))
    );
  };

  const handleRemoveBatchRow = (index: number) => {
    if (batchRows.length <= 1) return;
    setBatchRows((prev) => prev.filter((_, i) => i !== index));
  };

  // Batch Total calculation (ignoring empty fields)
  const batchTotal = useMemo(() => {
    return round2(
      batchRows.reduce((sum, row) => {
        const val = parseFloat(row.amount);
        return sum + (isNaN(val) || val <= 0 ? 0 : val);
      }, 0)
    );
  }, [batchRows]);

  // Handle Batch Submit (Rule: Empty fields interpreted as zero and DO NOT create ghost records)
  const handleBatchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setSuccessMessage('');

    if (!isShiftOpen) {
      setFormError('No se puede registrar gastos de caja. Primero debe abrir la jornada del día desde el módulo de Jornada.');
      return;
    }
    if (isShiftClosed) {
      setFormError('La jornada de hoy se encuentra cerrada. Debe solicitar una reapertura auditada desde el módulo de Jornada para registrar operaciones.');
      return;
    }

    const validItems: Array<Omit<Expense, 'id' | 'date'>> = [];

    batchRows.forEach((row) => {
      const val = parseFloat(row.amount);
      const trimmedConcept = row.concept.trim();
      if (trimmedConcept && !isNaN(val) && val > 0) {
        validItems.push({
          category: batchCategory,
          description: trimmedConcept,
          amount: round2(val),
          paymentMethod: batchPaymentMethod,
          responsible: batchResponsible,
        });
      }
    });

    if (validItems.length === 0) {
      setFormError('Debe ingresar al menos un concepto con monto mayor a 0 Bs.');
      return;
    }

    onAddMultipleExpenses(validItems);
    setSuccessMessage(`Se registraron ${validItems.length} conceptos detallados por un total de ${formatBs(batchTotal)}.`);
    setBatchRows([
      { concept: '', amount: '' },
      { concept: '', amount: '' },
      { concept: '', amount: '' },
    ]);
  };

  // Category Manager Handlers
  const handleAddCategory = () => {
    const trimmed = newCategoryName.trim();
    if (!trimmed) return;
    if (categories.includes(trimmed)) {
      alert('Esta categoría ya existe.');
      return;
    }
    onUpdateCategories([...categories, trimmed]);
    setNewCategoryName('');
  };

  const handleStartEditCategory = (index: number, name: string) => {
    setEditingCategoryIdx(index);
    setEditingCategoryName(name);
  };

  const handleSaveEditCategory = () => {
    if (editingCategoryIdx === null) return;
    const trimmed = editingCategoryName.trim();
    if (!trimmed) return;
    const updated = [...categories];
    updated[editingCategoryIdx] = trimmed;
    onUpdateCategories(updated);
    setEditingCategoryIdx(null);
    setEditingCategoryName('');
  };

  const handleRemoveCategory = (index: number) => {
    if (categories.length <= 1) {
      alert('Debe mantener al menos una categoría.');
      return;
    }
    const catToRemove = categories[index];
    const hasExpenses = expenses.some((e) => e.category === catToRemove);
    if (hasExpenses && !confirm(`La categoría "${catToRemove}" tiene gastos históricos asociados. ¿Desea removerla de la lista de selección?`)) {
      return;
    }
    const updated = categories.filter((_, i) => i !== index);
    onUpdateCategories(updated);
  };

  // Filtered Expenses for Table
  const filteredExpenses = useMemo(() => {
    const now = new Date();
    const todayStr = getTodayDateString();

    return expenses.filter((e) => {
      // Period filter
      if (filterPeriod === 'today') {
        if (!e.date.startsWith(todayStr)) return false;
      } else if (filterPeriod === 'month') {
        const monthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        if (!e.date.startsWith(monthPrefix)) return false;
      } else if (filterPeriod === 'year') {
        const yearPrefix = `${now.getFullYear()}`;
        if (!e.date.startsWith(yearPrefix)) return false;
      } else if (filterPeriod === 'week') {
        const day = now.getDay();
        const diff = now.getDate() - day + (day === 0 ? -6 : 1);
        const monday = new Date(now.setDate(diff));
        const mondayStr = monday.toISOString().split('T')[0];
        if (e.date < mondayStr) return false;
      }

      // Category
      if (filterCategory !== 'all' && e.category !== filterCategory) return false;

      // Responsible
      if (filterResponsible !== 'all' && e.responsible !== filterResponsible) return false;

      // Method
      if (filterMethod !== 'all' && e.paymentMethod !== filterMethod) return false;

      // Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matches =
          e.description.toLowerCase().includes(q) ||
          e.category.toLowerCase().includes(q) ||
          e.responsible.toLowerCase().includes(q);
        if (!matches) return false;
      }

      return true;
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [expenses, filterPeriod, filterCategory, filterResponsible, filterMethod, searchQuery]);

  const totalFilteredAmount = useMemo(() => {
    return round2(filteredExpenses.reduce((acc, e) => acc + Number(e.amount || 0), 0));
  }, [filteredExpenses]);

  return (
    <div className="space-y-6">
      {/* Header and Controls */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-neutral-900">
            Control de Gastos Operativos
          </h2>
          <p className="text-xs text-neutral-500">
            Registro de egresos de la tienda, desgloses por concepto y responsables (Roly / Keyla)
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsCategoryModalOpen(true)}
            className="flex items-center gap-1.5 rounded-xl border border-neutral-200 bg-white px-3 py-2 text-xs font-semibold text-neutral-700 transition hover:bg-neutral-50"
          >
            <Settings className="h-4 w-4 text-neutral-500" />
            <span>Gestionar Categorías</span>
          </button>
        </div>
      </div>

      {/* Entry Forms Box */}
      <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-xs">
        {/* Toggle Mode: Registro Individual vs Registro Múltiple por Categoría */}
        <div className="flex items-center justify-between border-b border-neutral-100 pb-4 mb-5">
          <div className="flex items-center gap-2">
            <ReceiptText className="h-5 w-5 text-rose-950" />
            <h3 className="text-sm font-bold text-neutral-900">
              {entryMode === 'single' ? 'Registro de Gasto Individual' : 'Registro Detallado por Categoría (Múltiples Conceptos)'}
            </h3>
          </div>

          <div className="flex items-center rounded-xl bg-neutral-100 p-1">
            <button
              type="button"
              onClick={() => setEntryMode('single')}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                entryMode === 'single'
                  ? 'bg-white text-neutral-900 shadow-xs'
                  : 'text-neutral-500 hover:text-neutral-900'
              }`}
            >
              Gasto Único
            </button>
            <button
              type="button"
              onClick={() => setEntryMode('batch')}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                entryMode === 'batch'
                  ? 'bg-white text-neutral-900 shadow-xs'
                  : 'text-neutral-500 hover:text-neutral-900'
              }`}
            >
              Detallado Múltiple
            </button>
          </div>
        </div>

        {formError && (
          <div className="mb-4 flex items-center gap-2 rounded-xl bg-rose-50 p-3 text-xs text-rose-800 border border-rose-200">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{formError}</span>
          </div>
        )}

        {successMessage && (
          <div className="mb-4 flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-xs text-emerald-800 border border-emerald-200">
            <CheckCircle className="h-4 w-4 shrink-0" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* 1. MODO: Gasto Único */}
        {entryMode === 'single' ? (
          <form onSubmit={handleSingleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {/* Categoría */}
              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">
                  Categoría del Gasto *
                </label>
                <select
                  value={singleCategory}
                  onChange={(e) => setSingleCategory(e.target.value)}
                  className="w-full rounded-xl border border-neutral-200 bg-white px-3.5 py-2.5 text-xs font-medium outline-none focus:border-rose-900"
                >
                  {categories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              {/* Monto (Bs) */}
              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">
                  Monto en Bolivianos (Bs) *
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
                    value={singleAmount}
                    onChange={(e) => setSingleAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full rounded-xl border border-neutral-200 py-2.5 pl-10 pr-3.5 font-mono text-xs font-bold outline-none focus:border-rose-900"
                  />
                </div>
              </div>

              {/* Método de Pago */}
              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">
                  Método de Pago *
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setSinglePaymentMethod('Efectivo')}
                    className={`rounded-xl py-2 px-2 text-xs font-bold border transition ${
                      singlePaymentMethod === 'Efectivo'
                        ? 'border-emerald-600 bg-emerald-50 text-emerald-900'
                        : 'border-neutral-200 bg-white text-neutral-600'
                    }`}
                  >
                    Efectivo
                  </button>
                  <button
                    type="button"
                    onClick={() => setSinglePaymentMethod('QR')}
                    className={`rounded-xl py-2 px-2 text-xs font-bold border transition ${
                      singlePaymentMethod === 'QR'
                        ? 'border-blue-600 bg-blue-50 text-blue-900'
                        : 'border-neutral-200 bg-white text-neutral-600'
                    }`}
                  >
                    QR
                  </button>
                </div>
              </div>

              {/* Responsable */}
              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">
                  Responsable del Gasto *
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {(['Roly', 'Keyla'] as const).map((resp) => (
                    <button
                      key={resp}
                      type="button"
                      onClick={() => setSingleResponsible(resp)}
                      className={`rounded-xl py-2 px-2 text-xs font-bold border transition ${
                        singleResponsible === resp
                          ? 'border-rose-900 bg-rose-950 text-white'
                          : 'border-neutral-200 bg-white text-neutral-700'
                      }`}
                    >
                      {resp}
                    </button>
                  ))}
                </div>
              </div>

              {/* Descripción detallada */}
              <div className="sm:col-span-2 lg:col-span-4">
                <label className="block text-xs font-semibold text-neutral-700 mb-1">
                  Descripción Exacta del Gasto *
                </label>
                <input
                  type="text"
                  required
                  value={singleDescription}
                  onChange={(e) => setSingleDescription(e.target.value)}
                  placeholder="Ej: Compra de clips, bolsas de basura, taxi para retiro de mercadería, almuerzo..."
                  className="w-full rounded-xl border border-neutral-200 px-3.5 py-2.5 text-xs font-medium outline-none focus:border-rose-900"
                />
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                className="rounded-xl bg-rose-900 px-6 py-2.5 text-xs font-semibold text-white shadow-xs hover:bg-rose-950 transition"
              >
                Registrar Gasto
              </button>
            </div>
          </form>
        ) : (
          /* 2. MODO: Detallado Múltiple por Categoría */
          <form onSubmit={handleBatchSubmit} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">
                  Categoría General *
                </label>
                <select
                  value={batchCategory}
                  onChange={(e) => setBatchCategory(e.target.value)}
                  className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-xs font-medium"
                >
                  {categories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">
                  Método de Pago *
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setBatchPaymentMethod('Efectivo')}
                    className={`rounded-xl py-2 text-xs font-bold border ${
                      batchPaymentMethod === 'Efectivo'
                        ? 'border-emerald-600 bg-emerald-50 text-emerald-900'
                        : 'border-neutral-200 bg-white text-neutral-600'
                    }`}
                  >
                    Efectivo
                  </button>
                  <button
                    type="button"
                    onClick={() => setBatchPaymentMethod('QR')}
                    className={`rounded-xl py-2 text-xs font-bold border ${
                      batchPaymentMethod === 'QR'
                        ? 'border-blue-600 bg-blue-50 text-blue-900'
                        : 'border-neutral-200 bg-white text-neutral-600'
                    }`}
                  >
                    QR
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">
                  Responsable *
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {(['Roly', 'Keyla'] as const).map((resp) => (
                    <button
                      key={resp}
                      type="button"
                      onClick={() => setBatchResponsible(resp)}
                      className={`rounded-xl py-2 text-xs font-bold border ${
                        batchResponsible === resp
                          ? 'border-rose-900 bg-rose-950 text-white'
                          : 'border-neutral-200 bg-white text-neutral-700'
                      }`}
                    >
                      {resp}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Multiple item concepts */}
            <div className="space-y-2 border-t border-neutral-100 pt-3">
              <span className="text-xs font-bold uppercase tracking-wider text-neutral-500">
                Desglose de Conceptos Individuales ({batchCategory})
              </span>
              <p className="text-[11px] text-neutral-400">
                Cada concepto con valor se guardará como registro independiente para consultas posteriores. Filas vacías cuentan como 0.
              </p>

              <div className="space-y-2 mt-2">
                {batchRows.map((row, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={row.concept}
                      onChange={(e) => handleUpdateBatchRow(index, 'concept', e.target.value)}
                      placeholder={`Concepto #${index + 1} (ej: Clips, Cinta adhesiva, Detergente)`}
                      className="flex-1 rounded-xl border border-neutral-200 px-3 py-2 text-xs"
                    />
                    <div className="relative w-36">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-xs text-neutral-400">
                        Bs
                      </span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={row.amount}
                        onChange={(e) => handleUpdateBatchRow(index, 'amount', e.target.value)}
                        placeholder="0.00"
                        className="w-full rounded-xl border border-neutral-200 py-2 pl-9 pr-3 font-mono text-xs font-bold"
                      />
                    </div>
                    {batchRows.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveBatchRow(index)}
                        className="rounded-lg p-2 text-neutral-400 hover:text-rose-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={handleAddBatchRow}
                  className="flex items-center gap-1.5 text-xs font-semibold text-rose-900 hover:underline"
                >
                  <Plus className="h-4 w-4" />
                  <span>Agregar otra fila</span>
                </button>

                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold text-neutral-700">Total a Registrar:</span>
                  <span className="font-mono-numbers text-lg font-bold text-neutral-900">
                    {formatBs(batchTotal)}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-3 border-t border-neutral-100">
              <button
                type="submit"
                disabled={batchTotal <= 0}
                className={`rounded-xl px-6 py-2.5 text-xs font-semibold text-white shadow-xs transition ${
                  batchTotal <= 0 ? 'bg-neutral-300 cursor-not-allowed' : 'bg-rose-900 hover:bg-rose-950'
                }`}
              >
                Guardar Gastos Detallados
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Historial de Gastos con Filtros */}
      <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <div>
            <h3 className="text-base font-bold text-neutral-900">
              Historial de Gastos Registrados
            </h3>
            <p className="text-xs text-neutral-500">
              Filtrado dinámico por fecha, categoría, responsable y forma de pago
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-neutral-500">Total filtrado:</span>
            <span className="font-mono-numbers text-sm font-bold text-neutral-900 bg-neutral-100 px-3 py-1 rounded-lg">
              {formatBs(totalFilteredAmount)}
            </span>
          </div>
        </div>

        {/* Filter Controls Row */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5 mb-4">
          {/* Period Filter */}
          <select
            value={filterPeriod}
            onChange={(e) => setFilterPeriod(e.target.value as any)}
            className="rounded-xl border border-neutral-200 bg-white px-3 py-2 text-xs font-medium"
          >
            <option value="all">Todo el período</option>
            <option value="today">Solo hoy</option>
            <option value="week">Esta semana</option>
            <option value="month">Este mes</option>
            <option value="year">Este año</option>
          </select>

          {/* Category Filter */}
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="rounded-xl border border-neutral-200 bg-white px-3 py-2 text-xs font-medium"
          >
            <option value="all">Todas las categorías</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          {/* Responsible Filter */}
          <select
            value={filterResponsible}
            onChange={(e) => setFilterResponsible(e.target.value)}
            className="rounded-xl border border-neutral-200 bg-white px-3 py-2 text-xs font-medium"
          >
            <option value="all">Todos los responsables</option>
            <option value="Roly">Roly</option>
            <option value="Keyla">Keyla</option>
          </select>

          {/* Method Filter */}
          <select
            value={filterMethod}
            onChange={(e) => setFilterMethod(e.target.value)}
            className="rounded-xl border border-neutral-200 bg-white px-3 py-2 text-xs font-medium"
          >
            <option value="all">Todos los métodos</option>
            <option value="Efectivo">Efectivo</option>
            <option value="QR">QR</option>
          </select>

          {/* Search input */}
          <div className="relative col-span-2 sm:col-span-1">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar concepto..."
              className="w-full rounded-xl border border-neutral-200 py-2 pl-8 pr-3 text-xs outline-none focus:border-rose-900"
            />
          </div>
        </div>

        {/* Expenses Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-neutral-200 bg-neutral-50 font-semibold text-neutral-600">
              <tr>
                <th className="py-3 pl-4 pr-2">Fecha y Hora</th>
                <th className="px-2 py-3">Categoría</th>
                <th className="px-2 py-3">Descripción Detallada</th>
                <th className="px-2 py-3">Responsable</th>
                <th className="px-2 py-3">Método</th>
                <th className="px-2 py-3 text-right">Monto</th>
                <th className="py-3 pl-2 pr-4 text-right">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 text-neutral-800">
              {filteredExpenses.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-xs text-neutral-400">
                    No se encontraron gastos con los filtros seleccionados.
                  </td>
                </tr>
              ) : (
                filteredExpenses.map((exp) => (
                  <tr key={exp.id} className="hover:bg-neutral-50">
                    <td className="py-3 pl-4 pr-2 text-neutral-500 whitespace-nowrap">
                      {formatDateTime(exp.date)}
                    </td>
                    <td className="px-2 py-3 font-semibold text-neutral-900 whitespace-nowrap">
                      {exp.category}
                    </td>
                    <td className="px-2 py-3 text-neutral-700">
                      {exp.description}
                    </td>
                    <td className="px-2 py-3 whitespace-nowrap">
                      <span className="font-semibold text-neutral-800 bg-neutral-100 px-2 py-0.5 rounded-md text-[11px]">
                        {exp.responsible}
                      </span>
                    </td>
                    <td className="px-2 py-3 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-semibold text-[11px] ${
                          exp.paymentMethod === 'Efectivo'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-blue-100 text-blue-800'
                        }`}
                      >
                        {exp.paymentMethod}
                      </span>
                    </td>
                    <td className="px-2 py-3 text-right font-mono-numbers font-bold text-rose-900 whitespace-nowrap">
                      {formatBs(exp.amount)}
                    </td>
                    <td className="py-3 pl-2 pr-4 text-right">
                      <button
                        onClick={() => {
                          if (confirm(`¿Eliminar gasto "${exp.description}" (${formatBs(exp.amount)})?`)) {
                            onDeleteExpense(exp.id);
                          }
                        }}
                        className="rounded p-1 text-neutral-400 hover:text-rose-600"
                        title="Eliminar gasto"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Administrador de Categorías de Gastos */}
      {isCategoryModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
              <h3 className="font-brand text-base font-bold text-neutral-900">
                Gestionar Categorías de Gastos
              </h3>
              <button
                onClick={() => setIsCategoryModalOpen(false)}
                className="text-neutral-400 hover:text-neutral-700"
              >
                ✕
              </button>
            </div>

            {/* Agregar Categoría */}
            <div className="flex gap-2">
              <input
                type="text"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder="Nueva categoría..."
                className="flex-1 rounded-xl border border-neutral-200 px-3 py-2 text-xs"
              />
              <button
                type="button"
                onClick={handleAddCategory}
                className="rounded-xl bg-rose-900 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-950"
              >
                Añadir
              </button>
            </div>

            {/* Lista de Categorías */}
            <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
              {categories.map((cat, idx) => (
                <div
                  key={cat}
                  className="flex items-center justify-between rounded-xl border border-neutral-100 p-2.5 bg-neutral-50 text-xs"
                >
                  {editingCategoryIdx === idx ? (
                    <div className="flex items-center gap-2 flex-1 mr-2">
                      <input
                        type="text"
                        value={editingCategoryName}
                        onChange={(e) => setEditingCategoryName(e.target.value)}
                        className="w-full rounded border border-neutral-300 px-2 py-1 text-xs"
                      />
                      <button
                        onClick={handleSaveEditCategory}
                        className="text-xs text-emerald-700 font-bold"
                      >
                        OK
                      </button>
                    </div>
                  ) : (
                    <span className="font-medium text-neutral-800">{cat}</span>
                  )}

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleStartEditCategory(idx, cat)}
                      className="rounded p-1 text-neutral-400 hover:text-neutral-800"
                      title="Editar nombre"
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => handleRemoveCategory(idx)}
                      className="rounded p-1 text-neutral-400 hover:text-rose-600"
                      title="Desactivar categoría"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-end pt-3 border-t border-neutral-100">
              <button
                type="button"
                onClick={() => setIsCategoryModalOpen(false)}
                className="rounded-xl border border-neutral-200 px-4 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
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
