import React, { useState, useEffect } from 'react';
import { PlayCircle, X, Wallet, CheckCircle } from 'lucide-react';
import { ShiftOpening } from '../types';
import { formatBs, round2, getTodayDateString } from '../utils/formatters';

interface StartShiftModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (openingData: ShiftOpening) => void;
  currentOpening?: ShiftOpening;
}

export const StartShiftModal: React.FC<StartShiftModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  currentOpening,
}) => {
  const [cash, setCash] = useState('0');
  const [qr, setQr] = useState('0');
  const [responsible, setResponsible] = useState<'Roly' | 'Keyla'>('Roly');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (isOpen) {
      if (currentOpening) {
        setCash(currentOpening.initialCash.toString());
        setQr(currentOpening.initialQr.toString());
        setResponsible((currentOpening.openedBy as any) || 'Roly');
        setNotes(currentOpening.notes || '');
      } else {
        setCash('');
        setQr('');
        setResponsible('Roly');
        setNotes('');
      }
    }
  }, [isOpen, currentOpening]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cashNum = parseFloat(cash);
    const qrNum = parseFloat(qr);

    const validCash = isNaN(cashNum) || cashNum < 0 ? 0 : round2(cashNum);
    const validQr = isNaN(qrNum) || qrNum < 0 ? 0 : round2(qrNum);
    const todayStr = getTodayDateString();

    onConfirm({
      id: currentOpening?.id || `open-${todayStr}-${Date.now()}`,
      date: todayStr,
      openedAt: currentOpening?.openedAt || new Date().toISOString(),
      openedBy: responsible,
      initialCash: validCash,
      initialQr: validQr,
      totalInitial: round2(validCash + validQr),
      notes: notes.trim() || undefined,
    });

    onClose();
  };

  const total = round2((parseFloat(cash) || 0) + (parseFloat(qr) || 0));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
          <div className="flex items-center gap-2 text-emerald-800">
            <PlayCircle className="h-6 w-6" />
            <h3 className="font-brand text-lg font-bold text-neutral-900">
              {currentOpening ? 'Modificar Apertura de Jornada' : 'Iniciar Jornada - Caja Chica'}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-neutral-700 p-1 rounded-lg"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="text-xs text-neutral-600">
          Introduzca el importe de <strong>caja chica inicial</strong> con el que se empieza a operar en la tienda.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Monto Inicial en Efectivo */}
          <div>
            <label className="block text-xs font-bold text-neutral-800 mb-1">
              1. Monto Inicial en Efectivo (Caja Chica) *
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
                value={cash}
                onChange={(e) => setCash(e.target.value)}
                placeholder="0.00"
                className="w-full rounded-xl border border-neutral-300 py-2.5 pl-10 pr-3.5 font-mono text-sm font-bold text-neutral-900 outline-none focus:border-emerald-600"
              />
            </div>
            <p className="text-[10px] text-neutral-400 mt-1">
              Billetes y monedas en gaveta para dar cambio al cliente
            </p>
          </div>

          {/* Saldo Inicial en QR / Banco */}
          <div>
            <label className="block text-xs font-bold text-neutral-800 mb-1">
              2. Saldo Inicial en QR / Banco (Opcional)
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-mono text-xs text-neutral-400">
                Bs
              </span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={qr}
                onChange={(e) => setQr(e.target.value)}
                placeholder="0.00"
                className="w-full rounded-xl border border-neutral-300 py-2.5 pl-10 pr-3.5 font-mono text-sm font-bold text-neutral-900 outline-none focus:border-blue-600"
              />
            </div>
            <p className="text-[10px] text-neutral-400 mt-1">
              Saldo bancario vinculado al QR (si se desea controlar)
            </p>
          </div>

          {/* Responsable */}
          <div>
            <label className="block text-xs font-bold text-neutral-800 mb-1">
              Responsable que Abre la Jornada *
            </label>
            <div className="grid grid-cols-2 gap-2">
              {(['Roly', 'Keyla'] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setResponsible(r)}
                  className={`rounded-xl py-2 text-xs font-bold border transition ${
                    responsible === r
                      ? 'border-emerald-700 bg-emerald-800 text-white shadow-xs'
                      : 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          {/* Total Calculado en vivo */}
          <div className="rounded-xl bg-neutral-50 p-3 border border-neutral-200 flex justify-between items-center text-xs">
            <span className="font-semibold text-neutral-600">Total Caja Chica Inicial:</span>
            <span className="font-mono-numbers text-base font-bold text-emerald-900">
              {formatBs(total)}
            </span>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-neutral-200 px-4 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="rounded-xl bg-emerald-800 px-5 py-2 text-xs font-semibold text-white hover:bg-emerald-700 transition shadow-xs"
            >
              {currentOpening ? 'Guardar Cambios' : 'Confirmar Inicio de Jornada'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
