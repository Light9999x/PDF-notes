# 手機測試：Galaxy S24+／Android 16

App 0.8.1 是既有 0.8.0 的資安與部署修補；v009 前五項 UI 尚未實作。本次交付可安裝 **PWA**，不是 APK，也未上架 Google Play。

- 原始碼：[Light9999x/PDF-notes](https://github.com/Light9999x/PDF-notes)
- 手機測試網址：[頁間 PDFnote](https://light9999x.github.io/PDF-notes/)
- 部署紀錄：[GitHub Actions](https://github.com/Light9999x/PDF-notes/actions/workflows/pages.yml)
- 發布狀態：2026-09-19 已成功部署 App 0.8.1；[工作流程 35436181729](https://github.com/Light9999x/PDF-notes/actions/runs/35436181729) 的 build／deploy 皆成功。發布程式 commit：`618f9a98e0013e002b43bf5dc168f54df1a4d25f`。
- HTTP 已確認：首頁、App JS（含 v0.8.1）、Service Worker、安裝圖示、去背 worker、抽樣 CMap／標準字型／WASM 皆 200；manifest scope／start_url 均為 `/PDF-notes/`，PDF 資源清單共 198 筆。這是部署檢查，未開啟 App 或執行手機操作。

## 開始測試

1. 在手機 Chrome 開啟上方 HTTPS 網址。第一次需要網路，等待離線資源下載完成。
2. Chrome 選單選「安裝應用程式」／「加到主畫面」（名稱依瀏覽器版本）。之後可從主畫面開啟；沒有安裝入口時先在瀏覽器使用並記錄現象。
3. 先新建一份測試用直式／橫式空白文件，畫筆、螢光筆、文字、圖片各新增一項，確認顯示「已存至本機」。
4. 確認離線可用後開飛航模式，關閉再重開 PWA，檢查 PDF 字型、既有內容、繪製與保存。重新連網後再進行同步測試。
5. 從原本電腦本機版匯出 `.pdfnote`，透過自己的傳輸方式放到手機後匯入。**localhost 和 GitHub Pages 是不同 origin，不會自動共用本機筆記。** 不用清除任一端網站資料。
6. 匯出 `.pdfnote` 後重新匯入，檢查「建立副本／合併」；另匯出 PDF 檢查方向及內容。用小型測試文件先驗收，再使用重要資料。

無需開啟 Windows 本機服務供手機連線。首次安裝／更新／Google 登入／跨端同步需要網路；下載好資源後的本機編輯可離線。

## 待驗收矩陣（本次未代為在手機執行）

| 測試 | 需確認 |
| --- | --- |
| 安裝及離線 | 可安裝、完全關閉後離線重開、PDF 中文字型／圖片／去背 worker 可用 |
| 橫直向 | 文字不溢出，工具列等高，左側面板開合後閱讀位置合理 |
| 觸控 | 手指畫筆／螢光筆、橡皮擦範圍、多選框、拖移／縮放／旋轉，長按拉直 |
| 原位文字 | 中文輸入法、0°字底朝下、單選編輯、鍵盤出現後工具與文字框可見 |
| 圖片 | 匯入／圖庫重用、0°方向、去背副本、刪除素材保留頁面實例 |
| 閱讀與搜尋 | 垂直／水平捲動、適合寬度／整頁、搜尋命中高光及定位 |
| 存檔與更新 | 重開保留資料；匯出含可編輯物件；遇到更新提示先保存，再更新；不清網站資料 |
| Drive | 授權、兩端離線各自新增、恢復同步後全保留；同物件並行修改可逐版解衝突 |

目前沒有觸控筆，筆壓與專用手寫筆相容性不列為已測。記錄問題時提供 App 版本、瀏覽器版本、橫直向、重現步驟及測試檔；不要公開自己的筆記或 token。

## Google Drive 的必要設定

部署不會自動建立 Google Cloud OAuth client。依 [同步設定](../GOOGLE_DRIVE_SETUP.md) 使用自己的免費專案，網頁用戶端的 Authorized JavaScript origins 加入：

```text
https://light9999x.github.io
```

**來源不包含 `/PDF-notes/` 路徑。** 如要讓原本 Windows localhost 與手機同步，同一 client 也保留 `http://127.0.0.1:4173`。同一 Google Cloud 專案、同一使用者、僅 `drive.appdata`；App 只填公開 client ID，沒有 client secret。尚未完成真實 OAuth 及雙端同步驗收。

## 開發者建置與本機指令

在根目錄 PowerShell：

```powershell
cd app
$env:PDFNOTE_BASE_PATH='/PDF-notes/'
npm run build
node scripts/verify-build.mjs /PDF-notes/
Remove-Item Env:PDFNOTE_BASE_PATH
# 回復本機根路徑產物
npm run build
node scripts/verify-build.mjs /
```

日常本機開啟／停止仍在根目錄執行 `./app/start-pdfnote.ps1`、`./app/stop-pdfnote.ps1`。建置與檢查不啟動服務；代理未自動開啟 App 或瀏覽器。
