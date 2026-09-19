# v003／App 0.3.0 設計與相容策略

## 擦除與因果保護

橡皮擦採整筆刪除，包含 pen／highlight，不含文字、圖片及 PDF。以 PDF point 定義直徑 2–200（預設 24），工具大小保存在本機 settings，與畫筆粗細分開。

每次 pointer move／up，將前後 CSS 指標位置形成線段，分別裁切到每個頁面的矩形，經該頁 CropBox／旋轉／縮放矩陣的反矩陣轉成固定 PDF 座標。掃掠線段與筆跡每段的最短距離 <= 橡皮擦半徑 + 筆跡半寬即命中，涵蓋端點、單點、重疊與快速移動。DPR 只影響底圖取樣，不改指標座標。頁間空隙不命中。

按下至放開只預覽待刪除集合；同物件僅收集一次。放開後全部 tombstone 與資產／文件在一個 IndexedDB 交易提交，成功才增加一組 undo。取消、Escape、工具切換、失焦、遺失 pointer capture 會放棄尚未提交的整組；失敗恢復原畫面並提供救援存檔。任何候選衝突物件略過並提示。

每組 history 保留每個物件的 before／after 及觀察到的 head。App 排隊前讀取最新文件，交易內再檢查 expected heads；任何成員收到未見版本即整組拒絕，不部分復原、不覆蓋遠端新版本。所有刪除沿用既有可同步操作圖，不刪歷史。

## 文字排字與旋轉

Annotation 增加 `writingMode?: horizontal-tb | vertical-rl`、`angle?: number`。缺欄位只在读取時預設水平／0°，不替舊操作補欄位。方向及角度是兩個獨立屬性，旋轉中心為 `(x+width/2,y+height/2)`，寬高保持旋轉前尺寸。

SVG 與 Canvas 使用 `textLayout()` 的相同字元／文字行位置、字型、alphabetic baseline、局部矩形裁切及中心旋轉。直排每個 Unicode code point 正立一格，中文、Latin、數字、標點不旋轉或合字；字格和欄距皆 1.35 × 字級，右到左換欄，換行直接另起一欄，超框裁切。水平以 Canvas 字寬測量換行。未提供完整的專業直排標點及 grapheme shaping；同裝置編輯／匯出一致，跨裝置未嵌統一中文字型。

選取以逆旋轉後的局部矩形命中；框與旋轉手把使用相同 transform；移動不改角度，屬性寬高調整局部框，角度可輸入任意有限數並正規化至一圈，另有重設與控制點。共用 Canvas paint 同時供衝突預覽與 PDF 透明註記層匯出，游標與選取框不在 paint。

## 文件庫階層

三類独立因果暫存器：`folder:<id>` 名稱／刪除；`parent:<folderId>` 父層 `{parentId}`；`member:<docId>` 文件歸屬 `{folderId}`。舊資料夾無 parent 操作即根層。名稱與搬移不互相覆蓋；同層不接受本機重名，跨層允許，同名跨裝置建立則保留並提示。

拖曳使用 HTML 原生 drag threshold；有效目標高亮，非法目標顯示原因。原地／取消／空白區不產生操作；後續真實 pointer down 會解除拖曳尾端 click 抑制。保留文件／資料夾選單移動供手機及鍵盤使用。目的地与非空刪除條件在 IndexedDB 交易再檢查，子資料夾（含父層衝突候選）也算非空。

同步後不刪除形成循環的操作。`folderParent()` 偵測 parent 多 head、父層刪除／遺失／名稱衝突及循環；有問題時衍生顯示位置為根層。迭代式樹遍歷有 visited 集合，保留所有存活節點。衝突頁可選 parent 候選或產生移回根層的解決操作；新遠端分支仍會重新成為衝突。`.pdfnote` 不帶文件庫樹，匯入副本沿用目前分類，合併保留既有分類。

## 連續閱讀與本機偏好

`Editor` 讀取每頁真正尺寸、CropBox、原始旋轉，建立固定尺寸佔位；`ReaderPage` 用距離捲動區 700 CSS px 的 IntersectionObserver 按需建立 Canvas／TextLayer／SVG。遠頁卸載、取消 render／text task 並 cleanup；正在操作、文字輸入或選取頁固定保留。讀取各頁尺寸需要 PDF metadata，但不把全文件預先點陣化。

直列為預設，橫列按頁碼從左到右，均不改 PDF。各頁 SVG 使用獨立矩陣。畫筆 pointer capture 留在起始頁，越界位置裁在該頁邊緣；擦除掃掠可跨頁；工具列圖片用當下主要可見頁，點文字用實際點擊頁。

依可見面積最大者更新作用頁。頁碼／搜尋／上一頁下一頁用捲動定位。水平滾輪優先使用 deltaX，沒有時用 deltaY，處理 deltaMode，Ctrl／Cmd 不攔截；listener 僅在閱讀捲動區。

`position:<docId>` 記住 page／zoom／rotation／layout 及頁內相對 x/y，屬本機 settings，不同步。舊 scrollTop 依實際目標頁高度與容器 padding 轉成相對位置。切換展示／縮放／旋轉保留頁內錨點。30 頁混合尺寸自動化測試覆蓋按需渲染，超大型檔案仍需目標實機量測。

## 格式與升級界線

- 本機 DB 名称仍為 `pdfnote-v1`，版本從 3 升至 4；不清除任何 store，舊 v2 也可遷移。4 阻止原版舊程式用 version 3 重新開啟已升級的本機 DB；既有頁面收到 versionchange 會關閉連線。
- 文件可讀 format 1／2，含文字新屬性的**新操作**會提升文件為 2，合併取雙方較高已支援版本。所有既有操作 ID 與內容保留。format 1 不允許暗帶新文字欄位；不接受未來版本、非法方向或非有限角度。
- Library 可讀 format 1／2，加入 parent 操作才提升為 2；format 1 不允許 parent。舊客戶端會拒絕 format 2 的遠端快照／存檔，應先升級雙端再繼續同步，不能回降舊版本。
- Drive 應用標識仍為 `pdfnote-v1`、`appDataFolder`，不換雲端資料位置；資產與快照仍不可變、hash 驗證、冪等合併。

## 目錄分離

根目錄只保留入口 README、.gitignore、prompts 與原有工作區設定；App 程式、文件、lockfile、依賴、快取、建置、歷次發布與測試產物均搬至 app/。搬前檢查程序與 4173 監聽；WMI 程序命令列查詢權限不足，改讀 Get-Process／netstat，沒有終止其他 Node 程序。逐一檢查解析路徑位於工作區後 Move-Item，未遞迴刪除資料。

Vite base `/`、`http://127.0.0.1:4173/`、OAuth origin、IndexedDB 名稱不變；preview 加 strictPort 避免占用時偷偷切換 origin。啟動 PowerShell 依 `$PSScriptRoot`，release 從 ../prompts 讀取規劃，ZIP 內文件連結另依部署根目錄調整。
