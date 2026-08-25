import { Link } from 'react-router-dom';
import {
    LayoutDashboard,
    Building2,
    CheckCircle2,
    ArrowRight,
} from 'lucide-react';

export function HomePage() {
    return (
        <div className="p-6 md:p-8 w-full min-w-0 space-y-6">
            {/* Header Banner */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-card border border-border rounded-xl p-6 shadow-xs">
                <div>
                    <div className="flex items-center gap-3 mb-1.5">
                        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                            <LayoutDashboard className="w-5 h-5 text-primary" />
                        </div>
                        <h1 className="text-xl font-bold text-foreground">CNMA Proresolve Dashboard</h1>
                    </div>
                    <p className="text-xs text-muted-foreground">
                        Full-stack SAP CAP application integrated with @cnma/cap-identity.
                    </p>
                </div>

                <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-success/10 text-success border border-success/20">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        CAP Backend Connected
                    </span>
                </div>
            </div>

            {/* Quick Action Navigation Card */}
            <div className="grid grid-cols-1 gap-6">
                <Link
                    to="/organization"
                    className="group bg-card border border-border hover:border-primary/50 rounded-xl p-6 shadow-xs hover:shadow-md transition-all duration-200 flex flex-col md:flex-row md:items-center justify-between gap-4"
                >
                    <div className="flex items-start gap-4">
                        <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                            <Building2 className="w-6 h-6" />
                        </div>
                        <div>
                            <h2 className="text-base font-bold text-foreground mb-1 flex items-center gap-2">
                                Organization Management
                            </h2>
                            <p className="text-xs text-muted-foreground">
                                Manage shadow users, group memberships, principal support types, and SAML mappings.
                            </p>
                        </div>
                    </div>
                    <div className="text-xs font-semibold text-primary flex items-center gap-1.5 shrink-0">
                        <span>Open Organization</span>
                        <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                    </div>
                </Link>
            </div>
        </div>
    );
}

export default HomePage;
