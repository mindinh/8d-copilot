import { useId, useMemo, useRef, useState } from 'react';
import { Input, cn } from '@cnma/react-ui';
import { Check, Info, TriangleAlert } from 'lucide-react';
import { isOutsideCatalogue, type ValueHelpEntry } from '@/services/value-help-service';

/**
 * Ô nhập có trợ giúp giá trị (F4).
 *
 * ── Vì sao phải gợi ý ──
 * Ba mã `workCenterId`, `defectCode`, `materialId` được chấm TRÙNG KHỚP TUYỆT
 * ĐỐI khi tìm tiền lệ: 4 + 4 + 3 trên tổng 16 điểm, ngưỡng 3. Gõ `WC-MILL-7`
 * thay vì `WC-MILL-07` là mất 4 điểm — âm thầm, không lỗi, case chỉ đơn giản
 * quay về "không có tiền lệ".
 *
 * ── `strict`: F4 CỨNG (quyết định Q3) ──
 * Bản đầu chỉ cảnh báo rồi vẫn cho lưu. Lập luận khi đó: khoá cứng sẽ chặn đúng
 * trường hợp đáng quan tâm nhất — lỗi trên một vật tư MỚI, chưa từng có case nào.
 * Lập luận đó có một lỗ: nó giả định đường thoát duy nhất là gõ tay vào form.
 * Không phải — đường thoát là MASTER DATA. Thêm mã ở đó rồi quay lại chọn thì
 * catalogue vẫn đúng, và mọi case sau đó cũng chọn được mã ấy. Gõ tay chỉ giải
 * quyết được cho đúng một case, rồi để lại một mã mồ côi không ai tra được.
 *
 * Nên: `strict` chặn lưu, và cảnh báo GIỮ NGUYÊN nội dung giải thích cái giá phải
 * trả, cộng thêm câu chỉ đường ra. Chặn mà không chỉ đường thì người dùng chỉ còn
 * cách bỏ trống ô — tệ hơn hẳn một giá trị sai.
 *
 * ── Vì sao KHÔNG chặn khi danh mục rỗng ──
 * Xem `isOutsideCatalogue`: backend hỏng không được biến thành "không ai lưu được
 * gì". Điều kiện chặn nằm ở một hàm dùng chung để ô nhập và nút Save không thể
 * nói hai điều khác nhau.
 *
 * `disabled` khi danh sách chưa nạp xong thì KHÔNG dùng: người dùng gõ nhanh hơn
 * mạng, và một ô bị khoá trong hai giây là một ô bị mất chữ.
 */

export interface ValueHelpInputProps {
    value: string;
    onChange: (value: string) => void;
    /** Nhận nguyên dòng để phía gọi tự áp `returnMapping`. */
    onPick?: (entry: ValueHelpEntry) => void;
    entries: ValueHelpEntry[];
    loading?: boolean;
    placeholder?: string;
    id?: string;
    /** Tắt cảnh báo "không có trong danh mục" — cho ô không tham gia chấm điểm. */
    quiet?: boolean;
    /** Điều gì mất đi khi mã không khớp danh mục. Hiện trong cảnh báo. */
    scoringNote?: string;
    /** Tên danh mục, dùng trong dòng gợi ý. */
    catalogLabel?: string;
    /** F4 cứng: giá trị ngoài danh mục hiện thành LỖI. Phía gọi chặn Save. */
    strict?: boolean;
    /** Nơi thêm giá trị mới, hiện trong thông báo lỗi của `strict`. */
    maintenanceHint?: string;
    className?: string;
}

const MAX_SUGGESTIONS = 8;

