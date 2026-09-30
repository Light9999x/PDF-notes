# v011 驗證紀錄

日期：2026-09-30。原始碼版本：0.11.0。本紀錄涵蓋本機實作檢查；使用者後續已授權提交並推送 main，由 GitHub Actions 執行建置與 Pages 部署。部署結果以 [工作流程紀錄](https://github.com/Light9999x/PDF-notes/actions/workflows/pages.yml) 為準。

## 已執行（不啟動服務）

| 檢查 | 結果與範圍 |
| --- | --- |
| `npm --prefix app run check` | 通過 TypeScript 檢查，包含準備好的 E2E 程式。 |
| `npm --prefix app test` | 15 檔、268 項通過；包括原有保存、群組、同步衝突、圖片與文字回歸。 |
| `npm --prefix app run build` | TypeScript、Vite、PWA 建置與 package 複製通過；仍有大型 JS chunk 提示。 |
| `node scripts/verify-build.mjs /`（app 內） | 通過靜態路徑、manifest、CSP 與 Service Worker 檢查。 |
| `node scripts/release.mjs`（app 內） | 產生 0.11.0 PWA ZIP 與 SHA256；不發布。 |

`tests/v011.test.ts` 驗證實際 canvas 像素在請求等待／失敗時保留，成功提交後才回收舊值；較慢舊結果不覆寫新結果；取消不當成真正錯誤；最多兩個工作、排隊優先順序、關閉取消、像素與頁數快取限制及重訪；可見頁不被附近預載擠掉。以 PDF.js 真實 viewport 驗證混合尺寸、CropBox、原生／應用旋轉與舊新圖層矩陣；多次 zoom 不重新 getPage；固定 pinch gap 及錨點補償涵蓋兩種排列。

工具設定的 SSR 測試更新為面板元件，保留所有工具入口與僅顯示適用參數的檢查。這些測試驗證協調器、幾何、事件路由及標記，不宣稱涵蓋瀏覽器 layout／逐幀畫面。

## 尚未執行

遵照專案偏好，未啟動 App、開發／預覽服務、App 瀏覽器、`test:e2e` 或 `test:server`。沒有本輪截圖、動畫錄影、實機 FPS、工具列實測高度或記憶體實測結果。

準備 `e2e/v011.spec.ts`：915×412 coarse pointer 橫向單列／完整選單、共用面板與閱讀區不位移；混合紙張 zoom／排列固定 gap；以有色 PDF 在多個 animation frame 取樣 canvas 像素及 loading。舊 v010 面板動畫斷言改為底部方向，v003 快取數量改按新上限。這些測試尚未執行。

## 待裝置驗收矩陣

| 裝置／情境 | 需要記錄與確認 |
| --- | --- |
| Galaxy S24+／Android 16，瀏覽器及安裝 PWA，直向／橫向 | 記錄 CSS viewport、工具列實際高度及閱讀區尺寸；橫向目標 48～56px，直向 96～112px，安全區另計。寬度超過 600px 的短螢幕須啟用精簡版。 |
| 全部工具、方向切換、鍵盤、大字體、安全區、減少動態效果 | 共用底部面板整體動畫、不推文件、不留遮罩、不穿透畫筆；控制項能內捲觸及；屬性草稿保留；Esc／關閉焦點正確；桌面仍為左欄。 |
| Windows 11 25H2 及手機，混合紙張、四種旋轉 | 測量紙張外框 gap 為 12px／8px，兩種排列與 pinch 期間一致；首尾適配置中、跳頁、搜尋、框選、拖放與錨點不回退。 |
| 快速縮放、慢速 render、途中旋轉／切頁／換文件／關閉 | 逐幀錄影觀察無白屏、載入插入或舊比例回退；只有最新完整結果替換；記錄 console 取消／canvas 錯誤。需包含首次與背景失敗／重試。 |
| PDF 文字、高光、筆跡、圖片、群組 | 預覽與完成後的多層對齊、文字複製、點擊命中、拖曳、控制點與選取鎖定。 |
| 長文件反覆捲動與開關 | 記錄已掛載 canvas 數量／總像素、背景配置及瀏覽器記憶體，核對 cache 上限與釋放；淘汰後可重新載入。單元上限不等於程序總記憶體上限。 |
| 保存、離線、匯出與 Google Drive 雙端同步 | 延續既有人工驗收，確認重開與群組資料保持，沒有格式遷移。 |

## 手動啟停

專案根目錄 PowerShell：`./app/start-pdfnote.ps1`；停止：`./app/stop-pdfnote.ps1`。在 app/ 可用 `npm run preview`／`npm run stop`。先完成編輯、套用屬性並等「已存至本機」再關閉視窗。停止伺服器後離線 PWA 仍可開啟，需另外關閉分頁／App 視窗；不清網站資料、不全面終止 Node。

本機 `prompts/` 與根目錄 `AGENTS.md` 不追蹤、不提供公開文件入口，也不隨 ZIP 發布。
