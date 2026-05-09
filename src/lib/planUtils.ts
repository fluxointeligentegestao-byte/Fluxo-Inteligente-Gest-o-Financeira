
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
        keywords: ['essenc', 'basic']
    },
    profissional: {
        level: 2,
        label: 'Profissional',
        keywords: ['profissi', 'professional']
    },
    premium: {
        level: 3,
        label: 'Premium',
        keywords: ['premium', 'consult', 'vip', 'master']
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
 * Checks if a plan level can access a target category
 */
export const canAccessReport = (plan: string | undefined | null, category: string, dynamicConfig?: any): boolean => {
    // Determine target level
    const normalizedPlan = normalizePlan(plan);
    
    // Use dynamic configuration if provided
    if (dynamicConfig && dynamicConfig[normalizedPlan]) {
        const allowedReports = dynamicConfig[normalizedPlan].reports || [];
        const cleanCat = category.toLowerCase();
        return allowedReports.some((r: string) => 
            cleanCat.includes(r.toLowerCase()) || 
            r.toLowerCase().includes(cleanCat)
        );
    }

    const level = PLAN_CONFIG[normalizedPlan].level;
    
    const cleanCat = category.toLowerCase();
    
    // Level 1 access (Essencial + up)
    if (cleanCat.includes('agenda') || cleanCat.includes('contas')) return level >= 1;
    if (cleanCat.includes('concilia')) return level >= 1;
    
    // Level 2 access (Profissional + up)
    if (cleanCat.includes('dre') || cleanCat.includes('gerencial')) return level >= 2;
    if (cleanCat.includes('fluxo') || cleanCat.includes('caixa')) return level >= 2;
    
    // Level 3 access (Premium only)
    if (cleanCat.includes('mensal')) return level >= 3;
    if (cleanCat.includes('dashboard')) return level >= 3;
    
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
