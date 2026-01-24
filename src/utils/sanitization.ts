/**
 * Input sanitization and validation utilities
 * Helps prevent XSS attacks and ensures data integrity
 */

// HTML entity encoding to prevent XSS
export function escapeHtml(text: string): string {
    const map: Record<string, string> = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;',
    };
    return text.replace(/[&<>"']/g, (char) => map[char] || char);
}

// Sanitize string input - removes potentially dangerous characters
export function sanitizeString(input: string, maxLength: number = 500): string {
    if (typeof input !== 'string') return '';

    return input
        .trim()
        .slice(0, maxLength)
        // Remove null bytes
        .replace(/\0/g, '')
        // Remove control characters except newline and tab
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
}

// Sanitize for database - prevents SQL injection patterns
export function sanitizeForDb(input: string): string {
    if (typeof input !== 'string') return '';

    return sanitizeString(input)
        // Supabase uses parameterized queries, but extra safety doesn't hurt
        .replace(/['";\\]/g, '');
}

// Validate email format
export function isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

// Validate phone number (basic validation)
export function isValidPhone(phone: string): boolean {
    const phoneRegex = /^[\d\s\-+()]{7,20}$/;
    return phoneRegex.test(phone);
}

// Sanitize and validate numeric input
export function sanitizeNumber(input: any, min?: number, max?: number): number {
    const num = Number(input);

    if (isNaN(num) || !isFinite(num)) {
        return 0;
    }

    let result = num;

    if (min !== undefined && result < min) {
        result = min;
    }

    if (max !== undefined && result > max) {
        result = max;
    }

    return result;
}

// Sanitize price/amount input
export function sanitizeAmount(input: any): number {
    return Math.max(0, sanitizeNumber(input, 0, 10000000)); // Max 1 crore
}

// Sanitize quantity input
export function sanitizeQuantity(input: any): number {
    return Math.max(0, Math.floor(sanitizeNumber(input, 0, 10000)));
}

// Validate and sanitize bill data before saving
export interface BillValidationResult {
    isValid: boolean;
    errors: string[];
    sanitizedData?: any;
}

export function validateBillData(billData: any): BillValidationResult {
    const errors: string[] = [];

    if (!billData) {
        return { isValid: false, errors: ['Bill data is required'] };
    }

    // Validate total amount
    if (billData.total_amount === undefined || billData.total_amount < 0) {
        errors.push('Invalid total amount');
    }

    // Validate bill items
    if (!Array.isArray(billData.items) || billData.items.length === 0) {
        errors.push('Bill must have at least one item');
    }

    // Validate payment method
    if (!billData.payment_method) {
        errors.push('Payment method is required');
    }

    if (errors.length > 0) {
        return { isValid: false, errors };
    }

    // Sanitize the data
    const sanitizedData = {
        ...billData,
        total_amount: sanitizeAmount(billData.total_amount),
        discount: sanitizeAmount(billData.discount || 0),
        customer_name: billData.customer_name ? sanitizeString(billData.customer_name, 100) : null,
        table_number: billData.table_number ? sanitizeString(billData.table_number, 20) : null,
        note: billData.note ? sanitizeString(billData.note, 500) : null,
        items: billData.items.map((item: any) => ({
            ...item,
            quantity: sanitizeQuantity(item.quantity),
            price: sanitizeAmount(item.price),
        })),
    };

    return { isValid: true, errors: [], sanitizedData };
}

// Rate limiting helper for preventing spam
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

export function checkRateLimit(key: string, maxAttempts: number = 5, windowMs: number = 60000): boolean {
    const now = Date.now();
    const record = rateLimitMap.get(key);

    if (!record || now > record.resetTime) {
        rateLimitMap.set(key, { count: 1, resetTime: now + windowMs });
        return true;
    }

    if (record.count >= maxAttempts) {
        return false;
    }

    record.count++;
    return true;
}

// Clear rate limit (e.g., after successful action)
export function clearRateLimit(key: string): void {
    rateLimitMap.delete(key);
}
