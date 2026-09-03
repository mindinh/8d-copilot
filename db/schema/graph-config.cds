namespace cnma.proresolve;

using { managed } from '@sap/cds/common';

/**
 * Công tắc chọn engine truy hồi, và các tham số admin chỉnh được.
 *
 * ── Vì sao đúng MỘT dòng, và vì sao công tắc là TOÀN CỤC ──
 * Cách hiển nhiên để giảm rủi ro là bật dần từng bước: D4 chạy graph, bảy bước
 * còn lại giữ engine cũ. Cách đó sai, và sai một cách âm thầm.
 *
 * `mergeStepPrecedents` gộp kết quả tám bước thành MỘT danh sách được đánh số
 * MỘT LẦN, giữ lại bản có điểm cao nhất bằng một phép so sánh `>`. Chạy lẫn lộn
 * thì phép so sánh đó đang đặt điểm graph (số bằng chứng có trọng số, không có
 * trần cố định) cạnh điểm của engine cũ (thang 0–16) — hai thang đo khác nhau.
 * Hậu quả: `precedents#1` thôi không còn là case mạnh nhất, và không lớp nào bắt
 * được, vì `postProcess` chỉ kiểm trích dẫn có khớp `^(team\.|precedents#)` hay
 * không, mà một trích dẫn sai vẫn đúng cú pháp.
 *
 * Nên bảng này không có cột `stepCode`. Muốn đối chiếu hai engine thì dùng
 * `npm run shadow:graph` — nó chạy cùng một case qua cả hai rồi in bảng so sánh,
 * ngoài luồng sinh báo cáo, nơi kết quả không thể rò vào output cho người dùng.
 */
entity GraphRetrievalSettings : managed {
    key ID              : String(10) default 'GLOBAL';

        /**
         * `scoring` = engine chấm điểm cũ · `graph` = truy hồi bằng graph.
         *
         * Mặc định `scoring`: ngày đầu tiên sau khi deploy, hành vi phải giống hệt
         * hôm trước. Một tính năng tự bật lên là một tính năng không ai kịp đối chiếu.
         */
        engine          : String(10) default 'scoring';

        /**
         * Trần số từ khoá của case đang mở được đem đi truy vấn.
         *
         * Mỗi từ khoá thành một ô bind, nên đây cũng là trần số tham số. Có trần
         * vì một payload bất thường không được phép sinh ra câu truy vấn dài vô
         * hạn — nó sẽ hỏng ở tầng DB kèm một thông báo chẳng liên quan gì tới
         * nguyên nhân thật.
         */
        maxKeywords     : Integer    default 30;

        /**
         * Bật/tắt việc rơi về engine cũ khi graph không dùng được.
         *
         * Để `true` ở mọi môi trường thật. Chỉ tắt khi đang ĐO graph: rơi về âm
         * thầm là đúng cho người dùng nhưng lại giấu mất sự cố khỏi người đang thử.
         */
        fallbackEnabled : Boolean    default true;
}
