# 核心規劃 v001：實作驗收紀錄

版本註記：原「第七版」指核心規劃的第七次歷史修訂，該完整規劃檔現統一編為 [v001](../../prompts/v001_核心功能規劃與開發Prompt.md)。改號不變更以下測試結果或驗收狀態。

測試日期：2026-09-18。這是**程式與本機瀏覽器測試結果**，並非全項目實機驗收通過聲明。

## 實際執行環境

- 此工作空間所在 Windows 電腦，Node.js 22.16.0。
- Microsoft Edge 153.0.4234.32，由 Playwright 啟動隔離瀏覽器資料目錄，headless 模式。
- 桌面 viewport 1440 × 980；手機版面模擬 412 × 915。
- 未存取使用者私人 PDF、Google 權杖或雲端筆記；測試文件為測試程式本機生成。
- 未連接 Galaxy S24+，不將窄螢幕或隔離 browser context 當成 Android 實機。
- 未測觸控筆、壓力或防掌誤觸；未取得實際安裝後的 Windows／Android 測試結果。

## 已執行通過

`npm run check`：TypeScript 檢查通過。

`npm test`：**18 項核心測試通過**。

- 雙端離線分別新增四個物件，合併後全部保留。
- 合併交換性、結合性、冪等性；重複、亂序操作。
- 不依賴裝置時間的並行修改衝突。
- 刪除與舊存檔合併不復活；修改／刪除衝突保留。
- 明確版本擇一；兩端同時選擇不同版本，以及未見分支抵達後重新衝突。
- 缺少 parent、循環與操作 ID 碰撞拒絕。
- `.pdfnote` 資產、原始 bytes、衝突、刪除與來源完整還原。
- 篡改資產、格式不相容、不合法頁碼拒絕；獨立副本與基底相容性。
- 0／90／180／270 度旋轉、裁切偏移與缩放座標反算。

`npm run test:e2e`：**5 項瀏覽器端到端測試通過**。

| 案例 | 實際驗證 |
|---|---|
| 真實 PDF 完整工作流程 | 匯入、原始 bytes 留存、PDF 文字層、繁體中文文字、筆跡、螢光筆、插入 PNG、尺寸修改、復原／重做、自動儲存與 reload、兩種匯出、頁碼恢復、同 ID 的取消／合併／副本、離線 reload 與離線 PDF 匯出 |
| 衝突工作流程 | 匯入含並行修改／刪除的真實 `.pdfnote`，阻擋未解決衝突的 PDF 匯出，工作存檔保留所有候選版本，獨立頁查看刪除版、離開仍保留衝突、選定後清單與物件更新 |
| Drive adapter 模擬傳輸 | 兩個隔離瀏覽器 context，模擬 GIS token 及 Google Drive REST 回應，確認 appDataFolder parents／spaces、不可變資產及快照、各自離線新增後雙方保留物件；429 後保留本機修改並重試成功。**不等於真實 Google 登入驗收** |
| 旋轉／裁切匯出比對 | 建立有 CropBox 偏移及 90 度旋轉的 PDF，加入筆跡和繁體文字，匯出後重新匯入；比對原編輯畫面與合併 PDF 的 RGB 平均絕對誤差小於 2／255 |
| 圖片與損毀檔案 | PNG、JPG 在本機轉成可閱讀 PDF；損毀 PDF 明確提示且不建立假成功文件 |

`npm run build`：正式建置成功。Service worker 預先快取 202 個項目（約 6 MB），建置腳本另外檢查 PDF CMaps／標準字型／WASM 全部存在於快取清單，PDF worker 也包含其中。

套件安裝時 npm audit 回報 0 個已知漏洞；這不代表無未知漏洞或完整安全稽核。建置仍有大型 bundle 提示，主要來自本機 PDF 引擎，功能測試通過；首次下載及大型文件的效能尚待實機量測。

## 階段狀態

| 階段 | 已完成成果 | 尚未完成／驗證 |
|---|---|---|
| A 選型與風險 | 官方文件及授權查核、PWA 專案、資料圖與格式測試 | 目標裝置效能基線 |
| B 本機閱讀與筆記 | PDF／文字層、四類物件、本機交易、位置、復原重做、離線瀏覽器流程 | Windows 安裝後操作、Android 實機手勢、壓力與防誤觸 |
| C 轉換 | PNG／JPG 內建離線轉換、原圖保留 | DOC／DOCX 依使用者授權延後；不影響核心功能 |
| D 同步與衝突 | 真實 REST adapter、GIS 流程、不可變傳輸、物件合併、獨立衝突頁、模擬雙端／429 測試 | OAuth 用戶端設定、Google 真實帳號／免費額度／權限錯誤、雙端端到端；長期免互動登入未完成 |
| E 匯出與交付 | 兩種匯出、可攜 ZIP、自足還原、重複匯入選擇、PWA 部署 ZIP、說明 | Android HTTPS 部署、Windows／Galaxy S24+ 安裝與跨平台匯入實機驗收 |

## 交付界線

可在本機立即使用的 PWA 程式、正式網頁資產與部署 ZIP 已產生；不是原生 EXE／APK。**v001 所有核心功能的最終交付尚未完成**，因為真實 Google 同步、長期登入體驗、Android 部署與指定實機驗收尚有缺口。

原規劃文件保持原樣，不勾選其中未驗證的驗收條目。後续步驟為 Google OAuth 設定與兩端登入、免費 HTTPS 部署、指定實機測試及必要修正。

## 測試產物

- `test-results/acceptance.pdfnote`、`acceptance-annotated.pdf`：測試生成工作存檔與分享 PDF。
- `test-results/crop-before.png`、`crop-after.png`、`crop-export.pdf`：旋轉／裁切比對。
- `test-results/editor-desktop.png`、`editor-mobile.png`、`library-documents.png`、`conflict-delete-preview.png`：畫面檢查。
- `playwright-report/index.html`：本次端到端報告。
- `release/pdfnote-0.1.0-pwa.zip` 與 `release/SHA256SUMS.txt`：可部署產物及校驗。

上述測試產物皆可透過測試與 release 腳本重新產生，不是使用者原始文件。
