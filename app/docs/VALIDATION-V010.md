# v010 檢查與待驗收（App 0.10.0）

日期：2026-09-23。依 [AGENTS.md](../../AGENTS.md)，本輪未啟動 App、開發／預覽服務、瀏覽器、E2E 或啟停整合測試。未 commit、push 或部署。線上站點不代表本輪版本。

## 已執行

- `npm run check`：通過；包含 src、單元測試和 E2E 型別檢查。
- `npm run test`：**253 項、14 個檔案通過**。原 210 項保留；未知格式拒絕改為 7，工具設定空槽 SSR 依 v010 修改。新增群組、幾何、事件協調、交易前 guard 與 page 工具案例。
- `git diff --check`：通過。
- `npm run build`：通過，保留 198 個 PDF 離線資產、去背 Worker 與 203 項 PWA 預快取。主 JS 約 1.270 MB，沿用超過 500 kB 的打包提示。
- `node scripts/verify-build.mjs /`：根路徑、manifest、CSP、service worker 靜態核對通過。
- `node scripts/release.mjs`：封裝為 `release/pdfnote-0.10.0-pwa.zip`；包含使用指南、prompt、設計與驗證文件。SHA-256 見 `release/SHA256SUMS.txt`。

## 證據與界線

| 項目 | 已有證據 | 尚未執行 |
| --- | --- | --- |
| 文件縮放 | zoom 上下限、兩指中心、頁縫選頁；事件替身驗證第二指取消、共同 transform 預覽、放開一次 zoom、剩餘指擋住及第三指／取消／失焦／capture 丟失。 | 真實 touch-action、visualViewport.scale、中心誤差、各渲染層對齊、Chrome 分頁／安裝 PWA |
| 單指與長按 | 讀頁單指捲動、500ms 物件選單、8px 取消、scroll／第二指／blur 取消、消耗 up/click、畫筆及表單優先。 | Android 原生 PDF 文字選取、長按選单位置、系統手勢、軟鍵盤、IME |
| 手機面板與工具列 | 重整單一 CSS 規則，手機 margin/cover=0；參數在側欄，page 單一 tool；腳本已準備尺寸比較。 | 320／360／412、600／601 斷點、橫直向、96～112px 頂部實測、放大字體、按鈕下方點擊 |
| 框內拖曳與鎖定 | 旋轉 frame 反矩陣命中、多物件空隙；touch 保持集合、明確清除後可重選；mouse 普通／Shift 規則。 | 真實控制點優先、透明圖片、框內其他物件、短按文字、工具切換後持續書寫 |
| 整體動畫 | dock 包住完整外殼與外側按鈕，關閉 inert/hidden、保留掛載、取消計時、reduce；舊 motion 回歸仍通過。 | **背景／邊界中途影格與錄影、快速反向、桌面 FLIP／錨點、最終一幀、真正渲染成本** |
| 群組編輯 | 建立／解除不改原內容；混合四類物件往返；群組联集、click／range／Shift、移動／resize／rotate／delete／layer 整批與反向復原。 | App 端真實手勢、實際 PDF 匯出畫面、保存失敗／重開／IndexedDB 8 升級 |
| 同步／會員 | 競爭群組、解除對移動、刪除／修改／重組對移動、並行解衝突；合併順序、全組封鎖、連通關係修復；封裝／副本／Drive 快照與格式拒絕。 | Google 授權、真實雙裝置同步／離線重連 |
| 交易邊界 | idb 交易介面替身驗證：任一成員換 head、額外會員主張但原 head 不變、修復集合失效，皆在任何 put 前 abort。 | **真實 IndexedDB 交易失敗回滾、配額與多分頁競態** |
| 回歸 | 原搜尋、文字、去背、圖層、原始檔、存檔資安與資料夾單元測試保留通過。 | 完整跨工具 E2E 與指定裝置操作 |

事件與交易測試使用替身，驗證路由、版本與呼叫順序，不是瀏覽器或實際儲存的通過證據。尤其動畫、原生觸控及 viewport 尺寸未經本輪量測，不能宣稱已在 Galaxy S24+ 修復或驗收完成。

## 準備但未執行

`e2e/v010.spec.ts` 準備手機展收尺寸／紙張位置／工具列高度、CDP 双指後文件大小與 viewport scale、80ms 面板外殼／按鈕中途位置檢查。舊 E2E 的頁面工具入口、外側按鈕占位與 inert 所屬節點已更新；這些僅經型別檢查，未執行，不等於所有舊互動腳本已驗收。

真機矩陣：Windows 11 25H2／i7-11800H、Galaxy S24+／Android 16；手機橫直向、320／360／412 CSS px、600／601、短高度、125%／150% 字體、DPR、safe area、軟鍵盤、PDF 四方向與混合尺寸。逐項記錄實際 CSS viewport，保存開始／中途／結束影格，檢查完整 prompt 第 11 節。實際手寫筆／防掌誤觸仍待測。

## 自行開啟與停止

專案根目錄 PowerShell：

```powershell
./app/start-pdfnote.ps1
./app/stop-pdfnote.ps1
```

在 `app/` 可用 `npm run preview`／`npm run stop`。先完成或取消草稿，確認「已存至本機」，再關閉 App 視窗／分頁並停止本機服務；離線 PWA 能顯示與服務監聽是兩件事。不清網站資料、不全面結束 Node。所有同步裝置更新至 0.10.0；format 6／IndexedDB 8 不降版。
