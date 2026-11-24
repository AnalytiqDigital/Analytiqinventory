import { useEffect, useState } from 'react';

const DESKTOP_MIN_WIDTH = 1280;
const TABLET_MIN_WIDTH = 640;

/** One viewport-sized page of tiles: 4×5 on a till, 3×4 on a tablet, 2×3 on a phone. */
function pageSizeFor(width: number): number {
  if (width >= DESKTOP_MIN_WIDTH) return 20;
  if (width >= TABLET_MIN_WIDTH) return 12;
  return 6;
}

export function usePosPageSize(): number {
  const [pageSize, setPageSize] = useState(() =>
    typeof window === 'undefined' ? 20 : pageSizeFor(window.innerWidth)
  );

  useEffect(() => {
    const onResize = (): void => setPageSize(pageSizeFor(window.innerWidth));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return pageSize;
}
