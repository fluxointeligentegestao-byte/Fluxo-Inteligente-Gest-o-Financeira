
/**
 * Normalizes a date string from various formats (YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY)
 * to a standardized YYYY-MM-DD format.
 */
export function normalizeDate(dateStr: string): string {
    if (!dateStr) return '';
    const trimmed = dateStr.trim();
    
    // Check if it's YYYY-MM-DD or YYYY-M-D
    if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(trimmed)) {
        const separator = trimmed.includes('-') ? '-' : '/';
        const parts = trimmed.split(separator);
        const year = parts[0];
        const month = parts[1].padStart(2, '0');
        const day = parts[2].substring(0, 2).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }
    
    // DD/MM/YYYY or DD/MM/YY
    if (trimmed.includes('/')) {
        const parts = trimmed.split('/');
        if (parts.length === 3) {
            const day = parts[0].padStart(2, '0');
            const month = parts[1].padStart(2, '0');
            let year = parts[2].substring(0, 4);
            if (year.length === 2) year = '20' + year;
            return `${year}-${month}-${day}`;
        }
    }
    
    // DD-MM-YYYY or DD-MM-YY
    if (trimmed.includes('-')) {
        const parts = trimmed.split('-');
        if (parts.length === 3) {
            // If already YYYY-MM-DD handled above, but just in case
            if (parts[0].length === 4) {
                const year = parts[0];
                const month = parts[1].padStart(2, '0');
                const day = parts[2].substring(0, 2).padStart(2, '0');
                return `${year}-${month}-${day}`;
            }
            const day = parts[0].padStart(2, '0');
            const month = parts[1].padStart(2, '0');
            let year = parts[2].substring(0, 4);
            if (year.length === 2) year = '20' + year;
            return `${year}-${month}-${day}`;
        }
    }
    
    return trimmed;
}

/**
 * Extracts YYYY-MM from a date string in various formats.
 */
export function getYearMonth(dateStr: string): string {
    if (!dateStr) return '';
    const normalized = normalizeDate(dateStr);
    
    // Ensure we have a valid normalized date before substring
    if (normalized.length >= 7 && /^\d{4}-\d{2}/.test(normalized)) {
        return normalized.substring(0, 7);
    }
    
    // Fallback: try to find something that looks like YYYY-MM
    const match = dateStr.match(/(\d{4})-(\d{1,2})/);
    if (match) {
        return `${match[1]}-${match[2].padStart(2, '0')}`;
    }
    
    return '';
}
