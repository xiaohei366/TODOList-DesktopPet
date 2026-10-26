import { createRequire } from 'node:module';
import { describe, expect, test, vi } from 'vitest';
import {
  collectInteractiveRects,
  collectPetRect,
  mouseInputSelector,
  shouldIgnoreWindowMouseEvents,
  startInteractiveRectReporting
} from '../src/renderer/src/mousePassthrough';

function makeTarget(matched: boolean): EventTarget {
  return {
    closest: (selector: string) => (selector === mouseInputSelector && matched ? {} : null)
  } as unknown as EventTarget;
}

describe('mouse passthrough hit testing', () => {
  test('passes clicks through the transparent window background', () => {
    expect(shouldIgnoreWindowMouseEvents(null, false)).toBe(true);
    expect(shouldIgnoreWindowMouseEvents({} as EventTarget, false)).toBe(true);
    expect(shouldIgnoreWindowMouseEvents(makeTarget(false), false)).toBe(true);
  });

  test('keeps mouse input for pet, TODO panel, and resize handle regions', () => {
    expect(mouseInputSelector).toContain('.todo-panel');
    expect(mouseInputSelector).toContain('.pet-anchor');
    expect(mouseInputSelector).toContain('.ui-resize-handle');
    expect(shouldIgnoreWindowMouseEvents(makeTarget(true), false)).toBe(false);
  });

  test('keeps mouse input while an interaction is captured', () => {
    expect(shouldIgnoreWindowMouseEvents(makeTarget(false), true)).toBe(false);
  });
});

const { JSDOM } = createRequire(import.meta.url)('jsdom');

function domWithElements(
  elements: Array<{ className: string; rect: { x: number; y: number; width: number; height: number } }>
) {
  const dom = new JSDOM('<div id="root"></div>', { pretendToBeVisual: true, url: 'https://tolist.test/' });
  const { document } = dom.window;
  for (const { className, rect } of elements) {
    const element = document.createElement('div');
    element.className = className;
    element.getBoundingClientRect = () =>
      ({
        left: rect.x,
        top: rect.y,
        right: rect.x + rect.width,
        bottom: rect.y + rect.height,
        ...rect
      }) as DOMRect;
    document.getElementById('root')!.appendChild(element);
  }
  return document;
}

