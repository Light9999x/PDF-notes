# 頁間 PDFnote

目前 App **0.8.1**：保留 [v008 功能](prompts/v008_選取左側面板與圖片處理_開發Prompt.md)，補強檔案／Drive 資料驗證並新增 GitHub Pages 手機測試部署。

- [手機測試網址](https://light9999x.github.io/PDF-notes/)／[安裝與測試說明](app/docs/MOBILE-TESTING.md)
- [0.8.1 資安檢查、測試及限制](app/docs/SECURITY-REVIEW-0081.md)
- [v009：選單、面板動畫與物件圖層 Prompt](prompts/v009_選單面板動畫與物件圖層_開發Prompt.md)：前五項僅規劃，尚未實作。

新增點選／Shift 增減選、左側面板與外側開合控制、穩定高度工具列、圖片正立放置與畫面上方旋轉把手、圖片庫移除／恢復，以及免費離線手動去背。去背以原尺寸透明 PNG 保存副本，保留原圖，支援最多 4,194,304 像素。圖片庫會員操作使用文件 format 4，本機資料庫升至版本 6；同步裝置請一併更新，勿降版或清除網站資料。

本輪未啟動 App；靜態／像素與資料測試已執行，瀏覽器畫面、真機與實際 Drive 同步仍待驗收。

- [v008 設計、採用預設與相容性](app/docs/V008-DESIGN.md)
- [v008 檢查結果及待驗收矩陣](app/docs/VALIDATION-V008.md)
- [v007 設計與採用預設](app/docs/V007-DESIGN.md)
- [v007 檢查結果及待驗收矩陣](app/docs/VALIDATION-V007.md)
- [v006 設計與全頁面精簡清單](app/docs/V006-DESIGN.md)
- [v006 檢查結果及待驗收矩陣](app/docs/VALIDATION-V006.md)
- [v005 設計與採用預設](app/docs/V005-DESIGN.md)
- [v005 檢查結果及待驗收矩陣](app/docs/VALIDATION-V005.md)
- [v004 設計與相容策略](app/docs/V004-DESIGN.md)
- [v004 檢查結果及待驗收清單](app/docs/VALIDATION-V004.md)
- [啟動、使用、關閉及升級說明](app/README.md)
- [v003 設計與相容策略](app/docs/V003-DESIGN.md)
- [v003 驗收紀錄](app/docs/VALIDATION-V003.md)
- [Google Drive 設定](app/GOOGLE_DRIVE_SETUP.md)
- [Prompt 版本索引](prompts/CHANGELOG.md)

## 快速開啟與停止

在專案根目錄的 PowerShell 執行（已有建置時）：

```powershell
# 開啟本機服務
.\app\start-pdfnote.ps1
```

再開啟 [頁間 App](http://127.0.0.1:4173/)。關閉前確認「已存至本機」，再關閉 App 視窗／分頁。在另一個 PowerShell 終端機回到專案根目錄，執行：

```powershell
# 停止本專案服務，即使由另一個終端機啟動也適用
.\app\stop-pdfnote.ps1
```

停止指令會確認 4173 是否已無監聽。PWA 有離線快取，停止服務不會自動關閉畫面，畫面仍可使用也不代表服務未停止。不會清除筆記或網站資料。

若目前已在 `app/`，可用 `npm run preview` 開啟、`npm run stop` 停止。初次安裝／程式更新需先：

```powershell
cd app
npm ci --cache .npm-cache
npm run build
```

協作偏好：除非使用者明確要求，代理不自動啟動 App／預覽服務或開啟瀏覽器，只提供操作指令。

`prompts/` 保留需求規劃；程式、文件、依賴、測試及發布 ZIP 集中在 `app/`。磁碟搬移不改網站 origin 或 URL base，請沿用原網址及瀏覽器設定檔，不要清除網站資料。
