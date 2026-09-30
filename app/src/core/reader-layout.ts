// React owns the responsive branch; CSS consumes the same data attributes.
// Coarse-pointer short landscape phones remain compact above 600px, while a
// full-height touch laptop does not become a phone solely because it has touch.
export const COMPACT_READER_QUERY='(max-width: 600px), (max-width: 1100px) and (max-height: 500px) and (pointer: coarse)';
export const LANDSCAPE_QUERY='(orientation: landscape)';
export const PAGE_GAP={compact:8,desktop:12};
