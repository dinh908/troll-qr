# Silver Nails · Salon Workspace Demo

Bản demo vận hành tiệm nails dành cho Silver Nails Boardman: chủ tiệm, thợ, khách đặt hẹn và kiosk check-in dùng chung các luồng dữ liệu.

**Chỉ sử dụng dữ liệu giả. Đây là demo tương tác, chưa phải phần mềm thu ngân vận hành thật.** Giá, thợ, giờ, thuế, doanh thu và hồ sơ khách đều là mẫu. Thông tin tiệm do người dùng cung cấp: Silver Nails, 6536 South Ave, Boardman OH 44512, (330) 953-3333.

## Chạy thử trên GitHub Pages

Mở https://dinh908.github.io/troll-qr/silver-nails-system/

Không cần cài npm hay API key. Trang chính là màn hình chủ tiệm; chọn vai trò ở góc phải:

- `#home`: tổng quan chủ tiệm.
- `#staff`: màn hình thợ; `?tech=T1#staff` chọn Linh.
- `#book`: khách đặt lịch.
- `#kiosk`: khách check-in.

GitHub Pages là bản chạy tĩnh: dữ liệu nằm trong IndexedDB của **trình duyệt hiện tại**. Các tab cùng origin và cùng browser profile được cập nhật bằng BroadcastChannel, kèm sự kiện storage / focus. Các cửa sổ riêng tư, browser profile hoặc điện thoại khác không tự chia sẻ dữ liệu. Lần mở đầu tạo dữ liệu mẫu tương đối theo ngày hiện tại ở múi giờ America/New_York. Service worker lưu phần giao diện để mở lại khi mất mạng; tính khả dụng offline phụ thuộc trình duyệt và dữ liệu cache còn tồn tại. Không dựa vào cache thay cho backup.

## Đồng bộ nhiều máy trong cùng tiệm

Có kèm **máy chủ local Node.js + SQLite + Server-Sent Events**. Không cần mua hosting hoặc dùng database OneDrive cho bản chạy LAN này.

1. Cài Node.js **24 trở lên** từ https://nodejs.org/ .
2. Download ZIP repo hoặc clone `https://github.com/dinh908/troll-qr.git`.
3. Mở terminal ở thư mục `silver-nails-system`.
4. Chạy `npm start` để thử trên máy này tại `http://localhost:4173`.
5. Để thử trên điện thoại / tablet cùng Wi-Fi, chạy `npm run start:lan`. Terminal in địa chỉ LAN, ví dụ `http://192.168.x.x:4173`. Mọi thiết bị mở **chính địa chỉ LAN đó**, không mở GitHub Pages.
6. Cho phép Node qua firewall trên mạng riêng nếu hệ điều hành yêu cầu. Không cần port-forward router, không mở ra Internet.

Không có dependency npm cần cài cho server. Dữ liệu được lưu ở `data/silver-demo.sqlite`; không commit thư mục này. Ghi dữ liệu được xử lý trong transaction SQLite, với request ID chống xử lý lại cùng lệnh. Server phát revision mới đến các tab/thiết bị bằng SSE. Nếu mất kết nối, app báo lỗi và không âm thầm chuyển sang dữ liệu riêng của trình duyệt. Máy chủ cần tiếp tục chạy để các thiết bị hoạt động.

Máy chủ này là **demo trong mạng tin cậy**, chưa có đăng nhập, TLS, phân quyền bảo mật hoặc giới hạn truy cập theo nhân viên. Mặc định chỉ bind localhost; cờ `--lan` mới lắng nghe các interface mạng. Không nhập dữ liệu khách thật và không dùng server demo làm dịch vụ công khai.

Biến môi trường tùy chọn: `SILVER_PORT` (mặc định 4173), `SILVER_DATA_DIR` (mặc định `./data`). Bản Pages và bản local server có dữ liệu riêng; chuyển bằng backup JSON nếu cần.

## Các luồng đã thực hiện

