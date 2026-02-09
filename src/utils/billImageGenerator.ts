/**
 * Bill Image Generator for WhatsApp Sharing
 * 
 * Generates a clean bill image that looks like a printed receipt
 * for sharing via WhatsApp.
 */

import html2canvas from 'html2canvas';
import { getShortUnit, formatQuantityWithUnit } from '@/utils/timeUtils';

interface BillImageData {
    billNo: string;
    shopName: string;
    address?: string;
    phone?: string;
    items: Array<{ name: string; quantity: number; total: number; unit?: string; price: number }>;
    subtotal: number;
    discount?: number;
    additionalCharges?: Array<{ name: string; amount: number }>;
    total: number;
    date: string;
    time: string;
    paymentMethod: string;
    totalItemsCount?: number;
    smartQtyCount?: number;
}

/**
 * Generate bill HTML that matches print format
 */
const generateBillHtml = (data: BillImageData): string => {
    const itemRows = data.items.map(item => {
        const shortUnit = getShortUnit(item.unit);
        const qty = `${item.quantity}${shortUnit}`;
        return `
      <tr>
        <td style="padding: 4px 0; vertical-align: top; max-width: 140px; word-break: break-word;">${item.name}</td>
        <td style="padding: 4px 0; text-align: center; white-space: nowrap;">${qty}</td>
        <td style="padding: 4px 0; text-align: right;">₹${item.total.toFixed(0)}</td>
      </tr>
    `;
    }).join('');

    const chargesHtml = data.additionalCharges?.map(charge => `
    <tr>
      <td style="padding: 2px 0;">${charge.name}:</td>
      <td style="text-align: right; padding: 2px 0;">+₹${charge.amount.toFixed(0)}</td>
    </tr>
  `).join('') || '';

    const discountHtml = data.discount && data.discount > 0 ? `
    <tr style="color: #16a34a;">
      <td style="padding: 2px 0;">Discount:</td>
      <td style="text-align: right; padding: 2px 0;">-₹${data.discount.toFixed(0)}</td>
    </tr>
  ` : '';

    const totalItems = data.totalItemsCount || data.items.length;
    const smartQty = data.smartQtyCount || data.items.reduce((sum, i) => sum + i.quantity, 0);

    return `
    <div id="bill-image-content" style="
      font-family: 'Courier New', Courier, monospace;
      font-size: 13px;
      width: 280px;
      padding: 16px;
      background: white;
      color: #1a1a1a;
      line-height: 1.4;
    ">
      <!-- Header -->
      <div style="text-align: center; margin-bottom: 12px;">
        <div style="font-size: 18px; font-weight: bold; margin-bottom: 4px;">${data.shopName.toUpperCase()}</div>
        ${data.address ? `<div style="font-size: 11px; color: #666;">${data.address}</div>` : ''}
        ${data.phone ? `<div style="font-size: 11px; color: #666;">Ph: ${data.phone}</div>` : ''}
      </div>
      
      <div style="border-top: 2px dashed #333; margin: 8px 0;"></div>
      
      <!-- Bill Info -->
      <table style="width: 100%; margin-bottom: 8px;">
        <tr>
          <td style="font-weight: bold;">#${data.billNo}</td>
          <td style="text-align: right;">${data.date}</td>
        </tr>
        <tr>
          <td>Time:</td>
          <td style="text-align: right;">${data.time}</td>
        </tr>
      </table>
      
      <div style="border-top: 1px dashed #999; margin: 8px 0;"></div>
      
      <!-- Items Header -->
      <table style="width: 100%; border-collapse: collapse;">
        <tr style="font-weight: bold; border-bottom: 1px solid #333;">
          <td style="padding: 4px 0;">ITEM</td>
          <td style="padding: 4px 0; text-align: center;">QTY</td>
          <td style="padding: 4px 0; text-align: right;">AMT</td>
        </tr>
        ${itemRows}
      </table>
      
      <div style="border-top: 1px dashed #999; margin: 8px 0;"></div>
      
      <!-- Item Count -->
      <table style="width: 100%; font-weight: bold;">
        <tr>
          <td>Items: ${totalItems}</td>
          <td style="text-align: right;">Qty: ${smartQty}</td>
        </tr>
      </table>
      
      <div style="border-top: 1px dashed #999; margin: 8px 0;"></div>
      
      <!-- Totals -->
      <table style="width: 100%;">
        <tr>
          <td style="padding: 2px 0;">Subtotal:</td>
          <td style="text-align: right; padding: 2px 0;">₹${data.subtotal.toFixed(0)}</td>
        </tr>
        ${chargesHtml}
        ${discountHtml}
      </table>
      
      <div style="border-top: 2px solid #333; margin: 8px 0;"></div>
      
      <!-- Grand Total -->
      <table style="width: 100%; font-size: 16px; font-weight: bold;">
        <tr>
          <td>TOTAL:</td>
          <td style="text-align: right;">₹${data.total.toFixed(0)}</td>
        </tr>
      </table>
      
      <!-- Payment Method -->
      <table style="width: 100%; margin-top: 8px;">
        <tr>
          <td style="padding: 2px 0;">Paid via:</td>
          <td style="text-align: right; padding: 2px 0; text-transform: uppercase;">${data.paymentMethod}</td>
        </tr>
      </table>
      
      <div style="border-top: 1px dashed #999; margin: 12px 0 8px;"></div>
      
      <!-- Footer -->
      <div style="text-align: center; font-size: 12px; color: #666;">
        <div>Thank you for your visit! 🙏</div>
      </div>
    </div>
  `;
};

