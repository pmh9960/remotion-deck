import { useEffect, useRef, useState } from "react";

/** Track an element's content box size (for fitting the 1920×1080 stage). */
export const useSize = () => {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, size };
};
