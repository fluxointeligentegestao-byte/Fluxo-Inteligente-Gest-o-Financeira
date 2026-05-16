
export type UserPlan = 'essencial' | 'profissional' | 'premium';

export interface PlanFeatures {
    reports: string[];
    tabs: string[];
}

// Explicit mappings for each plan level
export const PLAN_CONFIG = {
    essencial: {
        level: 1,
        label: 'Essencial',
        keywords: ['essenc', 'basic'],
        entriesLimit: 50
    },
    profissional: {
        level: 2,
        label: 'Profissional',
        keywords: ['profissi', 'professional'],
        entriesLimit: 150
    },
    premium: {
        level: 3,
        label: 'Premium',
        keywords: ['premium', 'consult', 'vip', 'master'],
        entriesLimit: 0 // Unlimited
    }
};

/**
 * Normalizes any plan string to one of the three standard plan IDs
 */
export const normalizePlan = (plan: string | undefined | null): UserPlan => {
    if (!plan) return 'essencial'; // Default to essencial if not set for safety
    
    const p = String(plan).toLowerCase().trim();
    
    if (p.includes('premium') || p.includes('consult') || p.includes('vip') || p.includes('master')) return 'premium';
    if (p.includes('profi') || p.includes('professio')) return 'profissional';
    
    return 'essencial';
};

/**
 * Normalizes a string for comparison by removing accents, special characters, and converting to lowercase
 */
export const normalizeString = (str: string): string => {
    if (!str) return '';
    return str
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        // Remove emojis and all non-alphanumeric characters for a clean comparison
        .replace(/[^\w\s]/gi, '')
        .replace(/\s+/g, '')
        .trim();
};

/**
 * Checks if a plan level can access a target category
 */
export const canAccessReport = (plan: string | undefined | null, category: string, dynamicConfig?: any): boolean => {
    if (!category) return false;
    
    // Determine target level
    const normalizedPlan = normalizePlan(plan);
    const searchCat = normalizeString(category);
    
    // Conciliação Bancária is mandatory for ALL plans according to user request
    if (searchCat.includes('conciliacao') || searchCat.includes('bancaria')) return true;

    // Explicit keywords mapping for robust matching
    const keywords = {
        agenda: ['agenda', 'financeiromensal', 'contas'],
        conciliacao: ['concilia', 'bancaria'],
        dre: ['dre', 'gerencial'],
        fluxo: ['fluxo', 'caixa'],
        mensal: ['mensal', 'fechamento', 'fechamentomensal'],
        dashboard: ['dashboard', 'bi', 'indicador', 'indicadores']
    };

    // Extract proper config for this plan
    let planConfig = (dynamicConfig && dynamicConfig[normalizedPlan]);
    
    // Fallback if config is an array (legacy format)
    if (!planConfig && Array.isArray(dynamicConfig)) {
        planConfig = dynamicConfig.find((p: any) => (p.id || p.planId || '').toLowerCase() === normalizedPlan);
    }

    // If we have an explicit dynamic configuration for this plan and it has the reports list,
    // we MUST use it as the source of truth.
    if (planConfig && planConfig.reports) {
        return planConfig.reports.some((r: string) => {
            const allowed = normalizeString(r);
            // Strict comparison for reports list
            return searchCat === allowed || searchCat.includes(allowed);
        });
    }

    // Default static logic if no dynamic config
    const level = PLAN_CONFIG[normalizedPlan]?.level || 1;
    
    // Level 1 access (Essencial + up)
    if (keywords.agenda.some(k => searchCat.includes(k))) return level >= 1;
    if (keywords.conciliacao.some(k => searchCat.includes(k))) return level >= 1;
    
    // Level 2 access (Profissional + up)
    if (keywords.dre.some(k => searchCat.includes(k))) return level >= 2;
    if (keywords.fluxo.some(k => searchCat.includes(k))) return level >= 2;
    
    // Level 3 access (Premium only)
    if (keywords.mensal.some(k => searchCat.includes(k))) return level >= 3;
    if (keywords.dashboard.some(k => searchCat.includes(k))) return level >= 3;
    
    return false;
};

/**
 * Checks if a plan can access a specific tab
 */
export const canAccessTab = (plan: string | undefined | null, tabId: string, isAdmin: boolean = false, dynamicConfig?: any): boolean => {
    if (isAdmin) return true;
    
    // Public tabs
    const publicTabs = ['dashboard', 'plans', 'support', 'profile'];
    if (publicTabs.includes(tabId)) return true;
    
    const normalizedPlan = normalizePlan(plan);
    const config = (dynamicConfig && dynamicConfig[normalizedPlan]) || PLAN_CONFIG[normalizedPlan];
    const level = config.level;
    
    // Feature-specific tabs
    if (tabId === 'agenda') return level >= 1;
    if (tabId === 'documents') return level >= 1;
    if (tabId === 'reports') return level >= 1;
    
    return false;
};
