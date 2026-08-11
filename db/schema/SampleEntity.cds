namespace cnma.proresolve;

using { cuid, managed } from '@sap/cds/common';

entity SampleEntity : cuid, managed {
    name        : String(255);
    description : String(1000);
    status      : String(20) default 'Draft';
}
