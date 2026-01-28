/**
 * WhatsApp Bill Sharing Utilities
 */

import { getShortUnit } from '@/utils/timeUtils';

interface BillShareData {
  billNo: string;
  shopName: string;
  items: Array<{ name: string; quantity: number; total: number; unit?: string }>;
  subtotal: number;
  discount?: number;
  additionalCharges?: Array<{ name: string; amount: number }>;
  total: number;
  date: string;
  time: string;
  paymentMethod: string;
}

/**
 * Format bill data into a clean text message for WhatsApp
 */
export const formatBillMessage = (data: BillShareData): string => {
  let message = `🧾 *${data.shopName}*\n`;
  message += `━━━━━━━━━━━━━━\n`;
  message += `📋 Bill #${data.billNo}\n`;
  message += `📅 ${data.date} | ${data.time}\n`;
  message += `━━━━━━━━━━━━━━\n\n`;

  // Items
  message += `*Items:*\n`;
  data.items.forEach((item) => {
    const shortUnit = getShortUnit(item.unit);
    const qty = `${item.quantity} ${shortUnit}`;
    message += `• ${item.name} (${qty}) - ₹${item.total.toFixed(0)}\n`;
  });

  message += `\n━━━━━━━━━━━━━━\n`;
  message += `Subtotal: ₹${data.subtotal.toFixed(0)}\n`;

  // Additional charges
  if (data.additionalCharges && data.additionalCharges.length > 0) {
    data.additionalCharges.forEach(charge => {
      message += `${charge.name}: ₹${charge.amount.toFixed(0)}\n`;
    });
  }

  // Discount
  if (data.discount && data.discount > 0) {
    message += `Discount: -₹${data.discount.toFixed(0)}\n`;
  }

  message += `━━━━━━━━━━━━━━\n`;
  message += `*TOTAL: ₹${data.total.toFixed(0)}*\n`;
  message += `Paid via: ${data.paymentMethod}\n\n`;
  message += `Thank you for your visit! 🙏`;

  return message;
};

/**
 * Open WhatsApp with pre-filled message (Direct/Manual method)
 */
export const shareViaWhatsApp = (phoneNumber: string, message: string): void => {
  // Clean phone number (remove spaces, dashes, etc.)
  let cleanPhone = phoneNumber.replace(/[\s\-\(\)]/g, '');

  // Add country code if not present (default to India +91)
  if (!cleanPhone.startsWith('+')) {
    if (cleanPhone.startsWith('0')) {
      cleanPhone = cleanPhone.substring(1);
    }
    if (cleanPhone.length === 10) {
      cleanPhone = '91' + cleanPhone;
    }
  } else {
    cleanPhone = cleanPhone.substring(1); // Remove + for wa.me link
  }

  // URL encode the message
  const encodedMessage = encodeURIComponent(message);

  // Open WhatsApp
  const whatsappUrl = `https://wa.me/${cleanPhone}?text=${encodedMessage}`;
  window.open(whatsappUrl, '_blank');
};

/**
 * Send via WhatsApp Business API (Automatic method)
 * This is a placeholder - actual implementation requires edge function
 */
export const sendViaBusinessApi = async (
  phoneNumber: string,
  message: string,
  apiToken: string,
  phoneNumberId: string
): Promise<{ success: boolean; error?: string }> => {
  // This would call an edge function to send via Meta's API
  // For now, return a placeholder response
  console.log('WhatsApp Business API send requested', { phoneNumber, phoneNumberId });

  return {
    success: false,
    error: 'WhatsApp Business API integration coming soon. Please use direct WhatsApp for now.'
  };
};

/**
 * Validate phone number format
 */
export const isValidPhoneNumber = (phone: string): boolean => {
  const cleaned = phone.replace(/[\s\-\(\)\+]/g, '');
  // Indian mobile: 10 digits starting with 6-9
  // Or with country code: 91 + 10 digits
  return /^(91)?[6-9]\d{9}$/.test(cleaned) || /^[6-9]\d{9}$/.test(cleaned);
};
