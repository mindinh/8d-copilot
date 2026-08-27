/**
 * Is / Is-Not của D2 — TÍNH THUẦN từ dân số lô kiểm (GD 17).
 *
 * ── Kỹ thuật này là gì ──
 * Viết hai danh sách cạnh nhau: nơi vấn đề CÓ xảy ra, và một tình huống so sánh
 * được nơi nó KHÔNG xảy ra. Rồi chỉ nhìn phần KHÁC nhau giữa hai bên. Phần đó là
 * manh mối mạnh nhất về nguyên nhân, vì nó loại trừ mọi thứ hai bên cùng có
 * (cùng vật liệu, cùng quy trình) và chỉ chừa lại thứ riêng của bên đang hỏng.
 *
 * ── Vì sao model KHÔNG được chọn ──
 * Việc ở đây là: nhóm theo thiết bị, tính tỉ lệ không đạt, lấy nhóm cao nhất và
 * nhóm thấp nhất. Đó là số học, và số học thì không cần suy đoán. Để model chọn
 * sẽ đánh đổi tính tái lập lấy văn phong — mà tính tái lập chính là toàn bộ giá
 * trị của bằng chứng này: người đọc phải kiểm lại được bằng cách đếm tay các mã
 * lô được trích.
 *
 * Model chỉ được diễn đạt câu chữ QUANH những con số nó không chọn.
 *
 * ── Thà nói "không so được" còn hơn so bừa ──
 * Lỗi ngoại quan không có đặc tính đo được; case chỉ chạy trên một đồ gá thì
 * không có gì để so. Trong những ca đó, một cặp Is/Is-Not nghe hợp lý là tệ hơn
 * không có gì: nó chỉ về một hướng mà dữ liệu không hề chống lưng.
 */

import type { CaseContext, InspectionLotRow } from './types';

/**
 * Chênh lệch tỉ lệ không đạt tối thiểu giữa nhóm xấu nhất và nhóm sạch nhất.
 *
 * 0.25 nghĩa là nhóm IS phải hỏng nhiều hơn nhóm IS NOT ít nhất 25 điểm phần
 * trăm. Dưới ngưỡng đó thì hai nhóm chỉ đang nhiễu quanh cùng một mức, và gọi
 * một bên là "nơi vấn đề xảy ra" là đọc ra tín hiệu từ tiếng ồn.
 */
export const DEFAULT_MIN_CONTRAST = 0.25;

/** Số lô tối thiểu để một nhóm được coi là so sánh được. */
export const DEFAULT_MIN_GROUP_SIZE = 2;

export interface EquipmentGroup {
    equipment: string;
    total: number;
    nonconforming: number;
    /** 0..1 */
    rate: number;
    lotIds: string[];
}

export interface IsIsNotResult {
    /** `null` khi không so được — KHÔNG dùng chuỗi rỗng: một ô trống sẽ được
     *  renderer in ra như một vế Is thật sự nhưng vô nghĩa. */
    is: string | null;
    isNot: string | null;
    notes: string | null;
    applicable: boolean;
    citedLotIds: string[];
    reason: string | null;
    /** Số liệu thô, để UI hiện bảng và để test đếm lại. */
    groups: EquipmentGroup[];
}

export interface IsIsNotOptions {
    minContrast?: number;
    minGroupSize?: number;
}

function notApplicable(reason: string, groups: EquipmentGroup[] = []): IsIsNotResult {
    return { is: null, isNot: null, notes: null, applicable: false, citedLotIds: [], reason, groups };
}

function percent(rate: number): string {
    return `${Math.round(rate * 100)}%`;
}

