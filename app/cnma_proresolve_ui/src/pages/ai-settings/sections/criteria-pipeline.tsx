import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@cnma/react-ui';
import { GitBranch, Plus } from 'lucide-react';
import {
    createProfileCriterion, deleteProfileCriterion, swapProfileCriterionOrder,
    updateProfileCriterion, type ProfileCriterion,
} from '@/services/retrieval-service';
import type { RetrievalConfigState } from '@/hooks/use-retrieval-config';
import { CriterionStepCard } from '../criterion-step-card';

/** Biến nhãn thành khoá kỹ thuật ổn định cho bước mới. */
function slugify(label: string, taken: Set<string>): string {
    const base = label
        .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
        .split(' ').filter(Boolean)
        .map((w, i) => (i === 0 ? w : w[0].toUpperCase() + w.slice(1)))
        .join('') || 'criterion';
    if (!taken.has(base)) return base;
    let n = 2;
    while (taken.has(`${base}${n}`)) n++;
    return `${base}${n}`;
}

/**
 * Pipeline các bước chấm điểm tương đồng.
 *
 * Dùng ở hai nơi: tab Similarity trong AI Settings, và bước "Find comparable
 * cases" của trang Workflow. Cùng một component nên hai chỗ không thể lệch nhau.
 */
export function CriteriaPipelineSection({ cfg, allowAdd = true }: {
    cfg: RetrievalConfigState;
    /**
     * Cho phép thêm tiêu chí ngay tại đây.
     *
     * Tắt ở tab similarity của từng bước D: bộ field của một profile được dựng ở
     * trang Object Schema, nơi có cả danh mục field SAP để chọn. Thêm ở đây thì
     * chỉ chọn được từ một danh sách cột viết cứng — hai đường tạo tiêu chí với
     * hai bộ field khác nhau.
     */
    allowAdd?: boolean;
}) {
    const { criteria, busy, run, maxScore, profileKey } = cfg;

    return (
        <Card>
            <CardHeader>
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <CardTitle className="flex items-center gap-1.5">
                            <GitBranch size={16} className="text-primary" />
                            Matching pipeline
                        </CardTitle>
                        <CardDescription className="mt-1">
                            All enabled steps are scored and their points add up. Maximum reachable score is{' '}
                            <span className="font-mono font-medium">{maxScore}</span>.
                        </CardDescription>
                    </div>
                    {allowAdd && <Button
                        size="sm" className="h-8 shrink-0 gap-1"
                        disabled={busy !== null}
                        onClick={() => {
                            const taken = new Set(criteria.map((c) => c.criterionKey));
                            const label = 'New criterion';
                            void run('new', () => createProfileCriterion({
                                profile_profileKey: profileKey,
                                criterionKey: slugify(label, taken),
                                label,
                                description: '',
                                sourceTable: 'HistoricalCases',
                                sourceField: 'workCenterId',
                                matchType: 'exact',
                                weight: 1,
                                // Bước mới tắt sẵn: bật ngay nghĩa là đổi điểm của
                                // mọi hồ sơ trước khi người dùng kịp cấu hình nó.
                                enabled: false,
                                sortOrder: (criteria.at(-1)?.sortOrder ?? 0) + 10,
                            }));
                        }}
                    >
                        <Plus size={12} /> Add step
                    </Button>}
                </div>
            </CardHeader>

            <CardContent className="space-y-3">
                {criteria.length === 0 ? (
                    <div className="rounded-xl border-2 border-dashed py-8 text-center text-muted-foreground">
                        <GitBranch className="mx-auto mb-2 opacity-20" size={28} />
                        <p className="text-sm font-medium">No matching steps</p>
                        <p className="mt-1 text-xs">
                            Without a step nothing scores, and no precedent is ever shown.
                        </p>
                    </div>
                ) : (
                    criteria.map((c, i) => (
                        <CriterionStepCard
                            key={c.criterionKey}
                            criterion={c}
                            index={i}
                            isFirst={i === 0}
                            isLast={i === criteria.length - 1}
                            busy={busy !== null}
                            fieldsLocked={!allowAdd}
                            onPatch={(patch) => void run(c.criterionKey, () =>
                                updateProfileCriterion(profileKey, c.criterionKey, patch))}
                            onRemove={() => {
                                if (!window.confirm(`Remove the step "${c.label}"?`)) return;
                                void run(c.criterionKey, () =>
                                    deleteProfileCriterion(profileKey, c.criterionKey));
                            }}
                            onMoveUp={() => void run(c.criterionKey, () => swapProfileCriterionOrder(
                                profileKey, c as ProfileCriterion, criteria[i - 1] as ProfileCriterion))}
                            onMoveDown={() => void run(c.criterionKey, () => swapProfileCriterionOrder(
                                profileKey, c as ProfileCriterion, criteria[i + 1] as ProfileCriterion))}
                        />
                    ))
                )}
            </CardContent>
        </Card>
    );
}
