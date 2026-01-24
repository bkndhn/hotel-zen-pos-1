import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { NavLink, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useUserPermissions } from '@/hooks/useUserPermissions';
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Receipt,
  BarChart3,
  TrendingUp,
  Users,
  Settings,
  ClipboardList,
  ChefHat
} from 'lucide-react';

const allNavItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard', page: 'dashboard' as const },
  { to: '/analytics', icon: TrendingUp, label: 'Analytics', page: 'analytics' as const },
  { to: '/billing', icon: ShoppingCart, label: 'Billing', page: 'billing' as const },
  { to: '/service-area', icon: ClipboardList, label: 'Service Area', page: 'serviceArea' as const },
  { to: '/kitchen', icon: ChefHat, label: 'Kitchen Display', page: 'kitchen' as const },
  { to: '/items', icon: Package, label: 'Items', page: 'items' as const },
  { to: '/expenses', icon: Receipt, label: 'Expenses', page: 'expenses' as const },
  { to: '/reports', icon: BarChart3, label: 'Reports', page: 'reports' as const },
  { to: '/users', icon: Users, label: 'Users', page: 'users' as const },
  { to: '/settings', icon: Settings, label: 'Settings', page: 'settings' as const },
];

export const Sidebar: React.FC = () => {
  const { profile } = useAuth();
  const location = useLocation();
  const { hasAccess, loading } = useUserPermissions();

  if (!profile || loading) return null;

  // Super Admin doesn't need sidebar navigation - they only see Users page
  if (profile.role === 'super_admin') return null;

  // Filter nav items based on permissions
  const navItems = allNavItems.filter(item => hasAccess(item.page));

  return (
    <div className="hidden md:flex flex-col w-64 bg-sidebar border-r border-sidebar-border">
      <div className="p-6">
        <h2 className="text-xl font-bold text-sidebar-foreground">
          {profile.hotel_name || 'Hotel ZEN'}
        </h2>
        <p className="text-sm text-sidebar-accent-foreground">POS Management</p>
      </div>

      <nav className="flex-1 px-4">
        <ul className="space-y-2">
          {navItems.map(({ to, icon: Icon, label }) => {
            const isActive = location.pathname === to ||
              (to === '/billing' && location.pathname === '/');

            return (
              <li key={to}>
                <NavLink
                  to={to}
                  className={cn(
                    "flex items-center px-4 py-3 rounded-lg transition-all duration-200",
                    isActive
                      ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-md"
                      : "text-sidebar-accent-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent"
                  )}
                >
                  <Icon className="w-5 h-5 mr-3" />
                  <span className="font-medium">{label}</span>
                </NavLink>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
};
