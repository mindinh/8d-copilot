namespace cnma.proresolve;

using { cuid, managed } from '@sap/cds/common';

// ── @cnma/cap-identity CDS imports ───────────────────────────────────────────
using { cnma.identity.ShadowUsers }      from '@cnma/cap-identity/db/identity';
using { cnma.identity.ShadowGroups }     from '@cnma/cap-identity/db/identity';
using { cnma.identity.GroupMembers }      from '@cnma/cap-identity/db/identity';
using { cnma.identity.SupportTypes }      from '@cnma/cap-identity/db/identity';
using { cnma.identity.SamlGroupMappings } from '@cnma/cap-identity/db/identity';

// ── @cnma/cap-valuehelp CDS imports ──────────────────────────────────────────
using { cnma.valuehelp.ValueHelpList }   from '@cnma/cap-valuehelp/db/valuehelp';

// ── Cấu hình AI dùng chung ───────────────────────────────────────────────────
using from './ai-settings';

// ── Mô hình báo cáo 8D ───────────────────────────────────────────────────────
using from './eight-d';

// ── Application Entities ──────────────────────────────────────────────────────
entity SampleEntity : cuid, managed {
    name        : String(255);
    description : String(1000);
    status      : String(20) default 'Draft';
}
