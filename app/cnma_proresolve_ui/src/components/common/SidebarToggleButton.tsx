import React from 'react';
import { ChevronLeft } from 'lucide-react'; // assuming lucide-react is installed, as seen in the class "lucide-chevron-left"

interface SidebarToggleButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    isCollapsed?: boolean;
}

export const SidebarToggleButton: React.FC<SidebarToggleButtonProps> = ({ 
    isCollapsed, 
    className = "", 
    ...props 
}) => {
    return (
        <button 
            className={`absolute -right-3 top-20 hidden lg:flex h-6 w-6 items-center justify-center rounded-full border border-sidebar-border bg-sidebar text-sidebar-foreground shadow-sm hover:bg-sidebar-accent ${className}`}
            {...props}
        >
            <ChevronLeft className={`h-[14px] w-[14px] transition-transform duration-200 ${isCollapsed ? 'rotate-180' : ''}`} />
        </button>
    );
};
