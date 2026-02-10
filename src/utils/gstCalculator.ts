/**
 * GST Calculator Utility
 * 
 * Pure functions for Indian GST calculations.
 * Supports: CGST/SGST split, inclusive/exclusive pricing,
 * composition scheme, cess, and bill-level tax summary.
 */

export interface TaxRateInfo {
    id: string;
    name: string;
    rate: number;
    cess_rate: number;
    hsn_code?: string;
}

export interface ItemTaxResult {
    taxableAmount: number;
    cgst: number;
    sgst: number;
    cess: number;
    totalTax: number;
    totalWithTax: number;
    taxRate: number;
}

export interface TaxSummaryEntry {
    taxName: string;
    taxRate: number;
    taxableAmount: number;
    cgst: number;
    sgst: number;
    cess: number;
    totalTax: number;
}

export interface BillTaxSummary {
    entries: TaxSummaryEntry[];
    totalTaxable: number;
    totalCgst: number;
    totalSgst: number;
    totalCess: number;
    totalTax: number;
}

export interface BillItemForTax {
    price: number;
    quantity: number;
    total: number;
    taxRate: number;
    taxName: string;
    cessRate: number;
    isTaxInclusive: boolean;
    hsnCode?: string;
}

/**
 * Calculate tax for a single item line
 * 
 * If INCLUSIVE: selling price already contains GST
 *   taxable = total × 100 / (100 + rate)
 *   tax = total - taxable
 * 
 * If EXCLUSIVE: GST is added on top
 *   taxable = total
 *   tax = total × rate / 100
 */
export const calculateItemTax = (
    lineTotal: number,
    taxRate: number,
    cessRate: number = 0,
    isTaxInclusive: boolean = true
): ItemTaxResult => {
    if (taxRate <= 0 && cessRate <= 0) {
        // Exempt or no tax
        return {
            taxableAmount: lineTotal,
            cgst: 0,
            sgst: 0,
            cess: 0,
            totalTax: 0,
            totalWithTax: lineTotal,
            taxRate: 0
        };
    }

    let taxableAmount: number;
    let gstAmount: number;
    let cessAmount: number;

    if (isTaxInclusive) {
        // Price includes GST — back-calculate
        const effectiveRate = taxRate + cessRate;
        taxableAmount = roundTo2(lineTotal * 100 / (100 + effectiveRate));
        gstAmount = roundTo2(taxableAmount * taxRate / 100);
        cessAmount = roundTo2(taxableAmount * cessRate / 100);
    } else {
        // Price excludes GST — add on top
        taxableAmount = lineTotal;
        gstAmount = roundTo2(taxableAmount * taxRate / 100);
        cessAmount = roundTo2(taxableAmount * cessRate / 100);
    }

    const cgst = roundTo2(gstAmount / 2);
    const sgst = roundTo2(gstAmount / 2);
    const totalTax = roundTo2(cgst + sgst + cessAmount);

    return {
        taxableAmount,
        cgst,
        sgst,
        cess: cessAmount,
        totalTax,
        totalWithTax: roundTo2(taxableAmount + totalTax),
        taxRate
    };
};

/**
 * Calculate composition scheme tax
 * Flat rate on total, no CGST/SGST split shown to customer
 */
export const calculateCompositionTax = (
    lineTotal: number,
    compositionRate: number
): ItemTaxResult => {
    const taxableAmount = roundTo2(lineTotal * 100 / (100 + compositionRate));
    const totalTax = roundTo2(lineTotal - taxableAmount);

    return {
        taxableAmount,
        cgst: roundTo2(totalTax / 2),
        sgst: roundTo2(totalTax / 2),
        cess: 0,
        totalTax,
        totalWithTax: lineTotal,
        taxRate: compositionRate
    };
};

/**
 * Build bill-level tax summary grouped by tax rate
 * This is stored as JSON snapshot in bills.tax_summary
 */
export const calculateBillTaxSummary = (
    items: BillItemForTax[],
    isComposition: boolean = false,
    compositionRate: number = 1
): BillTaxSummary => {
    if (isComposition) {
        // Composition scheme: single entry with flat rate
        const totalAmount = items.reduce((sum, item) => sum + item.total, 0);
        const result = calculateCompositionTax(totalAmount, compositionRate);

        return {
            entries: [{
                taxName: `Composition ${compositionRate}%`,
                taxRate: compositionRate,
                taxableAmount: result.taxableAmount,
                cgst: result.cgst,
                sgst: result.sgst,
                cess: 0,
                totalTax: result.totalTax
            }],
            totalTaxable: result.taxableAmount,
            totalCgst: result.cgst,
            totalSgst: result.sgst,
            totalCess: 0,
            totalTax: result.totalTax
        };
    }

    // Group items by tax rate
    const rateGroups: Record<string, {
        taxName: string;
        taxRate: number;
        cessRate: number;
        items: BillItemForTax[];
    }> = {};

    items.forEach(item => {
        const key = `${item.taxRate}_${item.cessRate || 0}`;
        if (!rateGroups[key]) {
            rateGroups[key] = {
                taxName: item.taxName || `GST ${item.taxRate}%`,
                taxRate: item.taxRate,
                cessRate: item.cessRate || 0,
                items: []
            };
        }
        rateGroups[key].items.push(item);
    });

    const entries: TaxSummaryEntry[] = [];
    let totalTaxable = 0, totalCgst = 0, totalSgst = 0, totalCess = 0, totalTax = 0;

    Object.values(rateGroups).forEach(group => {
        let groupTaxable = 0, groupCgst = 0, groupSgst = 0, groupCess = 0;

        group.items.forEach(item => {
            const result = calculateItemTax(item.total, group.taxRate, group.cessRate, item.isTaxInclusive);
            groupTaxable += result.taxableAmount;
            groupCgst += result.cgst;
            groupSgst += result.sgst;
            groupCess += result.cess;
        });

        groupTaxable = roundTo2(groupTaxable);
        groupCgst = roundTo2(groupCgst);
        groupSgst = roundTo2(groupSgst);
        groupCess = roundTo2(groupCess);
        const groupTotal = roundTo2(groupCgst + groupSgst + groupCess);

        if (group.taxRate > 0 || group.cessRate > 0) {
            entries.push({
                taxName: group.taxName,
                taxRate: group.taxRate,
                taxableAmount: groupTaxable,
                cgst: groupCgst,
                sgst: groupSgst,
                cess: groupCess,
                totalTax: groupTotal
            });
        }

        totalTaxable += groupTaxable;
        totalCgst += groupCgst;
        totalSgst += groupSgst;
        totalCess += groupCess;
        totalTax += groupTotal;
    });

    // Sort by tax rate
    entries.sort((a, b) => a.taxRate - b.taxRate);

    return {
        entries,
        totalTaxable: roundTo2(totalTaxable),
        totalCgst: roundTo2(totalCgst),
        totalSgst: roundTo2(totalSgst),
        totalCess: roundTo2(totalCess),
        totalTax: roundTo2(totalTax)
    };
};

