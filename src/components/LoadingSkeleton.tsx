import React from 'react';

// Loading skeleton for page transitions
export const PageSkeleton: React.FC = () => (
    <div className="p-4 space-y-4 animate-pulse">
        {/* Header skeleton */}
        <div className="flex items-center justify-between mb-6">
            <div className="h-8 w-48 skeleton rounded-lg"></div>
            <div className="flex gap-2">
                <div className="h-9 w-24 skeleton rounded-lg"></div>
                <div className="h-9 w-24 skeleton rounded-lg"></div>
            </div>
        </div>

        {/* Search bar skeleton */}
        <div className="h-10 w-full skeleton rounded-lg mb-4"></div>

        {/* Category tabs skeleton */}
        <div className="flex gap-2 mb-4 overflow-hidden">
            {[...Array(5)].map((_, i) => (
                <div key={i} className="h-8 w-24 skeleton rounded-full flex-shrink-0"></div>
            ))}
        </div>

        {/* Grid skeleton */}
        <div className="grid grid-cols-3 gap-3">
            {[...Array(9)].map((_, i) => (
                <div key={i} className="aspect-square skeleton rounded-xl"></div>
            ))}
        </div>
    </div>
);

// Card skeleton for individual items
export const CardSkeleton: React.FC = () => (
    <div className="bg-card rounded-xl border p-3 space-y-3 animate-pulse">
        <div className="aspect-square skeleton rounded-lg"></div>
        <div className="h-4 w-3/4 skeleton rounded"></div>
        <div className="h-6 w-1/2 skeleton rounded"></div>
        <div className="h-8 w-full skeleton rounded-lg"></div>
    </div>
);

// Table skeleton for reports
export const TableSkeleton: React.FC<{ rows?: number }> = ({ rows = 5 }) => (
    <div className="space-y-3 animate-pulse">
        {/* Header */}
        <div className="flex gap-4 p-3 bg-muted/50 rounded-lg">
            {[...Array(5)].map((_, i) => (
                <div key={i} className="h-4 flex-1 skeleton rounded"></div>
            ))}
        </div>

        {/* Rows */}
        {[...Array(rows)].map((_, i) => (
            <div key={i} className="flex gap-4 p-3 border-b">
                {[...Array(5)].map((_, j) => (
                    <div key={j} className="h-4 flex-1 skeleton rounded"></div>
                ))}
            </div>
        ))}
    </div>
);

// Spinner for quick loading states
export const Spinner: React.FC<{ size?: 'sm' | 'md' | 'lg' }> = ({ size = 'md' }) => {
    const sizeClasses = {
        sm: 'h-4 w-4 border-2',
        md: 'h-8 w-8 border-2',
        lg: 'h-12 w-12 border-3'
    };

    return (
        <div className="flex items-center justify-center">
            <div
                className={`${sizeClasses[size]} rounded-full border-primary border-t-transparent animate-spin`}
            ></div>
        </div>
    );
};

// Full page loading state
export const FullPageLoader: React.FC = () => (
    <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
            <div className="relative">
                <div className="h-16 w-16 rounded-full border-4 border-primary/30 animate-pulse"></div>
                <div className="absolute inset-0 h-16 w-16 rounded-full border-4 border-primary border-t-transparent animate-spin"></div>
            </div>
            <p className="text-muted-foreground text-sm">Loading...</p>
        </div>
    </div>
);
