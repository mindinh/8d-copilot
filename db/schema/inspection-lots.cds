namespace cnma.proresolve;

using { cuid, managed } from '@sap/cds/common';

/**
 * Lịch sử kiểm tra theo lô (SAP QM QALS / QAMR) — nguồn dân số để phân tích Is / Is-Not.
 */
entity InspectionLots : cuid, managed {
    lotId          : String(30)  @mandatory;
    materialId     : String(30)  @mandatory;
    characteristic : String(120) @mandatory;
    equipment      : String(50);
    measuredValue  : String(60);
    unit           : String(20);
    conforming     : Boolean default true;
    lotDate        : Date;
    plant          : String(30);
}

/**
 * Sổ đăng ký FMEA theo quy trình / thiết bị — nguồn tham chiếu cho D7 khi case chưa liên kết FMEA.
 */
entity FmeaRegister : cuid, managed {
    fmeaId         : String(30)  @mandatory;
    workCenterId   : String(30);
    materialId     : String(30);
    description    : String(255);
}
