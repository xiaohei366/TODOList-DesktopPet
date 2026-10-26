import type { InteractiveRect } from '../../shared/types';

export const mouseInputSelector = '.todo-panel, .pet-anchor, .ui-resize-handle, .focus-panel, .usage-panel';

type ClosestTarget = {
  closest: (selector: string) => unknown;
};

export function shouldIgnoreWindowMouseEvents(target: EventTarget | null, inputCaptured: boolean): boolean {
  if (inputCaptured) {
    return false;
  }
  if (!hasClosest(target)) {
    return true;
  }
  return !target.closest(mouseInputSelector);
}

function hasClosest(target: EventTarget | null): target is EventTarget & ClosestTarget {
  return Boolean(target && typeof (target as { closest?: unknown }).closest === 'function');
}

type RectSource = {
  querySelectorAll(selector: string): NodeListOf<Element>;
};

type PetAnchorSource = {
  querySelector(selector: string): Element | null;
};

export function collectInteractiveRects(root: RectSource): InteractiveRect[] {
  const rects: InteractiveRect[] = [];
  for (const element of root.querySelectorAll(mouseInputSelector)) {
    const rect = element.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      rects.push({ x: rect.left, y: rect.top, width: rect.width, height: rect.height });
    }
  }
  return rects;
}

export function collectPetRect(root: PetAnchorSource): InteractiveRect | null {
  const element = root.querySelector('.pet-anchor');
  if (!element) {
    return null;
  }
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    return null;
  }
  return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
}

type RectReportingEvent = 'resize' | 'scroll' | 'transitionend' | 'animationend';

/** Report geometry when layout changes, coalescing events and skipping unchanged rects. */
export function startInteractiveRectReporting(
  report: (rects: InteractiveRect[], petRect: InteractiveRect | null) => void,
  deps: {
    document: Document;
    requestAnimationFrame: (handler: () => void) => number;
    cancelAnimationFrame: (frame: number) => void;
    createResizeObserver: (handler: () => void) => Pick<ResizeObserver, 'observe' | 'unobserve' | 'disconnect'>;
    createMutationObserver: (handler: (records: MutationRecord[]) => void) => Pick<MutationObserver, 'observe' | 'disconnect'>;
    addEventListener: (type: RectReportingEvent, handler: () => void) => void;
    removeEventListener: (type: RectReportingEvent, handler: () => void) => void;
  }
): { stop: () => void; setVisible: (visible: boolean) => void } {
  let disposed = false;
  let nativeVisible = true;
  let observingVisible: boolean | undefined;
  const isVisible = (): boolean => nativeVisible && !deps.document.hidden;
  let frame: number | undefined;
  let lastGeometry: string | undefined;
  const observed = new Set<Element>();
  const events: RectReportingEvent[] = ['resize', 'scroll', 'transitionend', 'animationend'];

  const publish = (): void => {
    const elements = new Set(deps.document.querySelectorAll(mouseInputSelector));
    for (const element of observed) {
      if (!elements.has(element)) {
        resizeObserver.unobserve(element);
        observed.delete(element);
      }
    }
    for (const element of elements) {
      if (!observed.has(element)) {
        resizeObserver.observe(element);
        observed.add(element);
      }
    }
    const rects = collectInteractiveRects(deps.document);
    const petRect = collectPetRect(deps.document);
    const geometry = JSON.stringify([rects, petRect]);
    if (geometry !== lastGeometry) {
      lastGeometry = geometry;
      report(rects, petRect);
    }
  };

  const schedule = (): void => {
    if (disposed || !isVisible() || frame !== undefined) {
      return;
    }
    frame = deps.requestAnimationFrame(() => {
      frame = undefined;
      if (!disposed && isVisible()) {
        publish();
      }
    });
  };
  const resizeObserver = deps.createResizeObserver(schedule);
  const mutationObserver = deps.createMutationObserver((records) => {
    // Sprite frames and celebration particles do not change the hit-test regions.
    if (records.some((record) => !hasClosest(record.target) || !record.target.closest('.pet-sprite, .celebration-burst'))) {
      schedule();
    }
  });
  const disconnect = (): void => {
    if (frame !== undefined) {
      deps.cancelAnimationFrame(frame);
      frame = undefined;
    }
    resizeObserver.disconnect();
    observed.clear();
    mutationObserver.disconnect();
  };
  const updateVisibility = (): void => {
    const visible = isVisible();
    if (disposed || observingVisible === visible) return;
    observingVisible = visible;
    disconnect();
    lastGeometry = undefined;
    if (!visible) {
      report([], null);
    } else {
      mutationObserver.observe(deps.document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class', 'style', 'hidden']
      });
      publish();
    }
  };
  for (const event of events) deps.addEventListener(event, schedule);
  deps.document.addEventListener('visibilitychange', updateVisibility);
  updateVisibility();

  return {
    setVisible: (visible) => { nativeVisible = visible; updateVisibility(); },
    stop: () => {
      disposed = true;
      disconnect();
      for (const event of events) deps.removeEventListener(event, schedule);
      deps.document.removeEventListener('visibilitychange', updateVisibility);
    }
  };
}
