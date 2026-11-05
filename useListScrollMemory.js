import { useCallback, useEffect, useRef } from 'react';
import { getNavigationScrollOffset, hydrateNavigationState, setNavigationScrollOffset } from './navigationMemory.js';

// F06: FlatList has scrollToOffset; RN 0.74 SectionList exposes getScrollResponder.
// Never silently assume that the two virtualized list types share the same API.
export function restoreListScrollOffset(list, offset) {
  const y = Number(offset);
  if (!list || !Number.isFinite(y) || y <= 0) return false;
  if (typeof list.scrollToOffset === 'function') {
    list.scrollToOffset({ offset: y, animated: false });
    return true;
  }
  const scroll = list.getScrollResponder?.();
  if (typeof scroll?.scrollTo === 'function') {
    scroll.scrollTo({ x: 0, y, animated: false });
    return true;
  }
  if (typeof scroll?.scrollResponderScrollTo === 'function') {
    scroll.scrollResponderScrollTo({ x: 0, y, animated: false });
    return true;
  }
  return false;
}

export function useListScrollMemory(key, readyToken = 1) {
  const listRef = useRef(null);
  const navKey = String(key || '');

  useEffect(() => {
    if (!readyToken) return undefined;
    let alive = true;
    let timer = null;
    hydrateNavigationState(navKey).then((state) => {
      if (!alive) return;
      const offset = Number(state?.scrollY || 0);
      if (offset) timer = setTimeout(() => {
        if (alive) restoreListScrollOffset(listRef.current, offset);
      }, 45);
    }).catch(() => {});
    return () => { alive = false; if (timer) clearTimeout(timer); };
  }, [navKey, readyToken]);

  useEffect(() => {
    const offset = getNavigationScrollOffset(navKey);
    if (!offset || !readyToken) return undefined;
    const timer = setTimeout(() => restoreListScrollOffset(listRef.current, offset), 45);
    return () => clearTimeout(timer);
  }, [navKey, readyToken]);

  const onScroll = useCallback((event) => {
    setNavigationScrollOffset(navKey, event.nativeEvent.contentOffset.y);
  }, [navKey]);

  return { listRef, onScroll };
}
