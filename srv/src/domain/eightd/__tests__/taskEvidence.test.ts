import {
    createTaskEvidence,
    deleteTaskEvidence,
    findTaskInResultJson,
} from '../eightDRepository';

// Mock cds database
jest.mock('@sap/cds', () => {
    const memoryDb: Record<string, any[]> = {
        'cnma.proresolve.Disciplines': [],
        'cnma.proresolve.TaskEvidences': [],
    };

    const mockCds: any = {
        utils: {
            uuid: () => 'mock-uuid-' + Math.random().toString(36).slice(2, 8),
        },
        log: () => ({
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
        }),
    };

    return mockCds;
});

describe('findTaskInResultJson', () => {
    it('returns null for empty or invalid resultJson', () => {
        expect(findTaskInResultJson(null, 't1')).toBeNull();
        expect(findTaskInResultJson('', 't1')).toBeNull();
        expect(findTaskInResultJson('invalid json', 't1')).toBeNull();
    });

    it('finds task in containment.assignedActions', () => {
        const json = JSON.stringify({
            containment: {
                assignedActions: [
                    { id: 'task-1', name: 'Check stock', status: 'Done' },
                    { id: 'task-2', name: 'Sort inventory', status: 'In progress' },
                ],
            },
        });

        const doneTask = findTaskInResultJson(json, 'task-1');
        expect(doneTask).not.toBeNull();
        expect(doneTask?.status).toBe('Done');

        const inProgressTask = findTaskInResultJson(json, 'task-2');
        expect(inProgressTask?.status).toBe('In progress');

        expect(findTaskInResultJson(json, 'task-3')).toBeNull();
    });

    it('finds task in corrective.assignedActions', () => {
        const json = JSON.stringify({
            corrective: {
                assignedActions: [
                    { id: 'task-c1', name: 'Replace tool', status: 'Done' },
                ],
            },
        });
        const task = findTaskInResultJson(json, 'task-c1');
        expect(task?.status).toBe('Done');
    });
});

describe('createTaskEvidence constraints', () => {
    it('rejects non-PDF mediaType with 400', async () => {
        await expect(
            createTaskEvidence({
                reportID: 'r1',
                disciplineCode: 'D3',
                taskId: 't1',
                fileName: 'photo.png',
                fileSize: 1024,
                mediaType: 'image/png',
                actor: 'user1',
            }),
        ).rejects.toMatchObject({
            code: 400,
            message: 'Only PDF files are allowed.',
        });
    });

    it('rejects file size > 10MB with 400', async () => {
        const elevenMb = 11 * 1024 * 1024;
        await expect(
            createTaskEvidence({
                reportID: 'r1',
                disciplineCode: 'D3',
                taskId: 't1',
                fileName: 'huge.pdf',
                fileSize: elevenMb,
                mediaType: 'application/pdf',
                actor: 'user1',
            }),
        ).rejects.toMatchObject({
            code: 400,
            message: expect.stringContaining('exceeds 10 MB limit'),
        });
    });
});
