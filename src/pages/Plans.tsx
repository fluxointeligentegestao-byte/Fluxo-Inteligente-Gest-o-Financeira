import React, { useState } from 'react';
import { 
    CreditCard, 
    Check, 
    ChevronRight, 
    Zap, 
    Rocket, 
    ShieldCheck, 
    Clock, 
    Target,
    BarChart3,
    Settings,
    FileText,
    HelpCircle,
    ArrowLeft,
    Loader2,
    ChevronLeft
} from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { cn, formatCurrency } from '../lib/utils';
import { motion } from 'motion/react';
import { useAuth } from '../context/AuthContext';

export const Plans = ({ onBack }: { onBack?: () => void }) => {
    const { profile, updateProfile, plansConfig } = useAuth();
    const [isUpdating, setIsUpdating] = useState<string | null>(null);

    const getBasePlans = () => [
        { 
            id: 'essencial',
            name: 'Essencial — Operação', 
            price: 400, 
            icon: Zap,
            tagline: 'Organização e rotina',
            limit: 'até 50 lançamentos',
            color: 'text-slate-600 bg-slate-50 border-slate-200',
            features: [
                { category: 'Operação', items: [
                    'Organização da rotina financeira',
                    'Controle de contas a pagar e receber',
                    'Cadastro e estruturação financeira',
                    'Conciliação bancária básica',
                    'Acompanhamento operacional financeiro'
                ] }
            ] 
        },
        { 
            id: 'profissional',
            name: 'Profissional — Operação', 
            price: 800, 
            icon: Rocket,
            tagline: 'Gestão estruturada',
            limit: 'até 150 lançamentos',
            highlight: true,
            color: 'text-primary bg-primary/5 border-primary/20',
            features: [
                { category: 'Operação', items: [
                    'Gestão financeira estruturada',
                    'Controle financeiro operacional',
                    'Conciliação bancária avançada',
                    'Conferência e organização das movimentações',
                    'Acompanhamento financeiro mensal'
                ] }
            ] 
        },
        { 
            id: 'premium',
            name: 'Premium — Operação & Análise', 
            price: 1200, 
            icon: ShieldCheck,
            tagline: 'Inteligência Estratégica',
            limit: 'lançamentos ilimitados',
            color: 'text-secondary bg-secondary/5 border-secondary/20',
            features: [
                { category: 'Operação', items: [
                    'Gestão financeira completa',
                    'Acompanhamento mensal avançado'
                ] },
                { category: 'Análise', items: [
                    'Indicadores financeiros do fluxo de caixa',
                    'Indicadores da DRE gerencial',
                    'KPIs financeiros estratégicos',
                    'Dashboards financeiros inteligentes'
                ] }
            ] 
        },
    ];

    // Merge static UI data with dynamic config from DB
    const mergedPlans = React.useMemo(() => {
        const basePlans = getBasePlans();
        if (!plansConfig) return basePlans;

        // plansConfig could be an object (from admin UI) or array (legacy)
        const configData = Array.isArray(plansConfig) 
            ? plansConfig.reduce((acc: any, p: any) => ({ ...acc, [p.id]: p }), {})
            : plansConfig;

        return basePlans.map(base => {
            const dynamic = configData[base.id];
            if (!dynamic) return base;

            // Prepare features list
            const updatedFeatures: { category: string, items: string[] }[] = [];

            // If we have dynamic features (advantages), use them
            if (dynamic.features && dynamic.features.length > 0) {
                updatedFeatures.push({
                    category: 'Vantagens',
                    items: dynamic.features
                });
            }

            // If we have dynamic reports, add them as a category
            if (dynamic.reports && dynamic.reports.length > 0) {
                updatedFeatures.push({
                    category: 'Relatórios Disponíveis',
                    items: dynamic.reports
                });
            }

            // Fallback to base features if dynamic features are empty
            const finalFeatures = updatedFeatures.length > 0 ? updatedFeatures : base.features;

            return {
                ...base,
                price: dynamic.price ?? base.price,
                name: dynamic.label ?? base.name,
                tagline: dynamic.tagline ?? base.tagline,
                limit: dynamic.entriesLimit !== undefined 
                    ? (dynamic.entriesLimit === 0 ? 'lançamentos ilimitados' : `até ${dynamic.entriesLimit} lançamentos`)
                    : base.limit,
                features: finalFeatures
            };
        });
    }, [plansConfig]);

    const handleSelectPlan = async (planId: string, price: number) => {
        setIsUpdating(planId);
        try {
            await updateProfile({
                planId: planId,
                monthlyValue: price
            });
        } catch (error) {
            console.error('Error updating plan:', error);
        } finally {
            setIsUpdating(null);
        }
    };

    return (
        <div className="space-y-16 pb-20">
            {/* Minimalist Header */}
            <div className="max-w-6xl mx-auto space-y-2 pt-4">
                <div className="flex flex-col gap-4 mb-4">
                    <div className="flex items-center gap-3">
                        {onBack && (
                            <button 
                                onClick={onBack}
                                className="p-2 -ml-2 text-slate-400 hover:text-primary hover:bg-primary/5 rounded-xl transition-all"
                            >
                                <ChevronLeft size={24} />
                            </button>
                        )}
                        <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Planos</h1>
                    </div>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest -mt-2">
                        Escopo e Arquitetura BPO
                    </p>
                </div>
                <p className="text-slate-500 text-sm font-medium leading-relaxed max-w-2xl px-1">
                    Escolha a estrutura ideal para o seu faturamento. Eficiência máxima em gestão tributária e operacional para acelerar o seu crescimento.
                </p>
            </div>

            {/* Ultra Modern Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
                {mergedPlans.map((plan, idx) => (
                    <motion.div
                        key={plan.id}
                        initial={{ opacity: 0, y: 30 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.1 }}
                        className="h-full"
                    >
                        <Card className={cn(
                            "flex flex-col h-full bg-white border border-slate-100 rounded-[2.5rem] transition-all duration-500 hover:shadow-2xl hover:shadow-slate-200/50 relative group overflow-hidden",
                            plan.highlight && "ring-2 ring-primary ring-offset-4 ring-offset-slate-50 shadow-xl",
                            profile?.planId === plan.id && "border-primary/50 shadow-lg"
                        )}>
                            {/* Card Decoration */}
                            <div className={cn("absolute top-0 right-0 w-32 h-32 blur-3xl opacity-10 transition-opacity group-hover:opacity-20", plan.highlight ? "bg-primary" : "bg-slate-400")} />

                            <div className="p-8 pb-4">
                                <div className="flex items-center justify-between mb-8">
                                    <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center border shadow-sm", plan.color)}>
                                        <plan.icon size={24} />
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {profile?.planId === plan.id && (
                                            <span className="px-3 py-1 bg-emerald-500 text-white text-[9px] font-black uppercase tracking-widest rounded-full shadow-lg shadow-emerald-200">
                                                Atual
                                            </span>
                                        )}
                                        {plan.highlight && (
                                            <span className="px-3 py-1 bg-primary text-white text-[9px] font-black uppercase tracking-widest rounded-full shadow-lg shadow-primary/20">
                                                Elite
                                            </span>
                                        )}
                                    </div>
                                </div>
                                
                                <div className="space-y-1">
                                    <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">{plan.name}</h3>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{plan.tagline}</p>
                                </div>

                                <div className="mt-6 pt-6 border-t border-slate-50">
                                    <div className="flex items-baseline gap-1">
                                        <span className="text-4xl font-black text-slate-900 tracking-tighter">{formatCurrency(plan.price)}</span>
                                        <span className="text-slate-400 text-xs font-bold uppercase tracking-tight">/mês</span>
                                    </div>
                                    <p className="text-[9px] font-black text-primary uppercase tracking-widest mt-2">{plan.limit}</p>
                                </div>
                            </div>

                            {/* Compact Features Section */}
                            <div className="p-8 pt-4 space-y-6 flex-1">
                                {plan.features.map((cat, i) => (
                                    <div key={i} className="space-y-2.5">
                                        <h4 className="text-[8px] font-black text-slate-300 uppercase tracking-[0.2em]">{cat.category}</h4>
                                        <ul className="space-y-2">
                                            {cat.items.map((f, j) => (
                                                <li key={j} className="flex items-center gap-2 group/item">
                                                    <div className="w-1.5 h-1.5 rounded-full bg-slate-200 group-hover/item:bg-primary transition-colors" />
                                                    <span className="text-[11px] text-slate-600 font-bold uppercase tracking-tight hover:text-slate-900 transition-colors cursor-default">{f}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                ))}
                            </div>

                            <div className="px-8 pb-8">
                                <Button 
                                    variant={plan.highlight ? 'primary' : profile?.planId === plan.id ? 'ghost' : 'outline'} 
                                    onClick={() => handleSelectPlan(plan.id, plan.price)}
                                    disabled={profile?.planId === plan.id || isUpdating !== null}
                                    className={cn(
                                        "w-full rounded-2xl h-12 text-[10px] font-black uppercase tracking-widest shadow-sm hover:shadow-lg transition-all",
                                        plan.highlight ? "shadow-primary/20" : "bg-transparent border-slate-200 text-slate-600 hover:bg-slate-50",
                                        profile?.planId === plan.id && "bg-emerald-50 border-emerald-100 text-emerald-600"
                                    )}
                                >
                                    {isUpdating === plan.id ? (
                                        <Loader2 size={14} className="animate-spin" />
                                    ) : profile?.planId === plan.id ? (
                                        'Plano Ativo'
                                    ) : (
                                        <>Selecionar Plano <ChevronRight size={14} className="ml-1" /></>
                                    )}
                                </Button>
                            </div>
                        </Card>
                    </motion.div>
                ))}
            </div>

            {/* Micro Note */}
            <div className="max-w-2xl mx-auto flex flex-col items-center justify-center gap-3 text-slate-300 text-center">
                <div className="flex items-center gap-2">
                    <Clock size={12} />
                    <p className="text-[10px] font-black uppercase tracking-widest leading-none">Consultoria personalizada e integração contábil impecável</p>
                </div>
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest max-w-md mx-auto leading-relaxed">
                    Nossa operação organiza seus processos e garante que sua contabilidade receba dados precisos para trabalhar com velocidade e segurança.
                </p>
            </div>
            {/* Differential Phrase */}
            <div className="mt-16 text-center max-w-3xl mx-auto">
                <div className="p-8 bg-white border border-slate-100 rounded-[2.5rem] shadow-xl shadow-slate-200/40 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-3xl -mr-16 -mt-16 group-hover:bg-primary/10 transition-colors" />
                    <div className="relative z-10">
                        <span className="text-2xl mb-4 block">🚀</span>
                        <p className="text-xs md:text-sm font-black text-slate-800 uppercase tracking-tight leading-relaxed">
                            {plansConfig?.differentialPhrase || 'Tecnologia e inteligência artificial aplicadas à gestão financeira para oferecer mais clareza, precisão e agilidade nas decisões do seu negócio.'}
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

