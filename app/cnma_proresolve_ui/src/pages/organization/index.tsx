import { OrganizationManager as CapOrganizationManager } from '@cnma/cap-identity/react';
import { identityHttpClient } from '@/services/identity-http-client';
import { toast } from 'sonner';

export interface OrganizationPageProps {
    baseUrl?: string;
    className?: string;
}

/**
 * OrganizationPage — Admin page for Managing Organization, Users, Groups, Support Types & SAML Mappings.
 * Uses the reusable OrganizationManager component from @cnma/cap-identity/react.
 */
export function OrganizationPage({ baseUrl = '/api/cnma/IDENTITY_SRV', className }: OrganizationPageProps = {}) {
    return (
        <div className="organization-page p-6 md:p-8 w-full min-w-0 space-y-6">
            <CapOrganizationManager
                httpClient={identityHttpClient}
                baseUrl={baseUrl}
                onError={(message) => toast.error(message)}
                onSuccess={(message) => toast.success(message)}
                className={className}
            />
        </div>
    );
}

export default OrganizationPage;
