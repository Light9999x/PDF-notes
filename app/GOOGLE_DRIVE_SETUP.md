# Google Drive 同步設定

目前尚未提供本 App 的 OAuth client ID，程式不附帶他人的 Google 專案或測試權杖。以下是必要設定，不是額外付費需求。

1. 在 Google Cloud Console 建立或使用自己的免費專案。不啟用付費帳務、不申請付費額度、不購買任何服務。
2. 啟用 Google Drive API。
3. 設定 OAuth 同意畫面，加入自己為測試使用者（如果應用程式仍在測試狀態）。僅要求 `https://www.googleapis.com/auth/drive.appdata`。
4. 建立「網頁應用程式」OAuth client。開發來源加入 `http://127.0.0.1:4173`（如果使用 localhost，另加入該來源）。正式 Android 安裝需加入自己的 HTTPS 網站來源。
5. Windows／Android 使用同一 Google Cloud 專案和同一 Google 使用者，才能存取同一個 App 隱藏資料區。
6. 將以 `.apps.googleusercontent.com` 結尾的 client ID 填入 App「同步與設定 → 進階連線設定」。這是公開用戶端識別碼，**不需要 client secret，請勿在前端或對話提供 secret**。
7. 點「連結 Google Drive」，由 Google 畫面登入及授權。App 收到權杖後即開始同步。

GitHub Pages 手機測試版請加入 Authorized JavaScript origin `https://light9999x.github.io`（不含 `/PDF-notes/`）。Windows 本機與手機若要同步，保留本機來源並使用同一 Google Cloud 專案、帳號。部署不會代建 OAuth client；詳見 [手機測試說明](docs/MOBILE-TESTING.md)。

## 實際行為

- 只使用 `appDataFolder`，不建立一般可見資料夾。
- App 0.2.0 也同步資料夾與文件歸屬，使用獨立的 library 版本快照；不是在 Drive 建立可見資料夾。兩端都需更新才能操作分類。並行改名／移動由衝突頁的「分類管理衝突」處理。
- 資產以 SHA-256 識別，先上傳完整資產，再發布包含因果版本圖的不可變快照。
- 同步失敗會保留本機資料；恢復網路或授權後可重試。
- 401 需要重新連結；403／429 提示權限、容量或額度問題。重試間隔逐步延長，最多 5 分鐘。
- token 僅存記憶體，不存 localStorage、IndexedDB 或 `.pdfnote`；重新啟動／到期後需再次連結。
- 選擇「中斷連結」只清除本次 token，並不刪除 Google 資料或撤銷帳號的既有授權。Google 帳號設定可另行撤銷存取權。
- 登入 JavaScript 只在開啟同步設定時從 Google 載入；未連網時無法登入，但本機功能照常使用。
- Google Workspace 管理者、測試使用者、OAuth 來源或組織政策可能阻止授權；錯誤需由 Console 設定排查。

## 免費範圍查核（2026-09-18）

Google 官方說明一般 Drive API 使用仍無額外費用，但 2026-05-01 起專案額度規則已更新，並預告 2026 年稍後超額計費變更；不能宣稱永久無上限免費。此 App 不包含開通帳務或升級功能。使用者應保持專案不連結付費帳務，依自己帳戶的免費儲存空間與額度使用，額度不足先暫停同步。

此 App 的本機限速與失敗重試不能替代 Google 專案層的帳務設定，無法保證一個已啟用付費帳務、另有其他 API 用量的專案不產生費用。

## 官方依據

- [Google Drive appDataFolder 與 scope](https://developers.google.com/workspace/drive/api/guides/appdata)
- [Google Identity Services token model](https://developers.google.com/identity/oauth2/web/guides/use-token-model)
- [Drive API 額度與費用](https://developers.google.com/workspace/drive/api/guides/limits)

## 雙端驗收操作

1. Windows 匯入 PDF，連結同步；Android 同一帳號連結後下載該文件。
2. 兩端斷網：Windows 新增兩筆畫筆，Android 新增文字與圖片。
3. 恢復連網，在授權仍有效時等待自動同步；兩端應各有四個物件。
4. 再斷網，同時修改同一文字物件；恢復連線後檢查衝突頁的兩個候選版本。
5. 離線選擇一版，再同步，另一端應得到相同結果。
6. 另測同一物件並行修改／刪除，以及兩端各自選擇不同版本後重新衝突。
7. 測試授權到期、網路中斷、Google 容量不足，確認本機筆記與待同步紀錄保留。

沒有完成這些真實帳號測試前，不標記「Google 雙端同步已驗收」。

## v003 升級及目錄位置

設定說明現在位於 `app/GOOGLE_DRIVE_SETUP.md`，部署來源為 `app/dist/` 的內容；磁碟目錄不是網站 `/app/` 路徑。原 `http://127.0.0.1:4173` origin 與 OAuth 設定保持不變。兩端先升至 App 0.3.0，再使用 format 2 的直排／旋轉文字與父子資料夾同步。額外人工驗收：跨端文字方向／角度及匯出、雙端交叉搬移形成資料夾循環與解決、整組擦除後離線重新同步。