| Khu vực | Tính năng trong demo |
|---|---|
| Tổng quan | Doanh thu, tip, khách chờ, trạng thái thợ, lịch hôm nay, biểu đồ 7 ngày, nhật ký thao tác |
| Đặt hẹn | Nhiều dịch vụ, giá/thời lượng, chọn thợ hoặc bất kỳ, slot theo giờ ET, chống trùng khoảng thời gian, hẹn trong 60 ngày |
| Quản lý lịch | Lịch cột theo thợ / danh sách, đổi giờ/thợ, hủy, no-show, check-in, chặn giờ nghỉ, tải Calendar `.ics` |
| Check-in | Tra điện thoại demo, khách có hẹn hoặc walk-in, consent nhận tin, ghi chú |
| Turn | Ít lượt trước, rồi lần nhận gần nhất, rồi thứ tự thợ; loại thợ nghỉ/bận; kiểm tra trùng lịch trước khi bắt đầu; tùy chọn đếm khách yêu cầu thợ |
| Workspace thợ | Lượt được giao, bắt đầu/hoàn tất, trạng thái nghỉ, lịch hôm nay, doanh thu, tip và hoa hồng mẫu |
| POS | Snapshot giá khi tạo phiếu, giảm giá số tiền, tip nhập tay / %, thuế mẫu, cash/card demo, tiền thừa, gán thợ theo dịch vụ |
| Gift card | Phát hành, QR thực chứa mã thẻ, tra mã, USB scanner như bàn phím, camera khi trình duyệt hỗ trợ, khóa thẻ, trừ số dư, kết hợp cash/card, nhật ký |
| Hoàn tiền | Hoàn toàn bộ một lần, cộng lại phần gift card, giữ hóa đơn và lý do, điều chỉnh báo cáo |
| Hóa đơn / thiết bị | Hóa đơn in bằng trình duyệt, bản in gift card, kiểm tra in, lệnh mở két mô phỏng, nhật ký thiết bị |
| Khách hàng | Hồ sơ, liên hệ giả, ghi chú, lịch sử, consent, tìm kiếm |
| Nhân viên / menu | Thêm thợ, nghỉ/vào ca, chặn giờ; thêm/sửa/ẩn dịch vụ |
| Kho | Tồn kho vật tư, nhắc sắp hết, điều chỉnh nhập/sử dụng thủ công, nhật ký |
| Tin nhắn / email | Queue xem trước, xác nhận hẹn, email receipt, follow-up, bộ tạo nhắc hẹn ngày mai chạy bằng nút, chống nhắc trùng |
| Báo cáo | 1/7/30 ngày, doanh thu dịch vụ, tip, thuế mẫu, cash/card/gift, bán gift card riêng, hoa hồng thợ, xuất CSV |
| Dữ liệu | Backup JSON, khôi phục có kiểm tra dữ liệu, reset có xác nhận; thay đổi đồng bộ trong phạm vi chế độ chạy |

## Thử nhanh trong 5 phút

1. Trong **Check-in & chia turn**, bấm **Khách walk-in**, chọn Classic Manicure, tên `Demo Nguyen`, số `3305550123`.
2. Bấm **Bắt đầu**, để tự động chọn thợ. Thợ đang bận/nghỉ hoặc trùng lịch sẽ không được chọn.
3. Mở **Đội ngũ → Mở workspace** của thợ vừa nhận khách trong tab thứ hai. Bấm **Hoàn tất** ở màn hình thợ.
4. Trở lại tab chủ → **Thanh toán**. Chọn phiếu, nhập tip $5, nhập gift card `SN-DEMO-0100` (thẻ mẫu $100). Hoàn tất và xem hóa đơn.
5. Vào **Gift cards** xem số dư mới và lịch sử; vào **Báo cáo** xem doanh thu/tip; thử **Hoàn tiền demo** rồi xem số dư được cộng lại.
6. Thử **Đặt hẹn** ngày mai. Chọn cùng thợ và một giờ giao nhau sẽ không được đặt trùng. Thử đổi/hủy/chặn giờ.
7. **Cài đặt → Tải backup JSON**, rồi thử reset/khôi phục. Dùng một file demo do ứng dụng xuất.

## Điều đã mô phỏng và phần cần tích hợp thật

