import { useCallback, useEffect, useRef } from 'react';
import { getNavigationScrollOffset, hydrateNavigationState, setNavigationScrollOffset } from './navigationMemory.js';

export function useListScrollMemory(key, readyToken = 1) {
  const listRef = useRef(null);
  const navKey = String(key || '');

  useEffect(() => {
    let alive = true;
    hydrateNavigationState(navKey)
      .then((state) => {
        if (!alive) return;
        const offset = Number(state?.scrollY || 0);
        if (offset) setTimeout(() => listRef.current?.scrollToOffset?.({ offset, animated: false }), 45);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [navKey]);

  useEffect(() => {
    const offset = getNavigationScrollOffset(navKey);
    if (!offset || !readyToken) return undefined;
    const timer = setTimeout(() => listRef.current?.scrollToOffset?.({ offset, animated: false }), 45);
    return () => clearTimeout(timer);
  }, [navKey, readyToken]);

  const onScroll = useCallback(
    (event) => {
      setNavigationScrollOffset(navKey, event.nativeEvent.contentOffset.y);
    },
    [navKey]
  );

  return { listRef, onScroll };
}
