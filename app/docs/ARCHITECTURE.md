# 核心規劃 v001：需求、決策與架構

版本註記：原「第七版」指核心規劃的第七次歷史修訂，該完整規劃檔現統一編為 [v001](../../prompts/v001_核心功能規劃與開發Prompt.md)。本次僅調整文件版本名稱。

## 已確認與實作選擇

已確認：Windows 11 25H2／Android 16 可安裝、完全離線本機功能、四類獨立物件、原始檔不改寫、單一 `.pdfnote`、合併 PDF、Google Drive appDataFolder、衝突保留並由使用者擇一、免費限制。

開發選擇：React + TypeScript + Vite 的可安裝 PWA；PDF.js 閱讀與選字；pdf-lib 圖片轉 PDF 及分享 PDF；IndexedDB 保存；fflate ZIP 容器。這些是實作決策，不擴充成使用者曾要求的技術。

未採付費 PDF SDK、伺服器转檔或付費中介同步。未納入 OCR、AI、知識庫與其他雲端供應商。Word 轉換按授權延後。未假設 Android 之外的手機或更舊系統已支援。

## 模組

- `src/core/model.ts`：資料型別、因果版本圖、合併、刪除與衝突；不依賴 UI 或時鐘先後。
- `archive.ts`：ZIP 封裝、大小限制、格式及完整性驗證。
- `storage.ts`：IndexedDB 原子交易與合併保存。
- `pdf.ts`：PDF 匯入驗證、保留原始資產、PNG／JPG 本機轉 PDF。
- `geometry.ts`：CropBox、旋轉、縮放與註記座標轉換。
- `render.ts`：與畫面共用文字換行，將註記扁平化加入原 PDF。
- `drive.ts`：GIS 登入、隱藏區檔案傳輸、資產雜湊、追加快照、冪等重試。
- `Editor.tsx`：真實 PDF 畫布／文字層、四類工具、屬性編輯、復原重做。
- `Conflicts.tsx`：全文件衝突列表、候選版本預覽及明確擇一。

## 座標

註記使用未旋轉 CropBox 左上角為原點，單位為 PDF point、Y 朝下。`pageMatrix()` 將座標轉至 PDF.js viewport；指標透過反矩陣換回儲存座標。旋轉與縮放不改動註記本身。PDF 匯出在未旋轉的裁切區生成透明覆蓋圖層，放回原頁面 CropBox 座標，由 PDF 的原始旋轉屬性控制顯示。

## `.pdfnote` v1

ZIP 包含：

```text
manifest.json
assets/<sha256>
assets/<sha256>
...
```

manifest 包含格式版本、文件 UUID、來源名稱、來源資產 hash、固定 PDF hash、頁數、建立時間、完整 operations 與資產 MIME／大小清單。二進位資產均在檔案內；不含裝置路徑、雲端 URL 或權杖。

每個操作包含 `id, objectId, device, time, parents[], value`。文字、筆跡、螢光筆與圖片的 `value` 保留全部編輯資料；null 表示刪除版本。特殊物件 `$document` 管理名稱和文件刪除狀態。操作 ID 及物件 ID 為 UUID；副本僅重新配置文件 UUID，物件圖依文件命名空間隔離，因此保留原衝突和版本歷史而不影響原文件。

## 合併規則

1. 相同文件 ID、原始檔 hash、PDF hash 與頁數才允許合併。
2. 操作以 ID 做集合聯集；相同 ID 內容不一致時拒絕，避免悄悄覆寫。
3. 一個物件所有操作中，未被其他操作列為 parent 的葉節點即候選 head。
4. 一個 head 是確定版本；多個 head 是衝突。刪除也可成為候選版本。
5. 解決操作以**使用者看見的所有候選 head**作為 parents，value 為所選版本。
6. 未被解決操作涵蓋的新分支，或兩台裝置並行解決，仍會產生多 head，再次要求選擇。
7. 不丟棄歷史 tombstone。舊存檔或長期離線裝置無法單靠重送舊 head 讓物件復活。
8. 時間只顯示給使用者，不用於取勝。排列順序使用穩定物件 ID；暫無自行調整圖層顺序介面。

