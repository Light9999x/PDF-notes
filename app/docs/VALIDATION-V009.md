# v009 驗證與待驗收（App 0.9.0）

日期：2026-09-19。依 [AGENTS.md](../../AGENTS.md)，未啟動 App、開發／預覽服務或 App 瀏覽器；未跑 E2E／啟停整合測試。未提交、推送或部署；線上站點不由本輪更新。程式保留 0.8.1 資安及子路徑支援。

## 已執行檢查

- `npm run check`：通過，包含 src、單元測試及新舊 E2E 型別檢查。
- `npm run test`：**210 項／11 個檔案通過**，其中 v009 新增 20 項；保留 0.8.1 的 190 項回歸，未知格式拒絕改測 format 6，搜尋列 SSR 改檢查持續掛載但 hidden／inert。
- `git diff --check`：通過。
- `npm run build`：通過；198 個 PDF 離線資產、203 項 PWA 預快取，去背 Worker 保持離線封裝。主 JS 約 1.253 MB，沿用超過 500 kB 的打包提示。
- `node scripts/verify-build.mjs /`：本機根路徑、manifest、CSP、service worker 靜態核對通過。未進行發布。
- `node scripts/release.mjs`：產生 `release/pdfnote-0.9.0-pwa.zip`（約 3.21 MB、258 項）。CRC、SHA-256 及 ZIP 內 Markdown 相對連結核對通過；發行包新增入門指南，保留原技能參考的可用連結。校驗值見 `release/SHA256SUMS.txt`。

## 五項證據

| 需求 | 本輪自動化／靜態證據 | 未測 |
| --- | --- | --- |
| 圖庫精簡 | removed 成功狀態與 onRestore 介面已移除；保留錯誤、busy、會員模型。v008 的資產保留、舊檔重匯與因果移除測試持續通過。 | 真實點移除、錯誤提示、重開與手機入口 |
| 更多浮層 | 向上、限高捲動、頂邊翻向、320／360／412／1366px 與 visualViewport 偏移的定位測試；觸發鈕 ARIA SSR；portal／Popover 及取消事件綁定靜態檢查。 | 真實卡片 bounding rect 不變、overflow／dialog top layer、safe area、字體放大、外點／鍵盤焦點 |
| 面板底色 | editor-body 與 page-scroll 使用同一 reader-bg；外側按鈕與欄位結構保留。E2E 準備 computed style 比較。 | 桌面／手機展收後異色長條的目視確認 |
| 圖層 | 四指令、相鄰未選一步、多選相對順序、邊界 no-op、頁面隔離、expected head 與整批失敗、反向批次復原、封裝／副本／Drive 快照、並行新增／重排／刪除／重解衝突、舊檔 ID 順序、非法 layer／降格式拒絕。Canvas 實際顏色像素驗證繪製最上層與反向命中一致。 | 真實四種類型混疊、App 完整 PDF 匯出、IndexedDB 升版與失敗、真實 Drive 雙端／重新開啟 |
| 動畫 | fake timers 驗證關閉中反轉會取消舊 timer，僅最後一次 settle；reduce 不呼叫 animate。SSR 驗證草稿內容掛載且隱藏 inert。完成全入口盤點。 | 真正 WAAPI／動畫流暢度、原位 IME／焦點、隱藏 Tab、快速連點、閱讀錨點與重繪次數 |

Canvas 測試在 Node 執行，圖層描繪使用 core paint；沒有開瀏覽器，也未藉此宣稱 SVG、匯出整體視覺與裝置互動通過。快照測試不是實際 Google 授權或 API 端到端測試。動畫測試使用節點替身及 fake timers，不能代表動畫在目標裝置上的品質。

## 準備但未執行

`e2e/v009.spec.ts` 準備：圖層按鈕／邊界、繪製 DOM 順序、命中、保存與整批復原；更多向上覆蓋／卡片尺寸／End／Escape 焦點；360／1366px 的面板關閉 inert、外部控制、快速反轉、reduce 及背景連續。既有 v005／v008 更多入口及 Drive 進階設定查找改用新按鈕。腳本僅做型別檢查，未執行。

待驗收包含：

- Windows 11 25H2／i7-11800H；Galaxy S24+／Android 16，手機橫直向，無專用觸控筆。
- 320／360／412px、600／601 斷點、短高度窗口、桌面、125%／150% 字體、DPR 2、軟鍵盤及 safe area。
- 文件／資料夾／圖片選單在頂邊、捲動容器、dialog、更多內容變化時維持可見，不推移卡片；唯一選單、失焦與鍵盤操作。
- 全部盤點伸縮區塊、reduce、連續反向、草稿／選取／焦點／錨點保留、適配重繪次數。
- 四類註記的重疊、單多選、上下邊界、PDF／App 四方向旋轉、0° 圖片、旋轉把手、Shift 與去背回歸。
- 離線雙端的不同物件／同物件重排、刪除並行、舊檔重匯、衝突候選在其他物件間的排序、保存失敗原子性、一次復原、完整 PDF 匯出一致。

## 自行開啟與停止

根目錄 PowerShell：`./app/start-pdfnote.ps1`；停止服務：`./app/stop-pdfnote.ps1`。在 `app/` 可用 `npm run preview`／`npm run stop`。完成或取消草稿，確認已存至本機，另行關閉 App 視窗／分頁；離線 PWA 仍顯示不表示服務仍監聽。不清除網站資料、不全面結束 Node。

升級前備份，所有同步裝置更新至 0.9.0。資料庫版本 7、排序使用文件 format 5；相容性見 [設計](V009-DESIGN.md)，完整使用步驟見 [README](../README.md)。
