import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { toast } from '@/hooks/use-toast';
import { Users, Search, Phone, Calendar, DollarSign, Download, FileSpreadsheet } from 'lucide-react';
import { format } from 'date-fns';
import * as XLSX from 'xlsx';

interface Customer {
  id: string;
  phone: string;
  name: string | null;
  visit_count: number;
  total_spent: number;
  last_visit: string;
  created_at: string;
}

const CRM: React.FC = () => {
  const { profile } = useAuth();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetchCustomers();
  }, []);

  const fetchCustomers = async () => {
    try {
      const { data, error } = await (supabase as any)
        .from('customers')
        .select('*')
        .order('last_visit', { ascending: false });

      if (error) throw error;
      setCustomers(data || []);
    } catch (error) {
      console.error('Error fetching customers:', error);
      toast({
        title: "Error",
        description: "Failed to fetch customers",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const filteredCustomers = customers.filter(customer => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      customer.phone.toLowerCase().includes(query) ||
      (customer.name?.toLowerCase() || '').includes(query)
    );
  });

  const exportToExcel = () => {
    try {
      const data = customers.map(c => ({
        'Phone': c.phone,
        'Name': c.name || '-',
        'Total Visits': c.visit_count,
        'Total Spent': `₹${c.total_spent.toFixed(2)}`,
        'Last Visit': format(new Date(c.last_visit), 'dd/MM/yyyy hh:mm a'),
        'First Visit': format(new Date(c.created_at), 'dd/MM/yyyy')
      }));

      const ws = XLSX.utils.json_to_sheet(data);
      
      // Auto-fit column widths
      const colWidths = Object.keys(data[0] || {}).map(key => ({
        wch: Math.max(key.length, ...data.map(row => String((row as any)[key]).length)) + 2
      }));
      ws['!cols'] = colWidths;

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Customers');
      XLSX.writeFile(wb, `CRM_Export_${format(new Date(), 'dd-MM-yyyy')}.xlsx`);

      toast({
        title: "Success",
        description: "Customer data exported to Excel!"
      });
    } catch (error) {
      console.error('Export error:', error);
      toast({
        title: "Error",
        description: "Failed to export data",
        variant: "destructive"
      });
    }
  };

  const exportToPDF = () => {
    try {
      const printContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>CRM Export</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; }
            h1 { text-align: center; margin-bottom: 20px; }
            table { width: 100%; border-collapse: collapse; font-size: 12px; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background: #f4f4f4; font-weight: bold; }
            .summary { margin-bottom: 20px; }
            @media print { body { padding: 0; } }
          </style>
        </head>
        <body>
          <h1>${profile?.hotel_name || 'Hotel'} - Customer Report</h1>
          <div class="summary">
            <p><strong>Total Customers:</strong> ${customers.length}</p>
            <p><strong>Total Revenue:</strong> ₹${customers.reduce((sum, c) => sum + c.total_spent, 0).toFixed(2)}</p>
            <p><strong>Generated:</strong> ${format(new Date(), 'dd/MM/yyyy hh:mm a')}</p>
          </div>
          <table>
            <thead>
              <tr>
                <th>Phone</th>
                <th>Name</th>
                <th>Visits</th>
                <th>Total Spent</th>
                <th>Last Visit</th>
              </tr>
            </thead>
            <tbody>
              ${customers.map(c => `
                <tr>
                  <td>${c.phone}</td>
                  <td>${c.name || '-'}</td>
                  <td>${c.visit_count}</td>
                  <td>₹${c.total_spent.toFixed(2)}</td>
                  <td>${format(new Date(c.last_visit), 'dd/MM/yyyy')}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </body>
        </html>
      `;

      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(printContent);
        printWindow.document.close();
        printWindow.onload = () => {
          printWindow.print();
        };
      }

      toast({
        title: "Success",
        description: "PDF export opened in new window"
      });
    } catch (error) {
      console.error('PDF export error:', error);
      toast({
        title: "Error",
        description: "Failed to generate PDF",
        variant: "destructive"
      });
    }
  };

  const totalRevenue = customers.reduce((sum, c) => sum + c.total_spent, 0);
  const totalVisits = customers.reduce((sum, c) => sum + c.visit_count, 0);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-4 space-y-4 max-w-full overflow-x-hidden pb-24 md:pb-4">
      {/* Header */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 bg-gradient-to-br from-primary to-primary/80 rounded-xl flex items-center justify-center shadow-md shadow-primary/20">
            <Users className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-lg sm:text-xl font-bold tracking-tight">CRM</h1>
            <p className="text-[10px] sm:text-xs text-muted-foreground">Customer relationship management</p>
          </div>
        </div>

        <div className="flex gap-2">
          <Button onClick={exportToExcel} variant="outline" size="sm" className="text-xs h-8">
            <FileSpreadsheet className="w-3 h-3 mr-1" />
            Excel
          </Button>
          <Button onClick={exportToPDF} variant="outline" size="sm" className="text-xs h-8">
            <Download className="w-3 h-3 mr-1" />
            PDF
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="p-3">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-primary" />
            <div>
              <p className="text-xs text-muted-foreground">Customers</p>
              <p className="text-lg font-bold">{customers.length}</p>
            </div>
          </div>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-blue-500" />
            <div>
              <p className="text-xs text-muted-foreground">Total Visits</p>
              <p className="text-lg font-bold">{totalVisits}</p>
            </div>
          </div>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-green-500" />
            <div>
              <p className="text-xs text-muted-foreground">Revenue</p>
              <p className="text-lg font-bold">₹{totalRevenue.toFixed(0)}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search by phone, name, or email..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9 h-9 text-sm"
        />
      </div>

      {/* Customer List */}
      <Card>
        <CardHeader className="p-3">
          <CardTitle className="text-sm">Customer List ({filteredCustomers.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-3 pt-0">
          {filteredCustomers.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              No customers found
            </div>
          ) : (
            <div className="space-y-2">
              {filteredCustomers.map((customer) => (
                <div
                  key={customer.id}
                  className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Phone className="w-3 h-3 text-primary" />
                      <span className="font-semibold text-sm">{customer.phone}</span>
                    </div>
                    {customer.name && (
                      <p className="text-xs text-muted-foreground mt-0.5">{customer.name}</p>
                    )}
                    <p className="text-[10px] text-muted-foreground">
                      {customer.visit_count} visits • Last: {format(new Date(customer.last_visit), 'dd MMM yyyy')}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-sm text-primary">₹{customer.total_spent.toFixed(0)}</p>
                    <p className="text-[10px] text-muted-foreground">total spent</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default CRM;
