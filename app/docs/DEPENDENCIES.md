# 元件、授權及選型依據

查核日期：2026-09-18。實際可重現版本以 `package-lock.json` 為準；交付 ZIP 含依賴授權文字。

| 主要元件 | 授權 | 用途／狀態 |
|---|---|---|
| React／React DOM | MIT | 共用跨尺寸互動介面 |
| TypeScript | Apache-2.0 | 靜態型別檢查 |
| Vite | MIT | 正式建置與本機開發 |
| PDF.js / pdfjs-dist | Apache-2.0 | 維護中的官方 PDF.js；使用目前 npm 6.3.289，適配 loadingTask.destroy API |
| pdf-lib | MIT | 離線圖片轉 PDF、透明圖層寫入；1.17.1 發行較舊，限制用途並以實際匯出測試驗證，不宣稱近期頻繁維護 |
| fflate | MIT | ZIP 可攜存檔 |
| idb | ISC | IndexedDB 交易 |
| Lucide | ISC | 程式內圖示 |
| vite-plugin-pwa／Workbox | MIT | 可安裝 manifest 與離線快取 |
| Playwright／Vitest | Apache-2.0／MIT | Windows 瀏覽器端到端與核心單元測試 |

PWA 的安裝取決於 Windows／Android 的瀏覽器與安全來源；此專案不購買商店上架帳戶或要求付費簽章。

官方來源：

- [PDF.js 專案與授權](https://github.com/mozilla/pdf.js)
- [PDF.js 畫布與 viewport 座標](https://mozilla.github.io/pdf.js/examples/)
- [PDF.js API](https://mozilla.github.io/pdf.js/api/)
- [pdf-lib 官方文件](https://pdf-lib.js.org/)
- [fflate 官方專案](https://github.com/101arrowz/fflate)
- [PWA 平台與離線能力](https://web.dev/learn/pwa/progressive-web-apps)
- [PWA 安裝](https://web.dev/learn/pwa/installation)
- [Google Drive 隱藏資料區](https://developers.google.com/workspace/drive/api/guides/appdata)
- [Google Drive 額度與費用](https://developers.google.com/workspace/drive/api/guides/limits)

Google Drive 採使用者自己的免費空間與未啟用付費帳務的專案，額度不足暫停；不將「一般使用無額外費用」誇大為永久無上限免費。