/** Nhóm lô theo thiết bị. Lô không kết luận được (`conforming = null`) bị loại. */
export function groupByEquipment(lots: InspectionLotRow[]): EquipmentGroup[] {
    const buckets = new Map<string, EquipmentGroup>();
    for (const lot of lots) {
        // Bỏ lô chưa có kết luận đạt/không đạt: đưa vào mẫu số sẽ làm loãng tỉ
        // lệ của cả nhóm bằng một thứ ta không biết.
        if (lot.conforming === null) continue;
        const key = lot.equipment || 'Unspecified equipment';
        const group = buckets.get(key)
            ?? { equipment: key, total: 0, nonconforming: 0, rate: 0, lotIds: [] };
        group.total += 1;
        if (!lot.conforming) group.nonconforming += 1;
        group.lotIds.push(lot.lotId);
        buckets.set(key, group);
    }
    return [...buckets.values()]
        .map((group) => ({ ...group, rate: group.total ? group.nonconforming / group.total : 0 }))
        // Sắp theo tỉ lệ giảm dần, rồi theo tên để kết quả tái lập được khi hoà.
        .sort((a, b) => b.rate - a.rate || a.equipment.localeCompare(b.equipment));
}

/**
 * Tính cặp Is / Is-Not cho một Material + Characteristic.
 *
 * @param lots  Toàn bộ dân số lô của case; hàm tự lọc theo material và đặc tính.
 */
export function computeIsIsNot(
    lots: InspectionLotRow[],
    materialId: string,
    characteristic: string,
    options: IsIsNotOptions = {},
): IsIsNotResult {
    const minContrast = options.minContrast ?? DEFAULT_MIN_CONTRAST;
    const minGroupSize = options.minGroupSize ?? DEFAULT_MIN_GROUP_SIZE;

    if (!characteristic) {
        // Lỗi ngoại quan: không có gì để đo, nên không có gì để so.
        return notApplicable('Not applicable — this defect has no measurable characteristic.');
    }

    const relevant = (lots ?? []).filter((lot) =>
        lot.materialId === materialId && lot.characteristic === characteristic);
    if (!relevant.length) {
        return notApplicable(`Not applicable — no historical inspection lots recorded for ${characteristic}.`);
    }

    const groups = groupByEquipment(relevant);
    const comparable = groups.filter((group) => group.total >= minGroupSize);
    if (comparable.length < 2) {
        return notApplicable(
            `Not applicable — ${characteristic} was only measured on ${comparable.length || groups.length} equipment group(s); there is nothing to compare against.`,
            groups,
        );
    }

    const worst = comparable[0];
    const cleanest = comparable[comparable.length - 1];
    const contrast = worst.rate - cleanest.rate;
    if (contrast < minContrast) {
        return notApplicable(
            `No clear contrast — every comparable equipment group runs between ${percent(cleanest.rate)} and ${percent(worst.rate)} nonconforming for ${characteristic}.`,
            groups,
        );
    }

    return {
        is: `${worst.equipment} — ${worst.nonconforming}/${worst.total} lots nonconforming (${percent(worst.rate)}) for ${characteristic}`,
        isNot: `${cleanest.equipment} — ${cleanest.nonconforming}/${cleanest.total} lots nonconforming (${percent(cleanest.rate)}) for ${characteristic}`,
        notes: `Computed from ${worst.total + cleanest.total} inspection lots. The two groups share material ${materialId} and characteristic ${characteristic}; equipment is the difference between them.`,
        applicable: true,
        citedLotIds: [...worst.lotIds, ...cleanest.lotIds],
        reason: null,
        groups,
    };
}

/**
 * Chọn đặc tính để so: ưu tiên đặc tính đang vượt spec của chính case này.
 *
 * Case có thể đo nhiều đặc tính; so trên đặc tính vẫn đạt thì đúng về số học mà
 * vô nghĩa về nghiệp vụ — ta đang đi tìm nguồn của LỖI NÀY.
 */
export function characteristicUnderInvestigation(context: CaseContext): string {
    const inspections = context.inspections ?? [];
    return (inspections.find((row) => row.outOfSpec === true) ?? inspections[0])?.characteristic ?? '';
}

/** Tính Is/Is-Not cho một case từ chính CaseContext của nó. */
export function computeIsIsNotForCase(
    context: CaseContext,
    options: IsIsNotOptions = {},
): IsIsNotResult {
    return computeIsIsNot(
        context.historicalInspectionLots ?? [],
        context.product?.materialId ?? '',
        characteristicUnderInvestigation(context),
        options,
    );
}
