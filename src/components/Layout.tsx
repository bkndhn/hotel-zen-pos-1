
import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Navigate, useLocation } from 'react-router-dom';
import { BottomNavigation } from './BottomNavigation';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { OfflineIndicator } from './OfflineIndicator';

interface LayoutProps {
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  const { user, profile, loading } = useAuth();
  const location = useLocation();

  console.log('Layout - loading:', loading, 'user:', !!user, 'profile:', !!profile, 'status:', profile?.status);

  // Restore User Theme on Layout Mount (entering app)
  React.useEffect(() => {
    const restoreTheme = () => {
      const savedTheme = localStorage.getItem('hotel_pos_theme') || 'blue';
      // Default colors matching App.tsx
      const themeColors: Record<string, string> = {
        'blue': '#3b82f6',
        'blue-bright': '#0324fc',
        'purple': '#9333ea',
        'green': '#10b981',
        'rose': '#e11d48',
        'sunset': '#f97316',
        'navy': '#1e3a8a',
        'hotpink': '#c11c84'
      };

      let colorToSet = themeColors['blue']; // Default

      if (savedTheme === 'custom') {
        colorToSet = localStorage.getItem('hotel_pos_custom_color') || '#0324fc';
      } else if (themeColors[savedTheme]) {
        colorToSet = themeColors[savedTheme];
      }

      const metaThemeColor = document.querySelector('meta[name="theme-color"]');
      if (metaThemeColor) {
        metaThemeColor.setAttribute('content', colorToSet);
      }
    };

    if (user && profile) {
      restoreTheme();
    }
  }, [user, profile]);

  // Don't show navigation on auth page
  if (location.pathname === '/auth') {
    return <>{children}</>;
  }

  // Show loading only while auth is being initialized
  if (loading) {
    console.log('Layout showing loading state');
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  // After loading is complete, check authentication
  if (!user) {
    console.log('No user - redirecting to auth');
    return <Navigate to="/auth" replace />;
  }

  if (!profile) {
    console.log('No profile - redirecting to auth');
    return <Navigate to="/auth" replace />;
  }

  if (profile.status !== 'active') {
    console.log('Profile not active:', profile.status, '- redirecting to auth');
    return <Navigate to="/auth" replace />;
  }

  // User is properly authenticated with active profile
  console.log('User authenticated - showing app');
  return (
    <div className="min-h-screen min-h-[100dvh] bg-background flex w-full max-w-[100vw] overflow-x-hidden">
      <Sidebar />

      <div className="flex flex-col flex-1 w-full min-w-0 overflow-x-hidden">
        <Header />

        {/* Offline Status Indicator */}
        <div className="px-2 sm:px-4 py-1">
          <OfflineIndicator />
        </div>

        <main
          className="flex-1 overflow-x-hidden overflow-y-auto"
          style={{ paddingBottom: 'max(80px, calc(70px + env(safe-area-inset-bottom, 0px)))' }}
        >
          {children}
        </main>

        <BottomNavigation />
      </div>
    </div>
  );
};
