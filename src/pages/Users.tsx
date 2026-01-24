import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/hooks/use-toast';
import { Users as UsersIcon, Search, User, Shield, ChevronDown, ChevronRight, Crown } from 'lucide-react';
import { AddUserDialog } from '@/components/AddUserDialog';

import { UserPermissions } from '@/components/UserPermissions';
import type { UserProfile, UserStatus, UserRole } from '@/types/user';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

interface ExtendedUserProfile extends UserProfile {
  admin_id?: string;
  subUsers?: ExtendedUserProfile[];
}

const Users: React.FC = () => {
  const { profile } = useAuth();
  const [users, setUsers] = useState<ExtendedUserProfile[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<ExtendedUserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedAdmins, setExpandedAdmins] = useState<Set<string>>(new Set());

  const isSuperAdmin = profile?.role === 'super_admin';
  const isAdmin = profile?.role === 'admin';

  useEffect(() => {
    fetchUsers();
  }, [profile]);

  useEffect(() => {
    if (!searchTerm.trim()) {
      setFilteredUsers(users);
    } else {
      const searchLower = searchTerm.toLowerCase();

      const filtered = users.map(user => {
        // Check if Admin matches
        const adminMatches = (
          user.name.toLowerCase().includes(searchLower) ||
          user.role.toLowerCase().includes(searchLower) ||
          user.hotel_name?.toLowerCase().includes(searchLower) ||
          user.status.toLowerCase().includes(searchLower)
        );

        // Check sub-users matches
        const matchingSubUsers = (user.subUsers || []).filter(sub =>
          sub.name.toLowerCase().includes(searchLower) ||
          sub.role.toLowerCase().includes(searchLower)
        );
        const hasMatchingSubUsers = matchingSubUsers.length > 0;

        if (adminMatches || hasMatchingSubUsers) {
          // If Admin matches, show Admin and ALL sub-users (context is important)
          // If Admin doesn't match but has matching sub-users, show Admin and ONLY matching sub-users
          if (adminMatches) {
            return user;
          }
          return { ...user, subUsers: matchingSubUsers };
        }
        return null;
      }).filter((u): u is ExtendedUserProfile => u !== null);

      setFilteredUsers(filtered);
    }
  }, [searchTerm, users]);

  const fetchUsers = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const allUsers = (data || []).map(user => ({
        id: user.id,
        user_id: user.user_id,
        name: user.name,
        role: user.role as UserRole,
        hotel_name: user.hotel_name,
        status: user.status as UserStatus,
        created_at: user.created_at,
        updated_at: user.updated_at,
        admin_id: user.admin_id
      })) as ExtendedUserProfile[];

      if (isSuperAdmin) {
        // Super Admin: Show only admins with their sub-users nested
        const admins = allUsers.filter(u => u.role === 'admin');
        const subUsers = allUsers.filter(u => u.role === 'user' && u.admin_id);

        // Attach sub-users to their admins
        admins.forEach(admin => {
          admin.subUsers = subUsers.filter(sub => sub.admin_id === admin.id);
        });

        setUsers(admins);
        setFilteredUsers(admins);
      } else if (isAdmin) {
        // Admin: Show only their sub-users (and themselves)
        const relevantUsers = allUsers.filter(u =>
          u.role !== 'super_admin' &&
          (u.user_id === profile?.user_id || u.admin_id === profile?.id)
        );
        setUsers(relevantUsers);
        setFilteredUsers(relevantUsers);
      } else {
        // Regular users see nothing
        setUsers([]);
        setFilteredUsers([]);
      }
    } catch (error) {
      console.error('Error fetching users:', error);
      toast({
        title: "Error",
        description: "Failed to fetch users",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const updateUserStatus = async (userId: string, newStatus: UserStatus, isAdminPause = false) => {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ status: newStatus })
        .eq('id', userId);

      if (error) throw error;

      toast({
        title: "Success",
        description: isAdminPause && newStatus === 'paused'
          ? "Admin and all sub-users have been paused"
          : "User status updated successfully",
      });

      fetchUsers();
    } catch (error) {
      console.error('Error updating user status:', error);
      toast({
        title: "Error",
        description: "Failed to update user status",
        variant: "destructive",
      });
    }
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'super_admin':
        return <Crown className="w-4 h-4 text-yellow-500" />;
      case 'admin':
        return <Shield className="w-4 h-4" />;
      default:
        return <User className="w-4 h-4" />;
    }
  };

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case 'super_admin':
        return 'default';
      case 'admin':
        return 'default';
      default:
        return 'secondary';
    }
  };

  const toggleAdminExpand = (adminId: string) => {
    setExpandedAdmins(prev => {
      const newSet = new Set(prev);
      if (newSet.has(adminId)) {
        newSet.delete(adminId);
      } else {
        newSet.add(adminId);
      }
      return newSet;
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading users...</p>
        </div>
      </div>
    );
  }

  // Get filtered users for permissions view to sync with search
  const usersForPermissions = isSuperAdmin
    ? filteredUsers.flatMap(admin => [admin, ...(admin.subUsers || [])])
    : filteredUsers.filter(u => u.user_id !== profile?.user_id);

  return (
    <div className="container mx-auto py-4 px-4 max-w-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center">
          <UsersIcon className="w-8 h-8 mr-3 text-primary" />
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold">Users Management</h1>
            <p className="text-muted-foreground text-sm">
              {isSuperAdmin ? 'Super Admin: Manage all admins and their users' : 'Manage system users and settings'}
            </p>
          </div>
        </div>
        {(isAdmin || isSuperAdmin) && (
          <AddUserDialog onUserAdded={fetchUsers} adminId={profile?.id} />
        )}
      </div>

      {/* Search Bar - Moved to Top */}
      <Card className="mb-6">
        <CardHeader className="py-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Search className="w-5 h-5" />
            Search Users
          </CardTitle>
        </CardHeader>
        <CardContent className="py-3">
          <Input
            placeholder="Search by name, role, hotel, or status..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full"
          />
        </CardContent>
      </Card>



      {/* User Permissions - For both Super Admin and Admin */}
      {(isAdmin || isSuperAdmin) && usersForPermissions.length > 0 && (
        <div className="mb-6">
          <UserPermissions users={usersForPermissions} />
        </div>
      )}

      {/* Users List */}
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-lg">
            {isSuperAdmin ? `Admins (${filteredUsers.length})` : `All Users (${filteredUsers.length})`}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {filteredUsers.length === 0 ? (
            <div className="text-center py-16">
              <UsersIcon className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-xl font-semibold mb-2">No Users Found</h3>
              <p className="text-muted-foreground">
                {searchTerm ? 'No users match your search criteria.' : 'No users available.'}
              </p>
            </div>
          ) : isSuperAdmin ? (
            // Super Admin View - Hierarchical with collapsible admin sections
            <div className="space-y-4">
              {filteredUsers.map((admin) => (
                <Collapsible
                  key={admin.id}
                  open={expandedAdmins.has(admin.id)}
                  onOpenChange={() => toggleAdminExpand(admin.id)}
                >
                  <Card className="border-2">
                    {/* Admin Header */}
                    <CollapsibleTrigger asChild>
                      <div className="p-4 cursor-pointer hover:bg-muted/50 transition-colors">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            {admin.subUsers && admin.subUsers.length > 0 ? (
                              expandedAdmins.has(admin.id) ? (
                                <ChevronDown className="w-5 h-5 text-muted-foreground" />
                              ) : (
                                <ChevronRight className="w-5 h-5 text-muted-foreground" />
                              )
                            ) : (
                              <div className="w-5" />
                            )}
                            <div>
                              <h4 className="font-semibold text-lg">{admin.name}</h4>
                              {admin.hotel_name && (
                                <p className="text-sm text-muted-foreground">{admin.hotel_name}</p>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {admin.subUsers && admin.subUsers.length > 0 && (
                              <Badge variant="outline" className="text-xs">
                                {admin.subUsers.length} sub-user{admin.subUsers.length !== 1 ? 's' : ''}
                              </Badge>
                            )}
                            <Badge
                              variant={admin.status === 'active' ? 'default' : admin.status === 'paused' ? 'secondary' : 'destructive'}
                              className="text-xs"
                            >
                              {admin.status}
                            </Badge>
                            <Badge variant={getRoleBadgeVariant(admin.role)} className="capitalize flex items-center gap-1">
                              {getRoleIcon(admin.role)}
                              {admin.role}
                            </Badge>
                          </div>
                        </div>

                        {/* Admin Actions */}
                        <div className="flex flex-wrap gap-2 mt-3 ml-8">
                          <Button
                            size="sm"
                            variant={admin.status === 'active' ? 'outline' : 'default'}
                            onClick={(e) => {
                              e.stopPropagation();
                              updateUserStatus(admin.id, admin.status === 'active' ? 'paused' : 'active', true);
                            }}
                            className="text-xs"
                          >
                            {admin.status === 'active' ? 'Pause Admin & All Users' : 'Activate'}
                          </Button>
                          {admin.status !== 'deleted' && (
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={(e) => {
                                e.stopPropagation();
                                updateUserStatus(admin.id, 'deleted', true);
                              }}
                              className="text-xs"
                            >
                              Delete
                            </Button>
                          )}
                        </div>
                      </div>
                    </CollapsibleTrigger>

                    {/* Sub-users */}
                    <CollapsibleContent>
                      {admin.subUsers && admin.subUsers.length > 0 && (
                        <div className="border-t bg-muted/30 p-4">
                          <h5 className="text-sm font-medium mb-3 text-muted-foreground">Sub-users under {admin.name}</h5>
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                            {admin.subUsers.map(subUser => (
                              <Card key={subUser.id} className="p-3 bg-background">
                                <div className="flex items-start justify-between">
                                  <div>
                                    <h6 className="font-medium">{subUser.name}</h6>
                                    <Badge
                                      variant={subUser.status === 'active' ? 'outline' : subUser.status === 'paused' ? 'secondary' : 'destructive'}
                                      className="text-xs mt-1"
                                    >
                                      {admin.status === 'paused' ? 'paused (by admin)' : subUser.status}
                                    </Badge>
                                  </div>
                                  <Badge variant="secondary" className="text-xs capitalize flex items-center gap-1">
                                    {getRoleIcon(subUser.role)}
                                    {subUser.role}
                                  </Badge>
                                </div>
                              </Card>
                            ))}
                          </div>
                        </div>
                      )}
                    </CollapsibleContent>
                  </Card>
                </Collapsible>
              ))}
            </div>
          ) : (
            // Regular Admin View - Grid of users
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredUsers.map((user) => (
                <Card key={user.id} className="p-3">
                  <div className="space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="font-medium text-base">{user.name}</h4>
                        {user.hotel_name && (
                          <p className="text-sm text-muted-foreground">{user.hotel_name}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        {getRoleIcon(user.role)}
                        <Badge
                          variant={getRoleBadgeVariant(user.role)}
                          className="text-xs"
                        >
                          {user.role}
                        </Badge>
                      </div>
                    </div>

                    <Badge
                      variant={user.status === 'active' ? 'default' : user.status === 'paused' ? 'secondary' : 'destructive'}
                      className="text-xs"
                    >
                      {user.status}
                    </Badge>

                    <div className="text-xs text-muted-foreground">
                      <div>Created: {new Date(user.created_at).toLocaleDateString()}</div>
                      <div>Updated: {new Date(user.updated_at).toLocaleDateString()}</div>
                    </div>

                    {isAdmin && user.user_id !== profile?.user_id && (
                      <div className="flex flex-wrap gap-1 pt-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => updateUserStatus(user.id, user.status === 'active' ? 'paused' : 'active')}
                          className="text-xs flex-1 sm:flex-none"
                        >
                          {user.status === 'active' ? 'Pause' : 'Activate'}
                        </Button>
                        {user.status !== 'deleted' && (
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => updateUserStatus(user.id, 'deleted')}
                            className="text-xs flex-1 sm:flex-none"
                          >
                            Delete
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Users;