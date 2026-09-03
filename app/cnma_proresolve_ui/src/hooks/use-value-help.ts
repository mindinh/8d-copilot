import { useQuery } from '@tanstack/react-query';
import {
    getValueHelp,
    type ReturnMappingRule,
    type ValueHelpEntry,
    type ValueHelpId,
} from '@/services/value-help-service';

/**
 * Nạp một danh sách F4.
 *
 * ── Vì sao là hook chứ không gọi thẳng trong component ──
 * Bảy ô F4 trên form ghi nhận lỗi cùng cần một thứ: nạp một lần, chia sẻ giữa các
 * lần render, và nạp LẠI khi giá trị cha đổi. Viết tay từng chỗ thì bảy chỗ đó
 * sớm muộn khác nhau ở đúng cái phần dễ sai — cache key.
 *
 * ── Vì sao `dependsOnValue` nằm trong queryKey ──
 * `DEFECT_CODE` lọc theo nhóm mã. Bỏ nó ra khỏi key thì đổi nhóm sẽ trả về danh
 * sách của nhóm CŨ từ cache, và ô chọn hiện những mã không thuộc nhóm đang chọn —
 * sai một cách rất khó nhìn ra, vì danh sách trông vẫn hợp lý.
 */

export interface ValueHelpState {
    entries: ValueHelpEntry[];
    returnMapping: ReturnMappingRule[];
    loading: boolean;
}

/** Danh mục sống lâu hơn một phiên nhập liệu — không cần nạp lại mỗi lần mở form. */
const STALE_TIME = 5 * 60 * 1000;

export function useValueHelp(
    valueHelpID: ValueHelpId,
    options: { dependsOnValue?: string; enabled?: boolean } = {},
): ValueHelpState {
    const dependsOnValue = options.dependsOnValue?.trim() ?? '';

    const { data, isFetching } = useQuery({
        queryKey: ['valueHelp', valueHelpID, dependsOnValue],
        queryFn: () => getValueHelp(valueHelpID, { dependsOnValue }),
        staleTime: STALE_TIME,
        enabled: options.enabled ?? true,
    });

    return {
        entries: data?.entries ?? [],
        returnMapping: data?.returnMapping ?? [],
        // `isFetching` chứ không `isLoading`: lúc đổi nhóm mã, dữ liệu cũ vẫn còn
        // nên `isLoading` là false, nhưng danh sách đang hiện KHÔNG phải danh sách
        // của nhóm mới. Cảnh báo "không có trong danh mục" dựa trên nó sẽ doạ nhầm.
        loading: isFetching,
    };
}

export default useValueHelp;