- **Thanh toán thẻ**: chỉ ghi một giao dịch demo, không gọi Square/Stripe, không đọc/chứa số thẻ ngân hàng.
- **SMS/email**: chỉ tạo và xử lý trạng thái trong queue demo, không gửi qua nhà cung cấp. Nhắc hẹn chạy khi bấm nút; chưa có cron nền.
- **Két tiền / terminal**: chỉ ghi log mô phỏng. Máy in dùng hộp thoại in của trình duyệt, chưa có ESC/POS / driver / local hardware bridge.
- **QR**: mã được tạo bằng QRCode.js, có thể đọc bằng scanner hỗ trợ QR. Máy quét USB cần chế độ keyboard-wedge và focus đúng ô nhập. Camera tùy thuộc BarcodeDetector, quyền camera và HTTPS/localhost; hỗ trợ nhập mã khi không dùng được camera. Camera qua HTTP LAN thường không khả dụng.
- **Quyền chủ/thợ/khách**: là các màn hình trải nghiệm, không phải xác thực. Người mở demo có thể chuyển vai trò, xem dữ liệu và sửa bằng công cụ trình duyệt. Tra cứu điện thoại chưa có OTP.
- **App điện thoại**: giao diện web responsive, có manifest; chưa phải ứng dụng đã phát hành App Store / Google Play.
- **Đồng bộ**: Pages chỉ đồng bộ tab; LAN server thực sự dùng chung database giữa thiết bị nhưng chưa có cloud sync hay offline outbox cho client mất kết nối.
- **Backup/OneDrive**: tải file JSON thủ công, có thể tự lưu vào OneDrive. Không mở database SQLite đang chạy trong thư mục đồng bộ. Backup demo chưa mã hóa, chưa có retention hoặc lịch backup tự động.
- **Turn**: quy tắc mẫu, chưa biểu diễn mọi luật thực tế như half-turn, nhóm tay/chân, skip có lý do hoặc chia lượt theo giá. Có thể sửa sau khi chủ tiệm gửi sơ đồ vận hành.
- **POS**: mỗi phiếu được phân một thợ lúc làm; khi thu ngân có thể gán thợ cho từng dịch vụ để tính báo cáo. Chưa có phục vụ song song nhiều thợ / nhiều trạm, sửa giá tùy ý trên phiếu, partial refund, payout, payroll, loyalty hoặc multi-location.
- **Báo cáo**: hóa đơn hoàn được loại khỏi ngày gốc; chưa phải báo cáo tiền hoàn theo ngày xử lý hoàn. Tip/giảm giá chia theo tỷ trọng giá từng dịch vụ, dùng largest remainder để không mất cent. Gift card sale được tách khỏi service revenue. Thuế 0% mặc định chỉ là giả lập.
- **Kho**: điều chỉnh thủ công, chưa có recipe trừ vật tư tự động theo dịch vụ hoặc đơn mua hàng.

## Cấu trúc mã

- `domain.js`: lệnh nghiệp vụ dùng chung, kiểm tra xung đột, tiền bằng integer cent, tạo dữ liệu mẫu, kiểm tra backup.
- `store.js`: IndexedDB transaction + BroadcastChannel hoặc HTTP/SSE tùy runtime. Không lưu credential.
- `app.js`: màn hình, form, QR, báo cáo, backup, in và các thao tác demo.
- `styles.css`: giao diện responsive, print CSS; Google Fonts là tùy chọn, có font fallback.
- `server.mjs`: server không dependency, SQLite transaction, command idempotency, SSE, giới hạn file công khai.
- `runtime.js`: Pages dùng browser; server thay response để dùng API.
- `sw.js`: cache giao diện trên Pages; không cache API.
- `tests/`: kiểm thử nghiệp vụ và server.
- `vendor/qrcode.js`: QRCode.js (MIT), nguồn https://github.com/davidshimjs/qrcodejs ; xem `vendor/LICENSE-qrcode.txt`.

## Kiểm thử

`npm test` chạy Node test runner. Không gọi dịch vụ ngoài, không thu tiền hoặc gửi tin. Kiểm tra: khoảng lịch và biên thời gian; múi giờ/DST; hủy/đổi/chặn lịch; state machine check-in–checkout; thợ bận/nghỉ/turn; cents/thuế/tip; gift split/refund; không thanh toán hai lần; consent/reminder dedupe; tồn kho; backup sai; request idempotency; concurrent API checkout; SSE; restart persistence; chống mở file database/source server qua HTTP và từ chối lệnh cross-origin.

Tài liệu API tham khảo: https://nodejs.org/api/sqlite.html ; https://developer.mozilla.org/en-US/docs/Web/API/BroadcastChannel .

Repo được thêm riêng thư mục `silver-nails-system`; các file cũ ở root của `troll-qr` được giữ nguyên.