/**
 * Generate bill as image blob
 */
export const generateBillImage = async (data: BillImageData): Promise<Blob | null> => {
    try {
        // Create a temporary container for rendering
        const container = document.createElement('div');
        container.innerHTML = generateBillHtml(data);
        container.style.position = 'absolute';
        container.style.left = '-9999px';
        container.style.top = '0';
        document.body.appendChild(container);

        const billElement = container.querySelector('#bill-image-content') as HTMLElement;

        if (!billElement) {
            console.error('Bill element not found');
            document.body.removeChild(container);
            return null;
        }

        // Generate image using html2canvas
        const canvas = await html2canvas(billElement, {
            scale: 2, // Higher resolution
            backgroundColor: '#ffffff',
            logging: false,
            useCORS: true,
        });

        // Cleanup
        document.body.removeChild(container);

        // Convert canvas to blob
        return new Promise((resolve) => {
            canvas.toBlob((blob) => {
                resolve(blob);
            }, 'image/png', 0.95);
        });
    } catch (error) {
        console.error('Error generating bill image:', error);
        return null;
    }
};

/**
 * Share bill image via WhatsApp
 * Uses Web Share API if available, otherwise opens WhatsApp with just the phone number
 */
export const shareBillImageViaWhatsApp = async (
    phoneNumber: string,
    data: BillImageData
): Promise<{ success: boolean; method: 'share' | 'download' | 'error'; error?: string }> => {
    try {
        const blob = await generateBillImage(data);

        if (!blob) {
            return { success: false, method: 'error', error: 'Failed to generate bill image' };
        }

        const file = new File([blob], `Bill_${data.billNo}.png`, { type: 'image/png' });

        // Try Web Share API first (works on mobile)
        if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
            await navigator.share({
                files: [file],
                title: `Bill #${data.billNo}`,
                text: `Bill from ${data.shopName} - ₹${data.total.toFixed(0)}`
            });
            return { success: true, method: 'share' };
        }

        // Fallback: Download the image and show instructions
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `Bill_${data.billNo}.png`;
        link.click();
        URL.revokeObjectURL(url);

        // Clean phone number for WhatsApp
        let cleanPhone = phoneNumber.replace(/[\s\-\(\)]/g, '');
        if (!cleanPhone.startsWith('+')) {
            if (cleanPhone.startsWith('0')) {
                cleanPhone = cleanPhone.substring(1);
            }
            if (cleanPhone.length === 10) {
                cleanPhone = '91' + cleanPhone;
            }
        } else {
            cleanPhone = cleanPhone.substring(1);
        }

        // Open WhatsApp chat (image will be downloaded, user can attach)
        setTimeout(() => {
            window.open(`https://wa.me/${cleanPhone}`, '_blank');
        }, 500);

        return { success: true, method: 'download' };
    } catch (error: any) {
        console.error('Error sharing bill image:', error);
        return { success: false, method: 'error', error: error.message };
    }
};

export type { BillImageData };