describe('interactive rect reporting', () => {
  test('collects visible interactive element rects and skips hidden ones', () => {
    const document = domWithElements([
      { className: 'pet-anchor', rect: { x: 10, y: 20, width: 120, height: 96 } },
      { className: 'todo-panel', rect: { x: 30, y: 40, width: 400, height: 500 } },
      { className: 'todo-panel hidden', rect: { x: 0, y: 0, width: 0, height: 0 } },
      { className: 'usage-panel', rect: { x: 0, y: 0, width: 0, height: 0 } },
      { className: 'plain-div', rect: { x: 0, y: 0, width: 50, height: 50 } }
    ]);

    expect(collectInteractiveRects(document)).toEqual([
      { x: 10, y: 20, width: 120, height: 96 },
      { x: 30, y: 40, width: 400, height: 500 }
    ]);
  });

  test('coalesces layout events and sends only changed geometry', () => {
    const probe = startReportingProbe();
    expect(probe.report).toHaveBeenCalledTimes(1);
    probe.events.resize();
    probe.events.scroll();
    expect(probe.frames.size).toBe(1);
    probe.flush();
    expect(probe.report).toHaveBeenCalledTimes(1);

    probe.rect.y = 24;
    probe.onResize();
    probe.flush();
    expect(probe.report).toHaveBeenCalledTimes(2);
    expect(probe.report.mock.lastCall?.[1]).toEqual({ x: 0, y: 24, width: 64, height: 64 });
    probe.stop();
    expect(probe.resizeObserver.disconnect).toHaveBeenCalled();
    expect(probe.removeEventListener).toHaveBeenCalledTimes(4);
  });

  test('ignores sprite frames but observes added panels and changed scale', () => {
    const probe = startReportingProbe();
    const sprite = probe.document.createElement('div');
    sprite.className = 'pet-sprite';
    probe.onMutation([{ target: sprite } as unknown as MutationRecord]);
    expect(probe.frames.size).toBe(0);

    probe.rect.width = 128;
    probe.onMutation([{ target: probe.document.querySelector('.pet-anchor') } as unknown as MutationRecord]);
    probe.flush();
    expect(probe.report.mock.lastCall?.[1]?.width).toBe(128);
    const panel = probe.document.createElement('section');
    panel.className = 'todo-panel';
    probe.document.body.append(panel);
    probe.onMutation([{ target: probe.document.body } as unknown as MutationRecord]);
    probe.flush();
    expect(probe.resizeObserver.observe.mock.calls.some(([target]) => target === panel)).toBe(true);
    panel.remove();
    probe.onMutation([{ target: probe.document.body } as unknown as MutationRecord]);
    probe.flush();
    expect(probe.resizeObserver.unobserve.mock.calls.some(([target]) => target === panel)).toBe(true);
    probe.stop();
  });

  test('sleeps while hidden and refreshes geometry immediately when shown again', () => {
    const probe = startReportingProbe();
    probe.events.resize();
    expect(probe.frames.size).toBe(1);
    Object.defineProperty(probe.document, 'hidden', { configurable: true, value: true });
    probe.document.dispatchEvent(new probe.document.defaultView!.Event('visibilitychange'));
    expect(probe.frames.size).toBe(0);
    expect(probe.report.mock.lastCall).toEqual([[], null]);
    probe.onResize();
    expect(probe.frames.size).toBe(0);

    probe.rect.y = 72;
    Object.defineProperty(probe.document, 'hidden', { configurable: true, value: false });
    probe.document.dispatchEvent(new probe.document.defaultView!.Event('visibilitychange'));
    expect(probe.report.mock.lastCall?.[1]?.y).toBe(72);
    probe.stop();
    probe.onResize();
    expect(probe.frames.size).toBe(0);
  });

  test('honors native window visibility even if the page still reports itself visible', () => {
    const probe = startReportingProbe();
    expect(probe.document.hidden).toBe(false);
    probe.setVisible(false);
    expect(probe.report.mock.lastCall).toEqual([[], null]);
    probe.events.resize();
    expect(probe.frames.size).toBe(0);
    probe.rect.width = 192;
    probe.setVisible(true);
    expect(probe.report.mock.lastCall?.[1]?.width).toBe(192);
    probe.stop();
  });

  test('collects the pet anchor rect separately from interactive rects', () => {
    const document = domWithElements([
      { className: 'pet-anchor', rect: { x: 292, y: 578, width: 96, height: 104 } },
      { className: 'hidden pet-anchor', rect: { x: 0, y: 0, width: 0, height: 0 } }
    ]);
    const first = document.querySelector('.pet-anchor')!;
    expect(collectPetRect(document)).toEqual({ x: 292, y: 578, width: 96, height: 104 });
    first.remove();
    const fallback = collectPetRect(document);
    expect(fallback === null || fallback.width === 0).toBe(true);
  });
});

function startReportingProbe() {
  const rect = { x: 0, y: 0, width: 64, height: 64 };
  const document = domWithElements([{ className: 'pet-anchor', rect }]) as Document;
  const report = vi.fn<(rects: unknown, petRect: { x: number; y: number; width: number; height: number } | null) => void>();
  const frames = new Map<number, () => void>();
  let nextFrame = 0;
  let onResize = (): void => {};
  let onMutation = (_records: MutationRecord[]): void => {};
  const events = {} as Record<'resize' | 'scroll' | 'transitionend' | 'animationend', () => void>;
  const resizeObserver = { observe: vi.fn(), unobserve: vi.fn(), disconnect: vi.fn() };
  const mutationObserver = { observe: vi.fn(), disconnect: vi.fn() };
  const removeEventListener = vi.fn();
  const reporting = startInteractiveRectReporting(report, {
    document,
    requestAnimationFrame: (callback) => { frames.set(++nextFrame, callback); return nextFrame; },
    cancelAnimationFrame: (frame) => { frames.delete(frame); },
    createResizeObserver: (handler) => { onResize = handler; return resizeObserver; },
    createMutationObserver: (handler) => { onMutation = handler; return mutationObserver; },
    addEventListener: (type, handler) => { events[type] = handler; },
    removeEventListener
  });
  return {
    rect, document, report, frames, events, resizeObserver, removeEventListener, ...reporting,
    onResize: () => onResize(),
    onMutation: (records: MutationRecord[]) => onMutation(records),
    flush: () => { const pending = [...frames.values()]; frames.clear(); pending.forEach((callback) => callback()); }
  };
}