ZIP／遠端輸入會驗證 hash、資產大小、頁碼、型別、數值、parents 的存在與同物件關係、重複 ID、因果循環及格式版本。拒絕 ZIP 非允許路徑，不解壓到本機任意路徑；總解壓大小限制 150 MB。CRC 並非完整性依據，使用 SHA-256 驗證資產。

## 同步協定

Drive 只建立不可變資產檔與快照檔，`appProperties.app=pdfnote-v1`，`parents=['appDataFolder']`。檔名包含內容 hash，不使用更新同一共享檔案的覆寫策略。

同步先列出雲端檔案，下載未見快照和缺少資產，完整性與因果圖驗證通過才以本機交易合併。再上傳本機尚缺於雲端的資產，最後發布完整版本圖快照。快照內没有二進位重複副本，但保留完整 operations 以便獨立驗證。不同裝置同時發布都能被後續列舉發現；網路重試可能新增同 hash 遠端檔，但本機操作聯集冪等。

不以衝突解決作為同步前提。資產未完整不提交快照或回報完成。429／403／網路中斷採延後重試；對已上傳的狀態記錄精確內容 hash。尚無遠端垃圾回收、長期 token refresh 或背景系統排程。快照紀錄隨時間增加，需後續效能與儲存維護設計。

## 安全與授權

本機資料存在瀏覽器 origin 的 IndexedDB；不嵌入帳密、不含第三方追蹤、PDF 腳本不執行。GIS 僅在設定頁需要登入時載入。PDF engine 與資產皆隨安裝包本機提供。Google transport 使用 HTTPS／Bearer token；本機檔案與 Drive 隱藏區未增加 App 端加密。私人筆記不當成測試樣本上傳。

## v002 擴充（App 0.2.0）

分類同步與空白文件沿用上述基底，新增 `core/library.ts`、`core/blank.ts`、`LibraryPanel.tsx`、`LibraryConflicts.tsx`。完整設計與相容策略見 [V002-DESIGN.md](V002-DESIGN.md)。

IndexedDB 版本 3 新增 library store；文件、資產、分類建立在同一交易提交。空白文件以最初生成的 PDF 同時作為來源與閱讀基底，附可選 `origin:'blank'` 描述。`.pdfnote` 維持 format 1，分類不寫入單份存檔。

Drive 的 `type=library` 快照與原本 asset／snapshot 分開，仍保留不可變、hash 檢查與完整因果圖驗證。資料夾刪除與離線移入競爭時，文件出現在未分類並提示；所有管理候選版本可在獨立區域選擇。文件名稱與歸屬在不同版本圖，避免彼此覆蓋。

## v003 擴充（App 0.3.0）

新增 `ReaderPage.tsx` 連續頁面與按需渲染；range eraser 掃掠、批次原子保存與整組 history；文字方向／中心旋轉共用排版；資料夾 parent 因果暫存器與循環回退。詳見 [V003-DESIGN.md](V003-DESIGN.md)。本文件前段 v1／資料庫 3 為歷史基線，目前資料庫為 4，文件及管理格式可讀 1／2。


## v006 擴充（App 0.6.0）

文件 format 3 加入圖片庫 `gallery` 聯集會員及四類物件 angle 語意，format 1／2 可讀；IndexedDB 升至 5 保留原 stores，阻止版本 4 舊程式忽略新資料。選取改實際相交，變換共用矩陣與批次 expected heads；新文字方向依可見頁面補償，原位草稿不進歷史直到提交。搜尋字元映射與 DOM Range 標記只在 UI。完整相容、操作和面板設計見 [V006-DESIGN.md](V006-DESIGN.md)。
