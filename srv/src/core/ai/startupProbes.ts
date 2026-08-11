import cds from '@sap/cds';

const LOG = cds.log('ai-startup');

/**
 * Probe khởi động cho SAP AI Core.
 *
 * ── Vì sao cần probe ──
 * Mọi thứ đều nạp lười: adapter chỉ đọc credential ở lần gọi model đầu tiên. Để
 * nguyên như vậy thì một bản deploy thiếu destination vẫn khởi động sạch sẽ, phục
 * vụ mọi màn hình bình thường, rồi vỡ đúng lúc người dùng bấm nút — giữa chừng
 * công việc của họ, trước mặt người ít có khả năng sửa nhất.
 *
 * Probe dời thời điểm vỡ đó về một dòng log ngay sau khi khởi động, nơi người vận
 * hành đang nhìn sẵn.
 *
 * ── Vì sao không chặn server ──
 * Probe hỏng thì báo, không chết. Các màn hình đọc từ DB vẫn dùng được khi AI Core
 * chưa thông, và crash-loop vì một destination tạm thời trục trặc biến một hệ
 * thống suy giảm thành một hệ thống ngừng hẳn.
 *
 * Không đọc credential nào và không tốn một lời gọi model nào.
 */

/**
 * Nạp singleton adapter của CDK.
 *
 * CDK công bố `aiCore` dưới dạng default re-export — dạng mà interop CJS→ESM của
 * Node không nhìn xuyên qua được bằng named import. Đọc thẳng từ module object thì
 * chạy được với cả hai loader. Dùng dynamic import để việc require file này không
 * tự kéo theo cây phụ thuộc của adapter.
 */
async function loadAiCore(): Promise<any> {
  const mod: any = await import('@cnma/sap-aicore-integrate');
  return mod.aiCore || mod.default?.aiCore;
}

/**
 * Xác nhận credential AI Core giải được và có resource group.
 *
 * `getResourceGroup()` là lời gọi rẻ nhất mà vẫn chạy qua cả chuỗi — binding
 * destination service, token OAuth, tra destination, thuộc tính `resourceGroup` —
 * mà không tốn lời gọi model.
 *
 * Dòng log cũng nói rõ adapter đã đi **đường credential nào**, vì nó tự chọn trong
 * im lặng: có destination service bound thì dùng destination AICORE, không bound
 * thì dùng bất cứ `AICORE_*` nào còn sót trong `.env`. Hai đường đó thường trỏ tới
 * hai tenant AI Core khác nhau, nên một lần chạy lặng lẽ đi đường thứ hai sẽ hỏng
 * muộn hơn nhiều, với lỗi chẳng nói gì về cái binding đã biến mất.
 */
export async function probeAiCore(): Promise<void> {
  try {
    const aiCore = await loadAiCore();
    if (!aiCore) throw new Error('@cnma/sap-aicore-integrate không export "aiCore"');

    const [resourceGroup, destination] = await Promise.all([
      aiCore.getResourceGroup(),
      aiCore.getSdkDestination(),
    ]);

    if (destination) {
      LOG.info(
        `AI Core thông qua destination '${destination.destinationName}' — resource group '${resourceGroup}'.`,
      );
      return;
    }
    LOG.warn(
      `AI Core đang chạy bằng credential trong biến môi trường AICORE_* (resource group '${resourceGroup}'), ` +
        'KHÔNG phải destination AICORE — không có destination service nào bound vào profile này. ' +
        'Chấp nhận được khi dev local, nhưng không được để nguyên khi deploy.',
    );
  } catch (error: any) {
    LOG.error(
      'AI Core CHƯA cấu hình. Mọi lời gọi model sẽ hỏng cho tới khi sửa. ' +
        'Dev local: đặt AICORE_SERVICE_KEY, hoặc bộ AICORE_AUTH_URL / AICORE_CLIENT_ID / ' +
        'AICORE_CLIENT_SECRET / AICORE_BASE_URL / AICORE_RESOURCE_GROUP trong .env. ' +
        'Trên BTP: tạo destination AICORE từ service key (kèm thuộc tính bổ sung "resourceGroup") ' +
        'rồi bind destination service vào app.',
      error?.message,
    );
  }
}

/** Chạy mọi probe mà không chặn khởi động. */
export function runAiStartupProbes(): void {
  void probeAiCore();
}