/**
 * Format tax summary for thermal printer (compact single-row format)
 * Output: "TaxName  Taxable  CGST    SGST"
 *         "GST 5%   542.86   13.57   13.57"
 */
export const formatTaxForPrint = (
    summary: BillTaxSummary,
    lineWidth: number = 32
): string[] => {
    if (!summary.entries.length) return [];

    const lines: string[] = [];

    // Header
    if (lineWidth >= 48) {
        // 80mm printer
        lines.push(padColumns(['Tax', 'Taxable', 'CGST', 'SGST', 'Total'], [10, 10, 9, 9, 10]));
    } else {
        // 58mm printer
        lines.push(padColumns(['Tax', 'Taxable', 'CGST', 'SGST'], [8, 8, 8, 8]));
    }

    summary.entries.forEach(entry => {
        const name = entry.taxName.length > 8 ? entry.taxName.substring(0, 8) : entry.taxName;
        if (lineWidth >= 48) {
            lines.push(padColumns([
                name,
                entry.taxableAmount.toFixed(2),
                entry.cgst.toFixed(2),
                entry.sgst.toFixed(2),
                entry.totalTax.toFixed(2)
            ], [10, 10, 9, 9, 10]));
        } else {
            lines.push(padColumns([
                name,
                entry.taxableAmount.toFixed(0),
                entry.cgst.toFixed(2),
                entry.sgst.toFixed(2)
            ], [8, 8, 8, 8]));
        }
    });

    return lines;
};

/**
 * Convert tax summary to JSON for storage in bills.tax_summary
 */
export const taxSummaryToJson = (summary: BillTaxSummary): Record<string, any> => {
    const result: Record<string, any> = {};
    summary.entries.forEach(entry => {
        result[String(entry.taxRate)] = {
            taxName: entry.taxName,
            taxable: entry.taxableAmount,
            cgst: entry.cgst,
            sgst: entry.sgst,
            cess: entry.cess,
            total: entry.totalTax
        };
    });
    return result;
};

/**
 * Restore tax summary from stored JSON
 */
export const taxSummaryFromJson = (json: Record<string, any> | null | undefined): BillTaxSummary => {
    if (!json || typeof json !== 'object') {
        return { entries: [], totalTaxable: 0, totalCgst: 0, totalSgst: 0, totalCess: 0, totalTax: 0 };
    }

    const entries: TaxSummaryEntry[] = [];
    let totalTaxable = 0, totalCgst = 0, totalSgst = 0, totalCess = 0, totalTax = 0;

    Object.entries(json).forEach(([rate, data]: [string, any]) => {
        if (data && typeof data === 'object') {
            const entry: TaxSummaryEntry = {
                taxName: data.taxName || `GST ${rate}%`,
                taxRate: parseFloat(rate),
                taxableAmount: data.taxable || 0,
                cgst: data.cgst || 0,
                sgst: data.sgst || 0,
                cess: data.cess || 0,
                totalTax: data.total || 0
            };
            entries.push(entry);
            totalTaxable += entry.taxableAmount;
            totalCgst += entry.cgst;
            totalSgst += entry.sgst;
            totalCess += entry.cess;
            totalTax += entry.totalTax;
        }
    });

    entries.sort((a, b) => a.taxRate - b.taxRate);

    return { entries, totalTaxable, totalCgst, totalSgst, totalCess, totalTax };
};

/**
 * Validate GSTIN format (15 characters)
 * Format: 2-digit state code + 10-char PAN + 1 entity + Z + 1 checksum
 */
export const isValidGSTIN = (gstin: string): boolean => {
    if (!gstin) return false;
    const cleaned = gstin.trim().toUpperCase();
    // Basic format: 2 digits + 5 alpha + 4 digit + 1 alpha + 1 alphanumeric + Z + 1 alphanumeric
    const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[A-Z0-9]{1}Z[A-Z0-9]{1}$/;
    return gstinRegex.test(cleaned);
};

// Utility: round to 2 decimal places
const roundTo2 = (n: number): number => Math.round(n * 100) / 100;

// Utility: pad columns for printer
const padColumns = (cols: string[], widths: number[]): string => {
    return cols.map((col, i) => {
        const w = widths[i] || 8;
        return col.length >= w ? col.substring(0, w) : col + ' '.repeat(w - col.length);
    }).join('');
};
