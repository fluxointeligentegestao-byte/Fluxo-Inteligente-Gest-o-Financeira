import React, { useState, useEffect } from 'react';
import { 
    Download, 
    Eye, 
    FileText, 
    X, 
    TrendingUp, 
    TrendingDown,
    DollarSign,
    Percent,
    PieChart,
    Calendar,
    ChevronRight,
    ArrowUpRight,
    Target
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { cn } from '../lib/utils';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { getYearMonth } from '../lib/dateUtils';
import { 
    collection, 
    query, 
    onSnapshot, 
    orderBy,
    where 
} from 'firebase/firestore';
import { UNIVERSAL_CHART_OF_ACCOUNTS, ChartAccount } from '../constants/financial';

interface DreReportProps {
    clientId: string;
    clientName: string;
    selectedYear: string;
}

const DreReport = ({ clientId, clientName, selectedYear: initialYear }: DreReportProps) => {
    const [selectedYear, setSelectedYear] = useState(initialYear || new Date().getFullYear().toString());
    const [currentMonth, setCurrentMonth] = useState(`${selectedYear}-${String(new Date().getMonth() + 1).padStart(2, '0')}`);
    const [isPreviewing, setIsPreviewing] = useState(false);
    const [agendaEntries, setAgendaEntries] = useState<any[]>([]);
    const [transactionEntries, setTransactionEntries] = useState<any[]>([]);
    const [dbAccounts, setDbAccounts] = useState<ChartAccount[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const unsubscribeAccounts = onSnapshot(query(
            collection(db, 'chartOfAccounts'), 
            where('clientId', '==', 'global'),
            orderBy('code', 'asc')
        ), (snap) => {
            const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as ChartAccount));
            setDbAccounts(list);
        });
        return () => unsubscribeAccounts();
    }, []);

    const effectiveAccounts = dbAccounts.length > 0 ? dbAccounts : UNIVERSAL_CHART_OF_ACCOUNTS;

    useEffect(() => {
        if (!clientId) return;
        setLoading(true);
        
        // Listener 1: Agenda Entries
        const agendaPath = `financialAgenda/${clientId}/entries`;
        const qAgenda = query(collection(db, agendaPath), orderBy('date', 'desc'));

        const unsubAgenda = onSnapshot(qAgenda, (snap) => {
            const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setAgendaEntries(list);
            if (loading) setLoading(false);
        }, (error) => {
            handleFirestoreError(error, OperationType.GET, agendaPath);
            setLoading(false);
        });

        // Listener 2: System Transactions
        const qTransactions = query(
            collection(db, 'transactions'),
            where('clientId', '==', clientId)
        );

        const unsubTransactions = onSnapshot(qTransactions, (snapshot) => {
            const items = snapshot.docs.map(doc => {
                const data = doc.data();
                return {
                    id: doc.id,
                    date: data.settlement?.paymentDate || data.dueDate,
                    description: data.description || data.partnerName || 'Transação',
                    type: data.type === 'receita' ? 'receber' : 'pagar',
                    category: data.category || '',
                    accountId: data.accountId,
                    value: data.settlement?.paidValue || data.originalValue,
                    status: data.status,
                    month: getYearMonth(data.settlement?.paymentDate || data.dueDate)
                };
            });
            setTransactionEntries(items);
            if (loading) setLoading(false);
        }, (error) => {
            handleFirestoreError(error, OperationType.GET, 'transactions');
            setLoading(false);
        });

        return () => {
            unsubAgenda();
            unsubTransactions();
        };
    }, [clientId]);

    const entries = [...agendaEntries, ...transactionEntries];

    const formatCurrency = (val: number) => {
        return new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL'
        }).format(val);
    };

    const formatPercent = (val: number) => {
        return new Intl.NumberFormat('pt-BR', {
            style: 'percent',
            minimumFractionDigits: 1,
            maximumFractionDigits: 1
        }).format(val / 100);
    };

    const monthNames = [
        'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
        'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
    ];

    // Real calculation logic using entries from Firestore
    const getDreData = (monthYear: string) => {
        const [year, month] = monthYear.split('-');
        const monthYearStr = `${year}-${month}`;
        
        // Previous month logic
        const date = new Date(parseInt(year), parseInt(month) - 1, 1);
        date.setMonth(date.getMonth() - 1);
        const prevMonthYearStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        
        const filterByMonth = (targetMonth: string) => {
            return entries.filter(e => {
                const entryMonth = getYearMonth(e.date || e.month);
                return entryMonth === targetMonth && (e.status === 'Pago' || e.status === 'Recebido' || e.status === 'Conciliado');
            });
        };

        const currentMonthEntries = filterByMonth(monthYearStr);
        const prevMonthEntries = filterByMonth(prevMonthYearStr);
        const [pYear, pMonth] = prevMonthYearStr.split('-');

        const sumByAccounts = (list: any[], codes: string[]) => {
            return list.filter(e => {
                const acc = effectiveAccounts.find(a => a.id === e.accountId);
                if (!acc) return false;
                return codes.some(code => acc.code.startsWith(code));
            }).reduce((acc, curr) => acc + curr.value, 0);
        };

        const sumByGroup = (list: any[], group: string) => {
            return list.filter(e => {
                const acc = effectiveAccounts.find(a => a.id === e.accountId);
                return acc?.group === group;
            }).reduce((acc, curr) => acc + curr.value, 0);
        };

        // Calculations Current
        const receitaBrutaServ = sumByAccounts(currentMonthEntries, ['1.1']);
        const receitaBrutaVend = sumByAccounts(currentMonthEntries, ['1.2']);
        const receitaBrutaTotal = receitaBrutaServ + receitaBrutaVend;
        
        const deducoes = sumByAccounts(currentMonthEntries, ['1.3']);
        const impostosRec = sumByAccounts(currentMonthEntries, ['1.4']);
        const receitaLiquida = receitaBrutaTotal - deducoes - impostosRec;

        const custosDir = sumByAccounts(currentMonthEntries, ['2']);
        const lucroBruto = receitaLiquida - custosDir;

        const despPessoal = sumByAccounts(currentMonthEntries, ['3.1']);
        const despOcupacao = sumByAccounts(currentMonthEntries, ['3.2']);
        const despTecnologia = sumByAccounts(currentMonthEntries, ['3.3']);
        const despAdmin = sumByAccounts(currentMonthEntries, ['3.4']);
        const despVendas = sumByAccounts(currentMonthEntries, ['3.5']);
        const despOutras = sumByAccounts(currentMonthEntries, ['3.6']);
        const totalDespesas = despPessoal + despOcupacao + despTecnologia + despAdmin + despVendas + despOutras;

        const ebitda = lucroBruto - totalDespesas;

        const recFin = sumByAccounts(currentMonthEntries, ['4.2']);
        const despFin = sumByAccounts(currentMonthEntries, ['4.1']);
        const ebit = ebitda + recFin - despFin;

        const tributos = sumByAccounts(currentMonthEntries, ['5']);
        const lucroLiquido = ebit - tributos;

        // Calculations Previous
        const pReceitaBrutaServ = sumByAccounts(prevMonthEntries, ['1.1']);
        const pReceitaBrutaVend = sumByAccounts(prevMonthEntries, ['1.2']);
        const pReceitaBrutaTotal = pReceitaBrutaServ + pReceitaBrutaVend;
        const pDeducoes = sumByAccounts(prevMonthEntries, ['1.3']);
        const pImpostosRec = sumByAccounts(prevMonthEntries, ['1.4']);
        const pReceitaLiquida = pReceitaBrutaTotal - pDeducoes - pImpostosRec;
        const pCustosDir = sumByAccounts(prevMonthEntries, ['2']);
        const pLucroBruto = pReceitaLiquida - pCustosDir;
        const pDespTotal = sumByAccounts(prevMonthEntries, ['3']);
        const pEbitda = pLucroBruto - pDespTotal;
        const pRecFin = sumByAccounts(prevMonthEntries, ['4.2']);
        const pDespFin = sumByAccounts(prevMonthEntries, ['4.1']);
        const pEbit = pEbitda + pRecFin - pDespFin;
        const pTributos = sumByAccounts(prevMonthEntries, ['5']);
        const pLucroLiquido = pEbit - pTributos;

        const calcVar = (curr: number, prev: number) => {
            if (prev === 0) return curr === 0 ? 0 : 100;
            return ((curr - prev) / Math.abs(prev)) * 100;
        };

        const currentMonthName = monthNames[parseInt(month) - 1];
        const prevMonthIdx = parseInt(pMonth) - 1;
        const prevMonthNameShort = monthNames[prevMonthIdx].substring(0, 3).toUpperCase();

        return {
            month: `${currentMonthName.toUpperCase()} / ${year}`,
            prevMonth: `${prevMonthNameShort}/${pYear}`,
            indicators: [
                { label: 'RECEITA BRUTA', value: receitaBrutaTotal, variation: calcVar(receitaBrutaTotal, pReceitaBrutaTotal), desc: 'Faturamento antes de impostos', icon: DollarSign, color: 'border-blue-500' },
                { label: 'RECEITA LÍQUIDA', value: receitaLiquida, variation: calcVar(receitaLiquida, pReceitaLiquida), desc: 'Receita menos deduções', icon: Target, color: 'border-emerald-500' },
                { label: 'LUCRO BRUTO', value: lucroBruto, variation: calcVar(lucroBruto, pLucroBruto), desc: 'Após custos diretos', icon: PieChart, color: 'border-purple-500' },
                { label: 'EBITDA', value: ebitda, variation: calcVar(ebitda, pEbitda), desc: 'Resultado operacional', icon: TrendingUp, color: 'border-orange-500' },
                { label: 'LUCRO LÍQUIDO', value: lucroLiquido, variation: calcVar(lucroLiquido, pLucroLiquido), desc: 'Resultado final do mês', icon: DollarSign, color: 'border-cyan-500' },
                { label: 'MARGEM LÍQUIDA', value: receitaLiquida > 0 ? (lucroLiquido / receitaLiquida) * 100 : 0, variation: calcVar(receitaLiquida > 0 ? (lucroLiquido / receitaLiquida) * 100 : 0, pReceitaLiquida > 0 ? (pLucroLiquido / pReceitaLiquida) * 100 : 0), desc: 'Rentabilidade sobre receita', icon: Percent, color: 'border-indigo-500', isPercent: true, varLabel: 'p.p.' },
            ],
            rows: [
                { label: 'Receita Bruta de Serviços', current: receitaBrutaServ, av: receitaBrutaTotal > 0 ? (receitaBrutaServ / receitaBrutaTotal) * 100 : 0, prev: pReceitaBrutaServ, var: calcVar(receitaBrutaServ, pReceitaBrutaServ), type: 'item' },
                { label: 'Receita Bruta de Vendas', current: receitaBrutaVend, av: receitaBrutaTotal > 0 ? (receitaBrutaVend / receitaBrutaTotal) * 100 : 0, prev: pReceitaBrutaVend, var: calcVar(receitaBrutaVend, pReceitaBrutaVend), type: 'item' },
                { label: 'RECEITA BRUTA TOTAL', current: receitaBrutaTotal, av: 100, prev: pReceitaBrutaTotal, var: calcVar(receitaBrutaTotal, pReceitaBrutaTotal), type: 'total' },
                { label: '(-) Devoluções e Abatimentos', current: -deducoes, av: receitaBrutaTotal > 0 ? (-deducoes / receitaBrutaTotal) * 100 : 0, prev: -pDeducoes, var: calcVar(deducoes, pDeducoes), type: 'item' },
                { label: '(-) Simples Nacional s/ Receita', current: -impostosRec, av: receitaBrutaTotal > 0 ? (-impostosRec / receitaBrutaTotal) * 100 : 0, prev: -pImpostosRec, var: calcVar(impostosRec, pImpostosRec), type: 'item' },
                { label: '= RECEITA LÍQUIDA', current: receitaLiquida, av: receitaBrutaTotal > 0 ? (receitaLiquida / receitaBrutaTotal) * 100 : 0, prev: pReceitaLiquida, var: calcVar(receitaLiquida, pReceitaLiquida), type: 'highlight' },
                { label: '(-) Custos Operacionais', current: -custosDir, av: receitaBrutaTotal > 0 ? (-custosDir / receitaBrutaTotal) * 100 : 0, prev: -pCustosDir, var: calcVar(custosDir, pCustosDir), type: 'item' },
                { label: '= LUCRO BRUTO', current: lucroBruto, av: receitaBrutaTotal > 0 ? (lucroBruto / receitaBrutaTotal) * 100 : 0, prev: pLucroBruto, var: calcVar(lucroBruto, pLucroBruto), type: 'highlight' },
                { label: 'DESPESAS OPERACIONAIS', type: 'section' },
                { label: '(-) Pessoal e Encargos', current: -despPessoal, av: receitaBrutaTotal > 0 ? (-despPessoal / receitaBrutaTotal) * 100 : 0, prev: -sumByAccounts(prevMonthEntries, ['3.1']), var: calcVar(despPessoal, sumByAccounts(prevMonthEntries, ['3.1'])), type: 'item' },
                { label: '(-) Ocupação e Instalações', current: -despOcupacao, av: receitaBrutaTotal > 0 ? (-despOcupacao / receitaBrutaTotal) * 100 : 0, prev: -sumByAccounts(prevMonthEntries, ['3.2']), var: calcVar(despOcupacao, sumByAccounts(prevMonthEntries, ['3.2'])), type: 'item' },
                { label: '(-) Comunicação e Tecnologia', current: -despTecnologia, av: receitaBrutaTotal > 0 ? (-despTecnologia / receitaBrutaTotal) * 100 : 0, prev: -sumByAccounts(prevMonthEntries, ['3.3']), var: calcVar(despTecnologia, sumByAccounts(prevMonthEntries, ['3.3'])), type: 'item' },
                { label: '(-) Despesas Administrativas', current: -despAdmin, av: receitaBrutaTotal > 0 ? (-despAdmin / receitaBrutaTotal) * 100 : 0, prev: -sumByAccounts(prevMonthEntries, ['3.4']), var: calcVar(despAdmin, sumByAccounts(prevMonthEntries, ['3.4'])), type: 'item' },
                { label: '(-) Vendas e Marketing', current: -despVendas, av: receitaBrutaTotal > 0 ? (-despVendas / receitaBrutaTotal) * 100 : 0, prev: -sumByAccounts(prevMonthEntries, ['3.5']), var: calcVar(despVendas, sumByAccounts(prevMonthEntries, ['3.5'])), type: 'item' },
                { label: '(-) Outras Despesas Operacionais', current: -despOutras, av: receitaBrutaTotal > 0 ? (-despOutras / receitaBrutaTotal) * 100 : 0, prev: -sumByAccounts(prevMonthEntries, ['3.6']), var: calcVar(despOutras, sumByAccounts(prevMonthEntries, ['3.6'])), type: 'item' },
                { label: 'TOTAL DESPESAS OPERAC.', current: -totalDespesas, av: receitaBrutaTotal > 0 ? (-totalDespesas / receitaBrutaTotal) * 100 : 0, prev: -pDespTotal, var: calcVar(totalDespesas, pDespTotal), type: 'total_red' },
                { label: '= EBITDA', current: ebitda, av: receitaBrutaTotal > 0 ? (ebitda / receitaBrutaTotal) * 100 : 100, prev: pEbitda, var: calcVar(ebitda, pEbitda), type: 'highlight_green' },
                { label: 'RESULTADO FINANC.', type: 'section' },
                { label: '(+) Receitas Financeiras', current: recFin, av: receitaBrutaTotal > 0 ? (recFin / receitaBrutaTotal) * 100 : 0, prev: pRecFin, var: calcVar(recFin, pRecFin), type: 'item' },
                { label: '(-) Despesas Financeiras', current: -despFin, av: receitaBrutaTotal > 0 ? (-despFin / receitaBrutaTotal) * 100 : 0, prev: -pDespFin, var: calcVar(despFin, pDespFin), type: 'item' },
                { label: '= EBIT (Resultado antes impostos)', current: ebit, av: receitaBrutaTotal > 0 ? (ebit / receitaBrutaTotal) * 100 : 100, prev: pEbit, var: calcVar(ebit, pEbit), type: 'highlight_green' },
                { label: '(-) Impostos', current: -tributos, av: receitaBrutaTotal > 0 ? (-tributos / receitaBrutaTotal) * 100 : 0, prev: -pTributos, var: calcVar(tributos, pTributos), type: 'item' },
                { label: '= LUCRO LÍQUIDO', current: lucroLiquido, av: receitaBrutaTotal > 0 ? (lucroLiquido / receitaBrutaTotal) * 100 : 100, prev: pLucroLiquido, var: calcVar(lucroLiquido, pLucroLiquido), type: 'footer' },
            ]
        };
    };

    const data = getDreData(currentMonth);

    const handleDownloadPDF = () => {
        const doc = new jsPDF({
            orientation: 'portrait',
            unit: 'mm',
            format: 'a4'
        });

        const drawBrandedHeader = (d: jsPDF) => {
            // Left Side: Brand
            d.setFillColor(34, 197, 94); // emerald-500
            d.roundedRect(14, 15, 1.5, 10, 0.5, 0.5, 'F');
            
            d.setFont('helvetica', 'bold');
            d.setFontSize(14);
            d.setTextColor(15, 23, 42);
            d.text('FLUXO INTELIGENTE', 18, 20);
            
            d.setFont('helvetica', 'normal');
            d.setFontSize(7);
            d.setTextColor(100, 116, 139);
            d.text('GESTÃO FINANCEIRA ESTRATÉGICA', 18, 24);
            
            d.setFillColor(34, 197, 94);
            d.rect(18, 27, 12, 0.5, 'F');

            // Right Side: Title & Period
            d.setFont('helvetica', 'bold');
            d.setFontSize(11);
            d.setTextColor(15, 23, 42);
            d.text('DRE GERENCIAL', 196, 20, { align: 'right' });
            
            d.setFontSize(8);
            d.setTextColor(100, 116, 139);
            d.text(`PERÍODO: ${data.month}`, 196, 24, { align: 'right' });
            
            d.setFontSize(7);
            d.setTextColor(148, 163, 184);
            d.text(`CLIENTE: ${clientName.toUpperCase()}`, 196, 28, { align: 'right' });

            // Line Separator
            d.setDrawColor(241, 245, 249);
            d.line(14, 34, 196, 34);
        };

        drawBrandedHeader(doc);
        let currentY = 45;

        // Indicators
        doc.setFontSize(9);
        doc.setTextColor(15, 23, 42);
        doc.text('INDICADORES DO MÊS', 14, currentY);
        currentY += 5;

        const cardW = 60;
        const cardH = 20;
        const spacing = 4;

        data.indicators.slice(0, 3).forEach((ind, i) => {
            const x = 14 + (i * (cardW + spacing));
            doc.setFillColor(248, 250, 252);
            doc.roundedRect(x, currentY, cardW, cardH, 2, 2, 'F');
            
            doc.setFontSize(6);
            doc.setTextColor(100, 116, 139);
            doc.text(ind.label, x + 3, currentY + 5);
            
            doc.setFontSize(9);
            doc.setTextColor(15, 23, 42);
            const val = ind.isPercent ? ind.value.toFixed(1) + '%' : formatCurrency(ind.value);
            doc.text(val, x + 3, currentY + 12);
            
            doc.setFontSize(5);
            doc.setTextColor(ind.variation >= 0 ? 34 : 225, ind.variation >= 0 ? 197 : 29, ind.variation >= 0 ? 94 : 72);
            doc.text(`${ind.variation > 0 ? '▲' : '▼'} ${Math.abs(ind.variation)}% vs mês ant.`, x + 3, currentY + 17);
        });

        currentY += cardH + spacing;

        data.indicators.slice(3, 6).forEach((ind, i) => {
            const x = 14 + (i * (cardW + spacing));
            doc.setFillColor(248, 250, 252);
            doc.roundedRect(x, currentY, cardW, cardH, 2, 2, 'F');
            
            doc.setFontSize(6);
            doc.setTextColor(100, 116, 139);
            doc.text(ind.label, x + 3, currentY + 5);
            
            doc.setFontSize(9);
            doc.setTextColor(15, 23, 42);
            const val = ind.isPercent ? ind.value.toFixed(1) + '%' : formatCurrency(ind.value);
            doc.text(val, x + 3, currentY + 12);
            
            doc.setFontSize(5);
            doc.setTextColor(ind.variation >= 0 ? 34 : 225, ind.variation >= 0 ? 197 : 29, ind.variation >= 0 ? 94 : 72);
            doc.text(`${ind.variation > 0 ? '▲' : '▼'} ${Math.abs(ind.variation)}% vs mês ant.`, x + 3, currentY + 17);
        });

        currentY += cardH + 10;

        // Table
        doc.setFontSize(9);
        doc.setTextColor(15, 23, 42);
        doc.text('DRE GERENCIAL RESUMIDA', 14, currentY);
        currentY += 5;

        const tableBody = data.rows.map(row => {
            if (row.type === 'section') return [row.label, '', '', '', ''];
            return [
                row.label,
                row.current !== undefined ? (row.current < 0 ? `(${Math.abs(row.current).toLocaleString('pt-BR')})` : row.current.toLocaleString('pt-BR')) : '-',
                row.av !== undefined ? row.av.toFixed(1) + '%' : '-',
                row.prev !== undefined ? (row.prev < 0 ? `(${Math.abs(row.prev).toLocaleString('pt-BR')})` : row.prev.toLocaleString('pt-BR')) : '-',
                row.var !== undefined ? row.var.toFixed(1) + '%' : '-'
            ];
        });

        autoTable(doc, {
            startY: currentY,
            head: [['DESCRIÇÃO', data.month.split('/')[0], 'AV%', data.prevMonth, 'VAR%']],
            body: tableBody,
            theme: 'plain',
            headStyles: { fillColor: [26, 54, 93], textColor: [255, 255, 255], fontSize: 7, fontStyle: 'bold' },
            styles: { fontSize: 7, cellPadding: 2 },
            didParseCell: (data) => {
                const rowIndex = data.row.index;
                const rowType = dreData.rows[rowIndex]?.type;
                
                if (rowType === 'section') {
                    data.cell.styles.fontStyle = 'bold';
                    data.cell.styles.textColor = [100, 116, 139];
                    data.cell.styles.fillColor = [252, 253, 254];
                }
                if (rowType === 'total' || rowType === 'highlight' || rowType === 'footer') {
                    data.cell.styles.fontStyle = 'bold';
                }
                if (rowType === 'footer') {
                    data.cell.styles.fillColor = [15, 23, 42];
                    data.cell.styles.textColor = [255, 255, 255];
                }
            }
        });

        doc.save(`DRE_${clientName}_${data.month.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`);
    };

    const dreData = data;

    return (
        <div className="space-y-8 pt-6 animate-in fade-in duration-700">
            {/* Header / Selector */}
            <div className="flex flex-col md:flex-row items-center justify-between gap-4 bg-white p-5 rounded-[2.5rem] border border-slate-100 shadow-sm no-print">
                <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-2 bg-slate-50 px-5 py-2 rounded-2xl border border-slate-200">
                        <Calendar size={14} className="text-slate-400" />
                        <select 
                            value={currentMonth.split('-')[1]} 
                            onChange={(e) => {
                                const newMonth = e.target.value;
                                setCurrentMonth(`${selectedYear}-${newMonth}`);
                            }}
                            className="bg-transparent text-[11px] font-black text-slate-700 uppercase tracking-widest outline-none cursor-pointer"
                        >
                            {monthNames.map((m, i) => (
                                <option key={i} value={String(i + 1).padStart(2, '0')}>{m}</option>
                            ))}
                        </select>
                        <div className="w-[1px] h-4 bg-slate-200 mx-1" />
                        <select 
                            value={selectedYear} 
                            onChange={(e) => {
                                const newYear = e.target.value;
                                setSelectedYear(newYear);
                                setCurrentMonth(`${newYear}-${currentMonth.split('-')[1]}`);
                            }}
                            className="bg-transparent text-[11px] font-black text-slate-700 uppercase tracking-widest outline-none cursor-pointer"
                        >
                            <option value="2024">2024</option>
                            <option value="2025">2025</option>
                            <option value="2026">2026</option>
                            <option value="2027">2027</option>
                        </select>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <Button variant="outline" size="sm" className="rounded-full px-6" onClick={() => setIsPreviewing(true)}>
                        <Eye size={14} className="mr-2" /> Prévia Detalhada
                    </Button>
                    <Button size="sm" className="rounded-full bg-primary px-6" onClick={handleDownloadPDF}>
                        <Download size={14} className="mr-2" /> Baixar PDF
                    </Button>
                </div>
            </div>

            {/* In-Page Preview */}
            <div className="mt-10">
                <Card className="p-0 overflow-visible border-none shadow-2xl bg-white rounded-3xl md:rounded-[3rem] relative">
                    <div className="p-10 md:p-14 bg-white rounded-t-3xl md:rounded-t-[3rem] border-b border-slate-50">
                        <div className="flex flex-col md:flex-row justify-between items-start gap-8">
                            <div className="flex items-start gap-4">
                                <div className="w-1.5 h-12 bg-[#22c55e] rounded-full" />
                                <div>
                                    <h1 className="text-xl font-black text-slate-900 uppercase tracking-tight">Fluxo Inteligente</h1>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mt-1">Gestão Financeira Estratégica</p>
                                    <div className="h-0.5 w-16 bg-[#22c55e] mt-2" />
                                </div>
                            </div>
                            <div className="text-left md:text-right">
                                <h2 className="text-lg font-black text-slate-900 uppercase tracking-tight">DRE GERENCIAL</h2>
                                <p className="text-[10px] font-bold text-slate-400 uppercase mt-1">PERÍODO: {data.month}</p>
                                <p className="text-[9px] font-medium text-slate-300 uppercase mt-1 tracking-wider">CLIENTE: {clientName.toUpperCase()}</p>
                            </div>
                        </div>
                    </div>

                    <div className="p-4 md:p-10 space-y-12">
                        {/* Indicators Grid */}
                        <section>
                            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-8 flex items-center gap-2 px-1 text-left">
                                <TrendingUp size={12} /> Indicadores do Mês
                            </h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
                                {data.indicators.map((ind, idx) => (
                                    <div key={idx} className={cn("bg-slate-50 p-5 rounded-3xl border-l-[4px] shadow-sm transition-all hover:shadow-md", ind.color)}>
                                        <p className="text-[8px] font-black text-slate-400 uppercase mb-3 truncate">{ind.label}</p>
                                        <p className="text-xl font-black text-slate-900 leading-none">
                                            {ind.isPercent ? ind.value.toFixed(1) + '%' : formatCurrency(ind.value)}
                                        </p>
                                        <div className={cn("flex items-center gap-1.5 mt-3 text-[10px] font-bold", 
                                            ind.variation >= 0 ? "text-emerald-600" : "text-rose-600"
                                        )}>
                                            {ind.variation >= 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                                            <span>{Math.abs(ind.variation)}% {ind.varLabel || 'vs mês ant.'}</span>
                                        </div>
                                        <p className="text-[7.5px] text-slate-400 mt-2 uppercase font-bold tracking-tighter opacity-80">{ind.desc}</p>
                                    </div>
                                ))}
                            </div>
                        </section>

                        {/* DRE Table */}
                        <section>
                            <div className="flex items-center justify-between mb-8 px-1">
                                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
                                    <FileText size={12} /> DRE Gerencial Resumida
                                </h3>
                                <div className="flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                                    <span className="text-[8px] font-bold text-slate-400 uppercase">Dados Atualizados</span>
                                </div>
                            </div>
                            
                            <div className="relative rounded-3xl border border-slate-100 bg-white shadow-sm overflow-hidden">
                                <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent">
                                    <table className="w-full text-left border-collapse min-w-[800px]">
                                        <thead className="sticky top-0 z-20 shadow-sm">
                                            <tr className="bg-[#1a365d] text-white text-[10px] uppercase">
                                                <th className="py-4 px-8 sticky left-0 z-30 bg-[#1a365d]">Descrição</th>
                                                <th className="py-4 px-8 text-right bg-[#1a365d]">{data.month.split(' / ')[0]}</th>
                                                <th className="py-4 px-8 text-right bg-[#1a365d]">AV%</th>
                                                <th className="py-4 px-8 text-right bg-[#1a365d]">{data.prevMonth}</th>
                                                <th className="py-4 px-8 text-right bg-[#1a365d]">Var. %</th>
                                            </tr>
                                        </thead>
                                        <tbody className="text-[11px]">
                                            {data.rows.map((row, idx) => {
                                                if (row.type === 'section') {
                                                    return (
                                                        <tr key={idx} className="bg-slate-50/90 border-b border-slate-100">
                                                            <td colSpan={5} className="py-3 px-8 font-black text-slate-500 uppercase tracking-widest text-[9px] sticky left-0">{row.label}</td>
                                                        </tr>
                                                    );
                                                }

                                                const isTotal = row.type === 'total' || row.type === 'total_red';
                                                const isHighlight = row.type === 'highlight' || row.type === 'highlight_green';
                                                const isFooter = row.type === 'footer';

                                                return (
                                                    <tr key={idx} className={cn(
                                                        "border-b border-slate-50 transition-colors group",
                                                        isTotal && "bg-slate-50/40 font-bold",
                                                        isHighlight && "bg-emerald-50/10 font-bold",
                                                        isFooter && "bg-[#1a365d] text-white font-black"
                                                    )}>
                                                        <td className={cn(
                                                            "py-4 px-8 sticky left-0 z-10 transition-colors",
                                                            isFooter ? "bg-[#1a365d]" : "bg-white group-hover:bg-slate-50/80",
                                                            (isTotal || isHighlight) && !isFooter && (isHighlight ? "bg-[#f0fdf4]/50" : "bg-slate-50/50"),
                                                            "shadow-[4px_0_10px_rgba(0,0,0,0.03)]"
                                                        )}>
                                                            <div className="flex flex-col">
                                                                <span className={cn(row.label.startsWith('(-) ') && !isFooter && "text-rose-500 font-semibold")}>{row.label}</span>
                                                                {(isHighlight || isFooter) && <span className={cn("text-[9px] font-medium opacity-60", isFooter ? "text-white/70" : "text-slate-400")}>Margem {row.label.includes('= ') ? row.label.split('= ')[1] : ''}</span>}
                                                            </div>
                                                        </td>
                                                        <td className={cn("py-4 px-8 text-right font-medium whitespace-nowrap", row.current && row.current < 0 && !isFooter && "text-rose-500")}>
                                                            {row.current !== undefined ? (row.current < 0 ? `(${Math.abs(row.current).toLocaleString('pt-BR')})` : row.current.toLocaleString('pt-BR')) : '-'}
                                                        </td>
                                                        <td className="py-4 px-8 text-right text-slate-400 font-bold tabular-nums">
                                                            {row.av !== undefined ? row.av.toFixed(1) + '%' : '-'}
                                                        </td>
                                                        <td className="py-4 px-8 text-right text-slate-400 tabular-nums">
                                                            {row.prev !== undefined ? (row.prev < 0 ? `(${Math.abs(row.prev).toLocaleString('pt-BR')})` : row.prev.toLocaleString('pt-BR')) : '-'}
                                                        </td>
                                                        <td className={cn("py-4 px-8 text-right font-black tabular-nums", 
                                                            row.var !== undefined && row.var >= 0 ? (row.type === 'item' && row.label.includes('Despesas') ? "text-rose-500" : "text-emerald-500") : "text-rose-500"
                                                        )}>
                                                            {row.var !== undefined ? (row.var > 0 ? '+' : '') + row.var.toFixed(1) + '%' : '-'}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </section>
                    </div>
                </Card>
            </div>

            {/* Full Preview Modal */}
            {isPreviewing && (
                <div className="fixed inset-0 z-[60] overflow-y-auto bg-slate-900/60 backdrop-blur-sm no-print">
                    <div className="flex min-h-full items-start justify-center p-4 md:p-10">
                        <div className="bg-slate-100 w-full max-w-4xl max-h-[90vh] md:max-h-[85vh] rounded-[2.5rem] shadow-2xl flex flex-col relative scale-in-95 animate-in overflow-hidden">
                            <div className="flex items-center justify-between p-4 px-8 bg-white border-b border-slate-100 flex-shrink-0 z-50">
                            <div>
                                <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight">📈 Pré-visualização DRE Gerencial</h3>
                                <p className="text-[10px] font-bold text-slate-400 uppercase">Visão Executiva de Resultado</p>
                            </div>
                            <div className="flex items-center gap-3">
                                <Button size="sm" className="rounded-full bg-primary" onClick={handleDownloadPDF}>
                                    <Download size={14} className="mr-2" /> PDF
                                </Button>
                                <button 
                                    onClick={() => setIsPreviewing(false)}
                                    className="p-2 hover:bg-slate-100 rounded-full text-slate-400 transition-colors"
                                >
                                    <X size={20} />
                                </button>
                            </div>
                        </div>

                            <div className="flex-1 overflow-y-auto p-4 md:p-12 bg-slate-200/50">
                                <div className="bg-white p-6 md:p-12 shadow-2xl mx-auto w-full max-w-[800px] font-sans text-slate-900 min-h-[1000px] overflow-hidden">
                                     {/* Print Header */}
                                    <div className="flex justify-between items-start mb-14">
                                        <div className="flex items-start gap-4">
                                            <div className="w-1.5 h-12 bg-[#22c55e] rounded-full" />
                                            <div>
                                                <h1 className="text-xl font-black text-slate-900 uppercase tracking-tight">Fluxo Inteligente</h1>
                                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mt-1">Gestão Financeira Estratégica</p>
                                                <div className="h-0.5 w-16 bg-[#22c55e] mt-2" />
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <h2 className="text-lg font-black text-slate-900 uppercase tracking-tight">DRE GERENCIAL</h2>
                                            <p className="text-[10px] font-bold text-slate-400 uppercase mt-1">PERÍODO: {data.month}</p>
                                            <p className="text-[8px] font-medium text-slate-300 uppercase mt-1 tracking-[0.2em]">CLIENTE: {clientName.toUpperCase()}</p>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-3 gap-4 mb-10">
                                        {data.indicators.slice(0, 3).map((ind, idx) => (
                                            <div key={idx} className={cn("bg-slate-50 p-5 rounded-2xl border border-slate-100 border-l-4", ind.color)}>
                                                <p className="text-[7px] font-black text-slate-400 uppercase mb-2">{ind.label}</p>
                                                <p className="text-base font-black">{ind.isPercent ? ind.value.toFixed(1) + '%' : formatCurrency(ind.value)}</p>
                                                <p className={cn("text-[8px] font-bold mt-1.5", ind.variation >= 0 ? "text-emerald-600" : "text-rose-600")}>
                                                    {ind.variation > 0 ? '▲' : '▼'} {Math.abs(ind.variation)}% {ind.varLabel || 'vs mês ant.'}
                                                </p>
                                            </div>
                                        ))}
                                    </div>

                                    <div className="overflow-x-auto border border-slate-100 rounded-2xl">
                                        <table className="w-full mb-0 min-w-[650px]">
                                            <thead>
                                                <tr className="bg-[#1a365d] text-white text-[8px] uppercase">
                                                    <th className="py-3 px-6 text-left sticky left-0 z-10 bg-[#1a365d]">Descrição</th>
                                                    <th className="py-3 px-6 text-right">{data.month.split(' / ')[0]}</th>
                                                    <th className="py-3 px-6 text-right">AV%</th>
                                                    <th className="py-3 px-6 text-right">{data.prevMonth}</th>
                                                    <th className="py-3 px-6 text-right">Var %</th>
                                                </tr>
                                            </thead>
                                            <tbody className="text-[10px]">
                                                {data.rows.map((row, idx) => {
                                                    if (row.type === 'section') return <tr key={idx}><td colSpan={5} className="py-2.5 bg-slate-50 px-6 font-bold text-slate-400 uppercase text-[7px] sticky left-0">{row.label}</td></tr>;
                                                    
                                                    const isFooter = row.type === 'footer';
                                                    
                                                    return (
                                                        <tr key={idx} className={cn("border-b border-slate-50", isFooter && "bg-[#1a365d] text-white")}>
                                                            <td className={cn("py-3 px-6 sticky left-0 z-10 font-medium", isFooter ? "bg-[#1a365d]" : "bg-white")}>{row.label}</td>
                                                            <td className="py-3 px-6 text-right whitespace-nowrap">{row.current?.toLocaleString('pt-BR')}</td>
                                                            <td className="py-3 px-6 text-right font-bold text-slate-400">{row.av?.toFixed(1)}%</td>
                                                            <td className="py-3 px-6 text-right whitespace-nowrap text-slate-400">{row.prev?.toLocaleString('pt-BR')}</td>
                                                            <td className="py-3 px-6 text-right font-black">{row.var?.toFixed(1)}%</td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            )}
        </div>
    );
};

export default DreReport;