export function ValueHelpInput({
    value,
    onChange,
    onPick,
    entries,
    loading = false,
    placeholder,
    id,
    quiet = false,
    scoringNote,
    catalogLabel = 'the value help',
    strict = false,
    maintenanceHint = 'Add it in Master Data first.',
    className,
}: ValueHelpInputProps) {
    const generatedId = useId();
    const inputId = id ?? generatedId;
    const [open, setOpen] = useState(false);
    const [highlight, setHighlight] = useState(0);
    const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const query = value.trim().toLowerCase();

    const matches = useMemo(() => {
        if (!entries.length) return [];
        return entries
            .filter((entry) =>
                !query
                || String(entry.key ?? '').toLowerCase().includes(query)
                || String(entry.text ?? '').toLowerCase().includes(query))
            .slice(0, MAX_SUGGESTIONS);
    }, [entries, query]);

    // Chỉ báo khi người dùng ĐÃ gõ và danh mục ĐÃ nạp xong. Trong lúc chờ mạng thì
    // mọi mã đều "không khớp", và doạ nhầm là cách nhanh nhất để người dùng học
    // cách bỏ qua cảnh báo. Điều kiện nằm trong `isOutsideCatalogue` — CÙNG hàm mà
    // nút Save dùng để chặn, nên hai chỗ không thể nói khác nhau.
    const outside = useMemo(
        () => isOutsideCatalogue(entries, value, loading),
        [entries, value, loading],
    );
    const showUnknown = !quiet && outside;

    const commit = (entry: ValueHelpEntry) => {
        onChange(String(entry.key ?? ''));
        onPick?.(entry);
        setOpen(false);
    };

    return (
        <div className={cn('relative', className)}>
            <Input
                id={inputId}
                value={value}
                autoComplete="off"
                placeholder={placeholder}
                aria-invalid={strict && outside}
                className={cn(
                    'font-mono text-xs',
                    showUnknown && (strict ? 'border-destructive' : 'border-warning/60'),
                )}
                onChange={(e) => {
                    onChange(e.target.value);
                    setOpen(true);
                    setHighlight(0);
                }}
                onFocus={() => setOpen(true)}
                onBlur={() => {
                    // Nhấp vào một gợi ý cũng gây blur trước khi click chạy.
                    // Hoãn một nhịp để cú chọn kịp về.
                    blurTimer.current = setTimeout(() => setOpen(false), 120);
                }}
                onKeyDown={(e) => {
                    if (!open || !matches.length) return;
                    if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        setHighlight((h) => (h + 1) % matches.length);
                    } else if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        setHighlight((h) => (h - 1 + matches.length) % matches.length);
                    } else if (e.key === 'Enter') {
                        // Chỉ nuốt Enter khi đang thực sự chọn trong danh sách —
                        // nếu không thì không submit được form bằng bàn phím.
                        e.preventDefault();
                        commit(matches[highlight]);
                    } else if (e.key === 'Escape') {
                        setOpen(false);
                    }
                }}
            />

            {open && matches.length > 0 && (
                <ul
                    className="absolute z-50 mt-1 max-h-64 w-full overflow-auto rounded-md border bg-popover p-1 shadow-md"
                    onMouseDown={() => { if (blurTimer.current) clearTimeout(blurTimer.current); }}
                >
                    {matches.map((entry, index) => (
                        <li key={String(entry.key)}>
                            <button
                                type="button"
                                onClick={() => commit(entry)}
                                onMouseEnter={() => setHighlight(index)}
                                className={cn(
                                    'flex w-full items-start gap-2 rounded px-2 py-1.5 text-left',
                                    index === highlight ? 'bg-accent text-accent-foreground' : 'hover:bg-muted',
                                )}
                            >
                                <span className="min-w-0 flex-1">
                                    <span className="block font-mono text-xs font-medium">{String(entry.key)}</span>
                                    {entry.text && (
                                        <span className="block truncate text-[11px] text-muted-foreground">
                                            {String(entry.text)}
                                        </span>
                                    )}
                                </span>
                                {String(entry.key ?? '').toLowerCase() === query && (
                                    <Check className="h-3.5 w-3.5 shrink-0 text-success" />
                                )}
                            </button>
                        </li>
                    ))}
                </ul>
            )}

            {showUnknown && (
                <p
                    className={cn(
                        'mt-1 flex items-start gap-1 text-[10.5px] leading-snug',
                        strict ? 'text-destructive' : 'text-warning',
                    )}
                >
                    <TriangleAlert className="mt-px h-3 w-3 shrink-0" />
                    <span>
                        Not in {catalogLabel}.{scoringNote ? ` ${scoringNote}` : ''}
                        {strict ? ` ${maintenanceHint}` : ''}
                    </span>
                </p>
            )}

            {!quiet && !query && !loading && entries.length > 0 && (
                <p className="mt-1 flex items-start gap-1 text-[10.5px] leading-snug text-muted-foreground">
                    <Info className="mt-px h-3 w-3 shrink-0" />
                    <span>{entries.length} in {catalogLabel} — start typing to pick one.</span>
                </p>
            )}
        </div>
    );
}

export default ValueHelpInput;
