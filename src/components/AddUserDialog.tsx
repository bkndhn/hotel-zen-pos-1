import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import { Plus, Eye, EyeOff } from 'lucide-react';
import { isStrongPassword, isValidEmail } from '@/utils/securityUtils';

interface AddUserDialogProps {
  onUserAdded: () => void;
  adminId?: string; // For linking sub-users to their admin
}

export const AddUserDialog: React.FC<AddUserDialogProps> = ({ onUserAdded, adminId }) => {
  const { signUp, profile } = useAuth();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const isSuperAdmin = profile?.role === 'super_admin';

  // Super Admin can only add admin users, regular Admin can only add staff (user)
  const defaultRole = isSuperAdmin ? 'admin' : 'user';

  const [formData, setFormData] = useState({
    email: '',
    password: '',
    name: '',
    role: defaultRole,
    hotelName: ''
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate email format
    if (!isValidEmail(formData.email)) {
      toast({
        title: "Invalid Email",
        description: "Please enter a valid email address.",
        variant: "destructive",
      });
      return;
    }

    // Validate strong password
    const passwordCheck = isStrongPassword(formData.password);
    if (!passwordCheck.valid) {
      toast({
        title: "Weak Password",
        description: passwordCheck.message,
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      if (formData.role === 'admin' && !formData.hotelName.trim()) {
        throw new Error('Hotel name is required for admin accounts');
      }

      const { error } = await signUp(
        formData.email,
        formData.password,
        formData.name,
        formData.role,
        formData.hotelName,
        formData.role === 'user' ? adminId : undefined // Link sub-users to their admin
      );

      if (error) {
        if (error.message?.includes('User already registered')) {
          throw new Error('An account with this email already exists.');
        }
        throw error;
      }

      toast({
        title: "Success!",
        description: isSuperAdmin
          ? "Admin account created successfully. They can now login."
          : "User account created successfully.",
      });

      setFormData({
        email: '',
        password: '',
        name: '',
        role: defaultRole,
        hotelName: ''
      });
      setOpen(false);
      onUserAdded();
    } catch (error: any) {
      console.error('Add user error:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to create user account.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="w-4 h-4 mr-2" />
          {isSuperAdmin ? 'Add Admin' : 'Add User'}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{isSuperAdmin ? 'Add New Admin' : 'Add New User'}</DialogTitle>
          <DialogDescription>
            {isSuperAdmin
              ? 'Create a new hotel admin account. They will manage their own users.'
              : 'Create a new user account for your team member.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Full Name</Label>
            <Input
              id="name"
              type="text"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              required
              placeholder="Enter full name"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
              required
              placeholder="Enter email address"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                value={formData.password}
                onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
                required
                placeholder="Enter password"
                minLength={8}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 p-0"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          {/* Role selection - Only show for Super Admin, and only show Admin option */}
          {isSuperAdmin ? (
            <div className="space-y-2">
              <Label>Role</Label>
              <div className="flex items-center gap-2 p-3 bg-primary/10 rounded-lg border border-primary/20">
                <span className="text-sm font-medium text-primary">Hotel Admin</span>
                <span className="text-xs text-muted-foreground">(will manage their own hotel and users)</span>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <Label>Role</Label>
              <div className="flex items-center gap-2 p-3 bg-secondary/50 rounded-lg border">
                <span className="text-sm font-medium">Staff Member</span>
                <span className="text-xs text-muted-foreground">(limited access based on permissions)</span>
              </div>
            </div>
          )}

          {formData.role === 'admin' && (
            <div className="space-y-2">
              <Label htmlFor="hotelName">Hotel Name</Label>
              <Input
                id="hotelName"
                type="text"
                value={formData.hotelName}
                onChange={(e) => setFormData(prev => ({ ...prev, hotelName: e.target.value }))}
                required
                placeholder="Enter hotel name"
              />
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Creating...' : 'Create User'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
