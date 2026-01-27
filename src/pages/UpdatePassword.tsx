import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';
import { Loader2, Lock, Eye, EyeOff } from 'lucide-react';
import { isStrongPassword } from '@/utils/securityUtils';

const UpdatePassword = () => {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [sessionMessage, setSessionMessage] = useState<string | null>(null);

    useEffect(() => {
        // Verify we have a session (magic link provides this)
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (!session) {
                setSessionMessage('Invalid or expired reset link. Please try "Forgot Password" again.');
            }
        });
    }, []);

    const handleUpdatePassword = async (e: React.FormEvent) => {
        e.preventDefault();

        if (password !== confirmPassword) {
            toast({
                title: "Passwords do not match",
                variant: "destructive",
            });
            return;
        }

        const strength = isStrongPassword(password);
        if (!strength.valid) {
            toast({
                title: "Weak Password",
                description: strength.message,
                variant: "destructive",
            });
            return;
        }

        setLoading(true);

        try {
            const { error } = await supabase.auth.updateUser({
                password: password
            });

            if (error) throw error;

            toast({
                title: "Success",
                description: "Your password has been updated. Please sign in.",
            });

            // Force sign out to ensure clean state and re-login
            await supabase.auth.signOut();
            navigate('/auth');

        } catch (error: any) {
            console.error('Update password error:', error);
            toast({
                title: "Error",
                description: error.message || "Failed to update password.",
                variant: "destructive",
            });
        } finally {
            setLoading(false);
        }
    };

    if (sessionMessage) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
                <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
                    <div className="w-16 h-16 mx-auto mb-4 bg-orange-100 rounded-full flex items-center justify-center text-orange-600">
                        <Lock className="w-8 h-8" />
                    </div>
                    <h2 className="text-xl font-bold text-gray-900 mb-2">Link Expired</h2>
                    <p className="text-gray-600 mb-6">{sessionMessage}</p>
                    <button
                        onClick={() => navigate('/auth')}
                        className="text-pink-600 font-medium hover:underline"
                    >
                        Return to Sign In
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-pink-50 via-white to-pink-50/30 px-4">
            <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl border border-pink-100 overflow-hidden">
                <div className="h-2 bg-gradient-to-r from-pink-500 via-pink-600 to-pink-500"></div>
                <div className="p-8">
                    <div className="flex justify-center mb-6">
                        <div className="w-14 h-14 bg-pink-100 rounded-xl flex items-center justify-center">
                            <Lock className="w-7 h-7 text-pink-600" />
                        </div>
                    </div>

                    <h1 className="text-2xl font-bold text-gray-900 text-center mb-2">
                        Set New Password
                    </h1>
                    <p className="text-gray-500 text-sm text-center mb-8">
                        Please enter a strong new password for your account.
                    </p>

                    <form onSubmit={handleUpdatePassword} className="space-y-5">
                        <div className="space-y-2">
                            <Label htmlFor="password">New Password</Label>
                            <div className="relative">
                                <Input
                                    id="password"
                                    type={showPassword ? "text" : "password"}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    required
                                    minLength={6}
                                    className="pr-10"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                >
                                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="confirmPassword">Confirm Password</Label>
                            <Input
                                id="confirmPassword"
                                type="password"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                required
                                minLength={6}
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full h-11 bg-pink-600 hover:bg-pink-700 text-white font-medium rounded-lg transition-colors flex items-center justify-center disabled:opacity-50"
                        >
                            {loading ? (
                                <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    Updating...
                                </>
                            ) : (
                                'Update Password'
                            )}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
};

export default UpdatePassword;
