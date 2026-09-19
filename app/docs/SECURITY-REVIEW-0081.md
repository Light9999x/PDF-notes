# App 0.8.1 資安檢查與部署紀錄

日期：2026-09-19。使用者授權立即執行原需求第 6 項；前五項只寫入 [v009 prompt](../../prompts/v009_選單面板動畫與物件圖層_開發Prompt.md)。未實作前五項 UI。

## 檢查範圍與已修正事項

檢查 React 顯示入口、檔案匯入、ZIP 解封裝、資產／版本圖驗證、IndexedDB 保存、Drive OAuth／下載／同步、本機啟停腳本、PWA 建置及待公開檔案。這是原始碼檢查、依賴公告查詢與單元測試，不是滲透測試或「零漏洞」保證。

| 發現／風險 | 0.8.1 處理 |
| --- | --- |
| `.pdfnote` 先整份 arrayBuffer 才查 150 MiB 上限，超大檔先占記憶體 | 新增 `unpackFile`，讀取前檢查 File.size，讀取後再檢查實際長度 |
| Drive 下載只檢查 metadata.size，缺漏／不實大小可造成未設限配置 | 串流累計實際 bytes、超額取消 reader；同步資料單次回應上限 150 MiB、清單回應 10 MiB |
| Drive JSON 型別斷言不能驗證外部資料；分頁可無限延續 | 檢查 metadata、hash、type、size、分頁 token；最多 10,000 筆／100 次清單請求，重複 token 中止 |
| 資產清單可在 schema 驗證前引發下載與快取更新 | 下載前驗證所有 descriptor，單文件資產總量 150 MiB、10,000 筆；通過文件驗證及保存後才加入共用快取 |
| ZIP 同名項目會被解壓器覆寫、額外項目未明確拒絕 | 拒絕重複檔名、不符路徑、未宣告資產、不支援壓縮及不合理大小，沿用 SHA-256 完整性檢查 |
| 驗證大量共用父節點時重複複製子節點陣列 | 文件／分類／圖片庫版本圖改成陣列 push，避免此處二次成長 |
| 正式 HTML 未設 CSP | 建置加入 CSP：限制 script、connect、frame、worker 來源；禁用 object／base／表單提交，script 不開放 unsafe-inline 或 JavaScript unsafe-eval；PDF WASM 保留 wasm-unsafe-eval |
| 公開 repo 可能誤收執行產物／秘密 | 加強 ignore：環境檔、金鑰、runtime、依賴、dist、發布 ZIP 與測試產物不提交；公開內容另做檔案清單與敏感模式檢查 |
| Pages 子路徑使離線 PDF 資產失效 | `PDFNOTE_BASE_PATH` 統一 Vite、manifest、圖示及 PDF 字型／WASM URL；本機預設 `/` 保留 |

大小上限是處理界線，不是保證所有 150 MiB 檔案都能在手機順暢載入。格式仍為 1–4，本機 DB 仍為 6；超限資料明確拒絕／暫停同步，不刪除既有文件或遠端檔案。雲端快照是 append-only，長期達 10,000 筆後需另行規劃安全清理，不自動刪檔。

## 已確認的保護與限制

- React 以字串節點呈現文字，檢查範圍未發現 `dangerouslySetInnerHTML`／`innerHTML`／`eval` 等直接執行外部文字的入口。PDF 使用渲染及文字抽取，不接入 PDF JavaScript scripting manager。
- OAuth 只要求 `drive.appdata`；token 在記憶體，不保存於 IndexedDB、存檔、repo 或 CI。沒有新增 client secret、帳務、付費套件、追蹤服務。
- Drive／ZIP 使用 hash 檢查完整性，**不是簽章或加密**。攻擊者若能改整份快照和 hash，仍不能只靠 hash 確認作者身分。
- 本機 IndexedDB、原檔、`.pdfnote` 與 Drive 隱藏區未增加 App 端加密。公開的是程式碼與靜態網站，日常筆記不經 GitHub 上傳；使用者主動匯出／分享檔案仍含原始檔與可編輯歷史。
- GitHub Pages 同一 `light9999x.github.io` 下的各專案共用 origin；網站路徑不是 IndexedDB 安全隔離。若同帳號其他 Pages 網站不可信，應另用獨立 origin；本次沒有購買網域或改動其他網站。
- GitHub Pages 無法由 repo 設定完整回應安全標頭；本次 CSP 是 HTML meta，無法提供 `frame-ancestors`。未宣稱 clickjacking 防護或正式環境安全標頭已驗收。
- CSP 的 style 保留 unsafe-inline，因 React 動態樣式、PDF 文字層需要；Google Identity 官方 script 仍是外部信任來源。真正 OAuth/CSP 組合尚待登入實測。
- 複雜 PDF、超大圖片像素、極長版本歷史仍可能耗盡手機記憶體／阻塞主執行緒；尚未做 fuzzing、惡意樣本壓力測試或完整影像像素預檢。匯出 PDF 沿用原 PDF，**不是移除原檔所有主動內容的清洗器**。
- 本機服務綁定 127.0.0.1；停止介面需隨機 token，不清除網站資料、不依任意 PID 結束程序。此輪僅靜態審查，未啟動服務測試。

## 執行結果

| 檢查 | 結果 |
| --- | --- |
| `npm audit --json` | 2026-09-19 成功查詢 registry：0 項已知公告漏洞，514 依賴統計；包含開發依賴，不代表無未知漏洞 |
| `npm run check` | 通過 |
| `npm test` | 10 個檔案、190 個測試通過，包含 10 個新增安全邊界案例 |
| Pages 建置與 `verify-build.mjs /PDF-notes/` | 通過，PDF 資產、去背 worker、manifest、SW 及 CSP 靜態檢查通過 |
| 本機根路徑建置 | 通過，`verify-build.mjs /` 通過；本機 dist 已回復根路徑 |
| 敏感資料掃描 | 對候選原始碼／文件檢查常見私密金鑰、GitHub／Google／AWS token 模式，未發現符合項目；模擬測試 token 為明確假值 |
| GitHub 推送／Pages | 以倉庫 Actions 與下方手機測試文件的實際發布紀錄為準 |
| App／瀏覽器／真機／真實 Drive | 未啟動、未測；亦未執行 `test:e2e`、`test:server` |

GitHub Actions 在 main 的 App 變更時執行 npm ci、audit、check、test、build、靜態路徑驗證，再上傳 `app/dist` 部署。PR 只有建置測試；部署 job 才有 pages:write／id-token:write，checkout 不保留憑證。官方 Actions 固定 commit SHA，未加入第三方部署服務或 PAT secret。

## 查核參考

- [Google Identity CSP 設定](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid#content_security_policy)：Google 載入來源依官方允許清單。
- [GitHub Pages 說明](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)：此 repo 為公開倉庫，使用免費靜態 Pages 範圍。
- [GitHub Pages 自訂工作流程](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)：獨立 build／deploy、最小權限及 Pages artifact。
- [PDF.js API](https://mozilla.github.io/pdf.js/api/draft/module-pdfjsLib.html)：以目前安裝版本型別確認渲染資源介面。
