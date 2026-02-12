/**
 * Shared Bill Number Generator
 * Used by both Billing.tsx (POS) and TableOrderBilling.tsx (table QR orders)
 * to ensure ONE unified sequential bill number series.
 *
 * Uses localStorage counter keyed by adminId for instant (0ms) generation.
 */

export const getInstantBillNumber = (adminId: string | null | undefined): string => {
    const continueBillFromYesterday = localStorage.getItem('hotel_pos_continue_bill_number') !== 'false';
    const counterKey = `bill_counter_${adminId || 'default'}`;
    const dateKey = `bill_date_${adminId || 'default'}`;

    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const savedDate = localStorage.getItem(dateKey);

    if (continueBillFromYesterday) {
        // Sequential numbering - increment forever
        const counter = parseInt(localStorage.getItem(counterKey) || '0') + 1;
        localStorage.setItem(counterKey, counter.toString());
        return `BILL-${String(counter).padStart(6, '0')}`;
    } else {
        // Daily reset numbering
        let counter: number;
        if (savedDate !== todayStr) {
            // New day - reset counter
            counter = 1;
            localStorage.setItem(dateKey, todayStr);
        } else {
            counter = parseInt(localStorage.getItem(counterKey) || '0') + 1;
        }
        localStorage.setItem(counterKey, counter.toString());
        const datePrefix = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${String(today.getFullYear()).slice(-2)}`;
        return `${datePrefix}-${String(counter).padStart(3, '0')}`;
    }
};
