import jsPDF from 'jspdf';
import { IncomeStatement, ShiftClose } from '../types';
import { formatBs, formatDate, formatDateTime } from './formatters';

export function exportIncomeStatementToWord(statement: IncomeStatement): void {
  const categoriesHtml = Object.entries(statement.operatingExpenses)
    .map(
      ([cat, amount]) => `
      <p style="margin: 3px 0 3px 20px; font-size: 13px; color: #555555;">
        ${cat}: <span style="font-family: monospace;">-${formatBs(amount)}</span>
      </p>`
    )
    .join('');

  const wordHtml = `
    <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
    <head>
      <meta charset='utf-8'>
      <title>Estado de Resultados - SISTEMA LYLA</title>
      <style>
        body { font-family: 'Segoe UI', Arial, sans-serif; color: #111111; padding: 40px; line-height: 1.6; }
        h1 { font-size: 24px; font-weight: bold; margin-bottom: 2px; }
        .period-line { font-size: 13px; color: #666666; margin-bottom: 30px; }
        .item-block { margin: 20px 0; }
        .item-header { display: flex; justify-content: space-between; font-size: 18px; font-weight: bold; }
        .item-sub { font-size: 12px; color: #666666; margin-top: 2px; }
        .divider { border: 0; border-top: 1px solid #e0e0e0; margin: 16px 0; }
        .divider-thick { border: 0; border-top: 2px solid #111111; margin: 20px 0; }
      </style>
    </head>
    <body>
      <h1>SISTEMA LYLA</h1>
      <div class="period-line">ESTADO DE RESULTADOS · ${statement.periodLabel.toUpperCase()} (${formatDate(statement.startDate)} al ${formatDate(statement.endDate)}) · Santa Cruz de la Sierra, Bolivia</div>

      <table style="width: 100%; border-collapse: collapse;">
        <!-- VENTAS -->
        <tr>
          <td style="padding: 12px 0; font-size: 18px; font-weight: bold;">VENTAS</td>
          <td style="padding: 12px 0; font-size: 18px; font-weight: bold; text-align: right; font-family: monospace;">${formatBs(statement.netSales)}</td>
        </tr>
        <tr>
          <td colspan="2" style="font-size: 12px; color: #666666; padding-bottom: 12px; border-bottom: 1px solid #e0e0e0;">
            Total de lo que se vendió en el período (${statement.salesCount} ventas)
          </td>
        </tr>

        <!-- COSTOS -->
        <tr>
          <td style="padding: 14px 0 0 0; font-size: 18px; font-weight: bold;">COSTOS</td>
          <td style="padding: 14px 0 0 0; font-size: 18px; font-weight: bold; text-align: right; font-family: monospace;">-${formatBs(statement.costOfGoodsSold)}</td>
        </tr>
        <tr>
          <td colspan="2" style="font-size: 12px; color: #666666; padding-bottom: 12px; border-bottom: 1px solid #e0e0e0;">
            Total de lo que costó todo lo que se vendió
          </td>
        </tr>

        <!-- UTILIDAD BRUTA -->
        <tr>
          <td style="padding: 16px 0 0 0; font-size: 20px; font-weight: bold;">UTILIDAD BRUTA</td>
          <td style="padding: 16px 0 0 0; font-size: 20px; font-weight: bold; text-align: right; font-family: monospace;">${formatBs(statement.grossProfit)}</td>
        </tr>
        <tr>
          <td colspan="2" style="font-size: 12px; color: #666666; padding-bottom: 12px; border-bottom: 1px solid #e0e0e0;">
            Resta de las ventas menos los costos (Ventas − Costos)
          </td>
        </tr>

        ${
          statement.retainedDepositsIncome > 0
            ? `
        <!-- INGRESOS POR ADELANTOS RETENIDOS -->
        <tr>
          <td style="padding: 14px 0 0 0; font-size: 18px; font-weight: bold;">INGRESOS POR ADELANTOS RETENIDOS</td>
          <td style="padding: 14px 0 0 0; font-size: 18px; font-weight: bold; text-align: right; font-family: monospace; color: #047857;">+${formatBs(statement.retainedDepositsIncome)}</td>
        </tr>
        <tr>
          <td colspan="2" style="font-size: 12px; color: #666666; padding-bottom: 12px; border-bottom: 1px solid #e0e0e0;">
            100% de señas conservadas por cancelaciones o vencimientos de 7 días (${statement.retainedDepositsCount} reservas)
          </td>
        </tr>
        `
            : ''
        }

        <!-- GASTOS -->
        <tr>
          <td style="padding: 14px 0 0 0; font-size: 18px; font-weight: bold;">GASTOS</td>
          <td style="padding: 14px 0 0 0; font-size: 18px; font-weight: bold; text-align: right; font-family: monospace;">-${formatBs(statement.totalExpenses)}</td>
        </tr>
        <tr>
          <td colspan="2" style="font-size: 12px; color: #666666; padding-bottom: 12px; border-bottom: 2px solid #111111;">
            Total de todos los gastos que se hicieron en el período
            ${categoriesHtml}
          </td>
        </tr>

        <!-- UTILIDAD NETA -->
        <tr>
          <td style="padding: 20px 0 0 0; font-size: 24px; font-weight: bold;">UTILIDAD NETA</td>
          <td style="padding: 20px 0 0 0; font-size: 24px; font-weight: bold; text-align: right; font-family: monospace;">${formatBs(statement.netProfit)}</td>
        </tr>
        <tr>
          <td colspan="2" style="font-size: 12px; color: #666666; padding-top: 4px;">
            Resultado final: Utilidad bruta ${statement.retainedDepositsIncome > 0 ? '+ adelantos retenidos ' : ''}menos gastos (Utilidad Bruta ${statement.retainedDepositsIncome > 0 ? '+ Adelantos ' : ''}− Gastos)
          </td>
        </tr>
      </table>

      <div style="margin-top: 50px; font-size: 11px; color: #888888; border-top: 1px solid #cccccc; padding-top: 10px;">
        SISTEMA LYLA · Santa Cruz de la Sierra, Bolivia · Generado el ${new Date().toLocaleString('es-BO')}
      </div>
    </body>
    </html>
  `;

  const blob = new Blob(['\ufeff', wordHtml], {
    type: 'application/msword',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `LYLA_Estado_Resultados_${statement.periodLabel.replace(/\s+/g, '_')}_${statement.endDate}.doc`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function exportIncomeStatementToPdf(statement: IncomeStatement): void {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const left = 24;
  const right = pageWidth - 24;
  let y = 28;

  // Header sobrio
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(17, 24, 39);
  doc.text('SISTEMA LYLA', left, y);

  y += 7;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(100, 116, 139);
  doc.text(`ESTADO DE RESULTADOS · ${statement.periodLabel.toUpperCase()} (${formatDate(statement.startDate)} al ${formatDate(statement.endDate)})`, left, y);

  y += 5;
  doc.setFontSize(8.5);
  doc.text('Santa Cruz de la Sierra, Bolivia', left, y);

  y += 8;
  doc.setDrawColor(220, 220, 220);
  doc.setLineWidth(0.5);
  doc.line(left, y, right, y);

  y += 12;

  // 1. VENTAS
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(15, 23, 42);
  doc.text('VENTAS', left, y);
  doc.text(formatBs(statement.netSales), right, y, { align: 'right' });

  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text(`Total de lo que se vendio en el periodo (${statement.salesCount} ventas)`, left, y);

  y += 8;
  doc.line(left, y, right, y);
  y += 11;

  // 2. COSTOS
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(15, 23, 42);
  doc.text('COSTOS', left, y);
  doc.text(`-${formatBs(statement.costOfGoodsSold)}`, right, y, { align: 'right' });

  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text('Total de lo que costo todo lo que se vendio', left, y);

  y += 8;
  doc.line(left, y, right, y);
  y += 12;

  // 3. UTILIDAD BRUTA
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(15, 23, 42);
  doc.text('UTILIDAD BRUTA', left, y);
  doc.text(formatBs(statement.grossProfit), right, y, { align: 'right' });

  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text('Resta de las ventas menos los costos (Ventas - Costos)', left, y);

  y += 8;
  doc.line(left, y, right, y);
  y += 11;

  // 3.1 ADELANTOS RETENIDOS (Si existen)
  if (statement.retainedDepositsIncome > 0) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.setTextColor(4, 120, 87);
    doc.text('INGRESOS POR ADELANTOS RETENIDOS', left, y);
    doc.text(`+${formatBs(statement.retainedDepositsIncome)}`, right, y, { align: 'right' });

    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text(`100% senas de reservas canceladas o vencidas (${statement.retainedDepositsCount} reservas)`, left, y);

    y += 8;
    doc.line(left, y, right, y);
    y += 11;
  }

  // 4. GASTOS
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(15, 23, 42);
  doc.text('GASTOS', left, y);
  doc.text(`-${formatBs(statement.totalExpenses)}`, right, y, { align: 'right' });

  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text('Total de todos los gastos que se hicieron en el periodo', left, y);

  // Desglose de gastos
  const expenseEntries = Object.entries(statement.operatingExpenses);
  if (expenseEntries.length > 0) {
    y += 5;
    doc.setFontSize(8.5);
    doc.setTextColor(120, 120, 120);
    expenseEntries.forEach(([cat, amount]) => {
      doc.text(`• ${cat}: -${formatBs(amount)}`, left + 4, y);
      y += 4;
    });
  }

  y += 5;
  doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(1);
  doc.line(left, y, right, y);
  y += 14;

  // 5. UTILIDAD NETA
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(15, 23, 42);
  doc.text('UTILIDAD NETA', left, y);
  doc.text(formatBs(statement.netProfit), right, y, { align: 'right' });

  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(100, 116, 139);
  doc.text('Resultado final: Utilidad bruta menos gastos (Utilidad Bruta - Gastos)', left, y);

  y += 24;
  doc.setFontSize(8);
  doc.setTextColor(150, 150, 150);
  doc.text(`SISTEMA LYLA · Santa Cruz de la Sierra, Bolivia · Generado el ${new Date().toLocaleDateString('es-BO')}`, left, y);

  doc.save(`LYLA_Estado_Resultados_${statement.periodLabel.replace(/\s+/g, '_')}_${statement.endDate}.pdf`);
}

export function exportShiftCloseToPdf(shift: ShiftClose): void {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const left = 20;
  const right = pageWidth - 20;
  let y = 22;

  // Encabezado oficial
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(17, 24, 39);
  doc.text('SISTEMA LYLA', left, y);

  y += 6;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(159, 18, 57); // Rose 900
  doc.text(`ACTA DE ARQUEO Y CIERRE DE JORNADA · ${formatDate(shift.date)}`, left, y);

  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(100, 116, 139);
  doc.text(`Santa Cruz de la Sierra, Bolivia · Cerrado por: ${shift.closedBy} · ${formatDateTime(shift.closedAt)}`, left, y);

  y += 6;
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.4);
  doc.line(left, y, right, y);
  y += 8;

  // 1. Resumen de Flujo Operativo
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(17, 24, 39);
  doc.text('1. MOVIMIENTOS Y FLUJO DEL DÍA', left, y);
  y += 6;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`• Total Ventas del Día (${shift.salesCount} ventas):`, left + 4, y);
  doc.setFont('helvetica', 'bold');
  doc.text(formatBs(shift.totalSales), right, y, { align: 'right' });
  y += 4.5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text(`  - Efectivo cobrado: ${formatBs(shift.cashSales)} | QR cobrado: ${formatBs(shift.qrSales)} | Descuentos: ${formatBs(shift.totalDiscounts)}`, left + 6, y);
  y += 5.5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(17, 24, 39);
  doc.text('• Total Gastos Operativos del Día:', left + 4, y);
  doc.setFont('helvetica', 'bold');
  doc.text(`-${formatBs(shift.totalExpenses)}`, right, y, { align: 'right' });
  y += 4.5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text(`  - Gastos Efectivo: ${formatBs(shift.cashExpenses)} | Gastos QR: ${formatBs(shift.qrExpenses)}`, left + 6, y);
  y += 6;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(17, 24, 39);
  doc.text('• Flujo Operativo Neto (Ventas - Gastos):', left + 4, y);
  doc.text(formatBs(shift.operationalFlow), right, y, { align: 'right' });
  y += 7;

  doc.setDrawColor(220, 220, 220);
  doc.line(left, y, right, y);
  y += 8;

  // 2. Arqueo y Cuadre de Caja
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(17, 24, 39);
  doc.text('2. ARQUEO Y CUADRE DE CAJA DETALLADO', left, y);
  y += 6;

  // Efectivo
  const cashCounted = shift.realCashCounted ?? shift.finalExpectedCash;
  const cashDiff = shift.cashDifference ?? 0;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text('A. Efectivo Físico en Caja:', left + 4, y);
  y += 4.5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text(`  - Caja Chica Inicial: ${formatBs(shift.initialCash)}`, left + 6, y);
  y += 4;
  doc.text(`  - Monto Final Esperado: ${formatBs(shift.finalExpectedCash)}`, left + 6, y);
  y += 4;
  doc.text(`  - Monto Real Contado en Gaveta: ${formatBs(cashCounted)}`, left + 6, y);
  y += 4.5;

  doc.setFont('helvetica', 'bold');
  if (Math.abs(cashDiff) <= 0.01) {
    doc.setTextColor(4, 120, 87);
    doc.text('  ✓ Diferencia Efectivo: Bs 0.00 (Cuadre perfecto)', left + 6, y);
  } else if (cashDiff > 0) {
    doc.setTextColor(29, 78, 216);
    doc.text(`  • Diferencia Efectivo: +${formatBs(cashDiff)} (SOBRANTE)`, left + 6, y);
  } else {
    doc.setTextColor(190, 18, 60);
    doc.text(`  • Diferencia Efectivo: -${formatBs(Math.abs(cashDiff))} (FALTANTE)`, left + 6, y);
  }
  y += 6.5;

  // QR
  const qrCounted = shift.realQrVerified ?? shift.finalExpectedQr;
  const qrDiff = shift.qrDifference ?? 0;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(17, 24, 39);
  doc.text('B. Saldo en QR / Banco:', left + 4, y);
  y += 4.5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text(`  - Saldo Inicial en QR: ${formatBs(shift.initialQr)}`, left + 6, y);
  y += 4;
  doc.text(`  - Saldo Final Esperado: ${formatBs(shift.finalExpectedQr)}`, left + 6, y);
  y += 4;
  doc.text(`  - Saldo Real Verificado en Banco: ${formatBs(qrCounted)}`, left + 6, y);
  y += 4.5;

  doc.setFont('helvetica', 'bold');
  if (Math.abs(qrDiff) <= 0.01) {
    doc.setTextColor(4, 120, 87);
    doc.text('  ✓ Diferencia QR: Bs 0.00 (Cuadre perfecto)', left + 6, y);
  } else if (qrDiff > 0) {
    doc.setTextColor(29, 78, 216);
    doc.text(`  • Diferencia QR: +${formatBs(qrDiff)} (SOBRANTE)`, left + 6, y);
  } else {
    doc.setTextColor(190, 18, 60);
    doc.text(`  • Diferencia QR: -${formatBs(Math.abs(qrDiff))} (FALTANTE)`, left + 6, y);
  }
  y += 6.5;

  // C. Total Dinero Arqueado
  const expectedTotalMoney = shift.expectedTotalMoney ?? (shift.finalExpectedCash + shift.finalExpectedQr);
  const realTotalMoney = shift.realTotalMoney ?? (cashCounted + qrCounted);
  const totalDiff = shift.totalDifference ?? (cashDiff + qrDiff);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(17, 24, 39);
  doc.text('C. Resumen General del Arqueo (Total Dinero):', left + 4, y);
  y += 4.5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text(`  - Total Dinero Esperado (Ef. + QR): ${formatBs(expectedTotalMoney)}`, left + 6, y);
  y += 4;
  doc.text(`  - Total Dinero Real Contado y Verificado: ${formatBs(realTotalMoney)}`, left + 6, y);
  y += 4.5;

  doc.setFont('helvetica', 'bold');
  if (Math.abs(totalDiff) <= 0.01) {
    doc.setTextColor(4, 120, 87);
    doc.text('  ✓ Diferencia Total: Bs 0.00 (Cuadre perfecto)', left + 6, y);
  } else if (totalDiff > 0) {
    doc.setTextColor(29, 78, 216);
    doc.text(`  • Diferencia Total: +${formatBs(totalDiff)} (SOBRANTE TOTAL)`, left + 6, y);
  } else {
    doc.setTextColor(190, 18, 60);
    doc.text(`  • Diferencia Total: -${formatBs(Math.abs(totalDiff))} (FALTANTE TOTAL)`, left + 6, y);
  }
  y += 8;

  // 3. Explicación de Diferencias
  if (shift.differenceReason || Math.abs(cashDiff) > 0.01 || Math.abs(qrDiff) > 0.01 || Math.abs(totalDiff) > 0.01) {
    doc.setDrawColor(254, 202, 202);
    doc.setFillColor(254, 242, 242);
    doc.rect(left, y, right - left, 20, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(159, 18, 57);
    doc.text('JUSTIFICACIÓN / EXPLICACIÓN OBLIGATORIA DE LA DIFERENCIA REGISTRADA:', left + 4, y + 5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(30, 41, 59);
    const explanationText = shift.differenceReason || 'Sin detalle complementario registrado.';
    doc.text(explanationText, left + 4, y + 10, { maxWidth: right - left - 8 });
    y += 25;
  }

  // 4. Firmas de Responsabilidad
  y = Math.max(y + 8, 240);
  doc.setDrawColor(180, 180, 180);
  doc.line(left + 10, y, left + 65, y);
  doc.line(right - 65, y, right - 10, y);

  y += 4;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text(`Entregado por: ${shift.closedBy}`, left + 15, y);
  doc.text('Recibido por: Administración / Supervisor', right - 65, y);

  y += 10;
  doc.setFontSize(7.5);
  doc.setTextColor(150, 150, 150);
  doc.text(`SISTEMA LYLA · Documento Oficial de Arqueo y Cierre · Generado el ${new Date().toLocaleString('es-BO')}`, left, y);

  doc.save(`LYLA_Arqueo_Cierre_${shift.date}.pdf`);
}
