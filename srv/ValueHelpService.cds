using { cnma.valuehelp as valuehelp } from '@cnma/cap-valuehelp/db/valuehelp';

@path: '/api/cnma/VALUEHELP_SRV'
@(requires: 'authenticated-user')
service ValueHelpService {
    entity ValueHelpList as projection on valuehelp.ValueHelpList;
}
