# Emoji Loading and Picker Architecture

This document describes how emoji data, assets, and the picker are loaded and cached to provide an instant, lag-free experience.

## Overview

The emoji system is designed so that:

1. **First visit**: Emoji data is built from source, cached to localStorage, and images are preloaded in the background.
2. **Return visits**: Data loads from localStorage immediately; images are preloaded when idle.
3. **Search**: Uses a prebuilt index for O(1) token lookup instead of iterating all emojis.
4. **Assets**: WebP format minimizes file size and load time.

## Data Flow

```
App Load
    │
    ├─► useEmojiData (sync at import)
    │       ├─► loadFromCache() ──► categories ready
    │       └─► OR buildCategories() ──► scheduleCacheWrite()
    │
    └─► requestIdleCallback (async)
            ├─► fetch emoji-search-index.json  # Prebuilt at build time
            ├─► setPrebuiltSearchIndex()       # Use prebuilt or fallback to runtime
            ├─► getEmojiSearchIndex()
            └─► preloadEmojiImages()           # Priority ~60, then idle batches
```

... (content preserved) ...
