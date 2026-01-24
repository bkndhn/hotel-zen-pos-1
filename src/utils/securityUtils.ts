/**
 * Security Utilities for Input Validation and Sanitization
 * Protects against XSS, SQL Injection, and other attacks
 */

// Sanitize HTML to prevent XSS attacks
export const sanitizeHtml = (input: string): string => {
    if (!input || typeof input !== 'string') return '';

    return input
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;')
        .replace(/\//g, '&#x2F;');
};

// Sanitize user input for database queries (prevents injection)
export const sanitizeInput = (input: string): string => {
    if (!input || typeof input !== 'string') return '';

    // Remove potentially dangerous characters
    return input
        .replace(/[<>'"`;\\]/g, '')
        .trim()
        .slice(0, 1000); // Limit length to prevent DoS
};

// Validate email format
export const isValidEmail = (email: string): boolean => {
    if (!email || typeof email !== 'string') return false;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email) && email.length <= 254;
};

// Validate password strength
export const isStrongPassword = (password: string): { valid: boolean; message: string } => {
    if (!password || typeof password !== 'string') {
        return { valid: false, message: 'Password is required' };
    }

    if (password.length < 8) {
        return { valid: false, message: 'Password must be at least 8 characters' };
    }

    if (!/[A-Z]/.test(password)) {
        return { valid: false, message: 'Password must contain at least one uppercase letter' };
    }

    if (!/[a-z]/.test(password)) {
        return { valid: false, message: 'Password must contain at least one lowercase letter' };
    }

    if (!/[0-9]/.test(password)) {
        return { valid: false, message: 'Password must contain at least one number' };
    }

    return { valid: true, message: 'Password is strong' };
};

// Validate numeric input
export const isValidNumber = (value: any, min?: number, max?: number): boolean => {
    const num = Number(value);
    if (isNaN(num) || !isFinite(num)) return false;
    if (min !== undefined && num < min) return false;
    if (max !== undefined && num > max) return false;
    return true;
};

// Sanitize filename to prevent path traversal
export const sanitizeFilename = (filename: string): string => {
    if (!filename || typeof filename !== 'string') return '';

    return filename
        .replace(/[^a-zA-Z0-9._-]/g, '_')
        .replace(/\.{2,}/g, '.')
        .slice(0, 255);
};

// Rate limiting helper (client-side)
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

export const checkRateLimit = (
    action: string,
    maxAttempts: number = 5,
    windowMs: number = 60000
): boolean => {
    const now = Date.now();
    const record = rateLimitMap.get(action);

    if (!record || now > record.resetTime) {
        rateLimitMap.set(action, { count: 1, resetTime: now + windowMs });
        return true;
    }

    if (record.count >= maxAttempts) {
        return false; // Rate limited
    }

    record.count++;
    return true;
};

// Clear rate limit (call after successful action)
export const clearRateLimit = (action: string): void => {
    rateLimitMap.delete(action);
};

// Validate UUID format
export const isValidUUID = (uuid: string): boolean => {
    if (!uuid || typeof uuid !== 'string') return false;
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(uuid);
};

// Validate date format (YYYY-MM-DD)
export const isValidDate = (date: string): boolean => {
    if (!date || typeof date !== 'string') return false;
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(date)) return false;

    const d = new Date(date);
    return !isNaN(d.getTime());
};

// Secure object cloning (prevents prototype pollution)
export const secureClone = <T>(obj: T): T => {
    return JSON.parse(JSON.stringify(obj));
};

// Log security events (can be expanded to send to logging service)
export const logSecurityEvent = (
    event: string,
    details: Record<string, any> = {}
): void => {
    console.warn(`[SECURITY] ${event}`, {
        timestamp: new Date().toISOString(),
        ...details
    });
};
