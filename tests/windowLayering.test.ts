import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  computeMacDragFrame,
  computeMacExpandFrame,
  computeMacRebaseFrame,
  getPetAlwaysOnTopLevel,
  isCursorOverInteractiveArea,
  keepPetWindowOnTop,
  macCursorPollIntervalMs,
  MousePassthroughController,
  naturalPetWindowHeight,
  parseInteractiveRects,
  parsePetRect,
  petWindowMinHeight,
  setPetWindowMousePassthrough,
  unionOfRects,
  type PassthroughWindowAdapter,
  type PetLayerWindow
} from '../src/main/windowLayering';

function createWindowDouble(): PetLayerWindow & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    setAlwaysOnTop: (flag, level) => {
      calls.push(`top:${String(flag)}:${String(level)}`);
    },
    moveTop: () => {
      calls.push('moveTop');
    },
    setIgnoreMouseEvents: (ignore, options) => {
      calls.push(`ignore:${String(ignore)}:${options?.forward === true ? 'forward' : 'none'}`);
    }
  };
}

describe('pet window layering', () => {
  test('keeps the macOS pet below input-method candidate windows', () => {
    expect(getPetAlwaysOnTopLevel('darwin')).toBe('floating');
  });

  test('retains the high topmost level on other platforms', () => {
    expect(getPetAlwaysOnTopLevel('win32')).toBe('pop-up-menu');
    expect(getPetAlwaysOnTopLevel('linux')).toBe('pop-up-menu');
  });

  test('uses the host platform by default', () => {
    expect(getPetAlwaysOnTopLevel()).toBe(getPetAlwaysOnTopLevel(process.platform));
  });

  test.each([
    ['darwin', 'floating'],
    ['win32', 'pop-up-menu']
  ] as const)('reasserts always-on-top and z-order on %s', (platform, level) => {
    const window = createWindowDouble();

    keepPetWindowOnTop(window, platform);

    expect(window.calls).toEqual([`top:true:${level}`, 'moveTop']);
  });

  test.each([
    ['darwin', 'floating'],
    ['win32', 'pop-up-menu']
  ] as const)('preserves the %s level after changing mouse passthrough styles', (platform, level) => {
    const window = createWindowDouble();

    setPetWindowMousePassthrough(window, true, platform);
    setPetWindowMousePassthrough(window, false, platform);

    expect(window.calls).toEqual([
      'ignore:true:forward',
      `top:true:${level}`,
      'moveTop',
      'ignore:false:none',
      `top:true:${level}`,
      'moveTop'
    ]);
  });
});

describe('macOS cursor hit testing', () => {
  const rect = { x: 100, y: 200, width: 80, height: 60 };

  test('detects the cursor inside an interactive rect', () => {
    expect(isCursorOverInteractiveArea({ x: 140, y: 230 }, { x: 0, y: 0 }, [rect])).toBe(true);
    expect(isCursorOverInteractiveArea({ x: 100, y: 200 }, { x: 0, y: 0 }, [rect])).toBe(true);
    expect(isCursorOverInteractiveArea({ x: 180, y: 260 }, { x: 0, y: 0 }, [rect])).toBe(true);
  });

  test('rejects the cursor outside every interactive rect', () => {
    expect(isCursorOverInteractiveArea({ x: 99, y: 230 }, { x: 0, y: 0 }, [rect])).toBe(false);
    expect(isCursorOverInteractiveArea({ x: 181, y: 230 }, { x: 0, y: 0 }, [rect])).toBe(false);
    expect(isCursorOverInteractiveArea({ x: 140, y: 261 }, { x: 0, y: 0 }, [rect])).toBe(false);
    expect(isCursorOverInteractiveArea({ x: 140, y: 230 }, { x: 0, y: 0 }, [])).toBe(false);
  });

  test('converts screen coordinates to viewport coordinates', () => {
    expect(isCursorOverInteractiveArea({ x: 640, y: 430 }, { x: 500, y: 200 }, [rect])).toBe(true);
    expect(isCursorOverInteractiveArea({ x: 599, y: 430 }, { x: 500, y: 200 }, [rect])).toBe(false);
  });

  test('applies the renderer zoom factor before hit testing', () => {
    expect(isCursorOverInteractiveArea({ x: 280, y: 460 }, { x: 0, y: 0 }, [rect], 2)).toBe(true);
    expect(isCursorOverInteractiveArea({ x: 161, y: 230 }, { x: 0, y: 0 }, [rect], 2)).toBe(false);
  });
});

describe('parseInteractiveRects', () => {
  test('keeps finite rect entries and drops everything else', () => {
    expect(
      parseInteractiveRects([
        { x: 1, y: 2, width: 3, height: 4 },
        null,
        'nope',
        { x: 'a', y: 0, width: 0, height: 0 },
        { x: 5, y: 6, width: 7, height: 8 }
      ])
    ).toEqual([
      { x: 1, y: 2, width: 3, height: 4 },
      { x: 5, y: 6, width: 7, height: 8 }
    ]);
    expect(parseInteractiveRects(undefined)).toEqual([]);
    expect(parseInteractiveRects('x')).toEqual([]);
  });

  test('caps the accepted rect count', () => {
    const rects = Array.from({ length: 100 }, (_, index) => ({ x: index, y: 0, width: 1, height: 1 }));
    expect(parseInteractiveRects(rects)).toHaveLength(64);
  });
});

function createAdapter(overrides: Partial<PassthroughWindowAdapter> = {}): PassthroughWindowAdapter & { calls: string[] } {
  const window = createWindowDouble();
  return {
    calls: window.calls,
    setAlwaysOnTop: window.setAlwaysOnTop,
    moveTop: window.moveTop,
    setIgnoreMouseEvents: window.setIgnoreMouseEvents,
    getContentBounds: () => ({ x: 500, y: 200, width: 680, height: 720 }),
    getZoomFactor: () => 1,
    notifyCaptureRestored: () => {
      window.calls.push('capture-restored');
    },
    ...overrides
  };
}

describe('MousePassthroughController', () => {
  afterEach(() => vi.useRealTimers());

  test('does not query the native cursor unless mouse capture needs restoring', () => {
    const getCursor = vi.fn(() => ({ x: 0, y: 0 }));
    const controller = new MousePassthroughController(createAdapter(), getCursor);
    expect(controller.restoreCaptureFromCursor()).toBe(false);
    controller.updateInteractiveRects([{ x: 0, y: 0, width: 100, height: 100 }]);
    expect(controller.restoreCaptureFromCursor()).toBe(false);
    controller.setPassthrough(true);
    controller.updateInteractiveRects([]);
    expect(controller.restoreCaptureFromCursor()).toBe(false);
    expect(getCursor).not.toHaveBeenCalled();
  });

  test('polls only while visible, click-through, and holding interactive rects', () => {
    vi.useFakeTimers();
    const getCursor = vi.fn(() => ({ x: 640, y: 430 }));
    const controller = new MousePassthroughController(createAdapter(), getCursor, macCursorPollIntervalMs, 'darwin');
    controller.startCursorPolling();
    controller.setPassthrough(true);
    expect(vi.getTimerCount()).toBe(0);

    controller.updateInteractiveRects([{ x: 100, y: 200, width: 80, height: 60 }]);
    controller.startCursorPolling();
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(macCursorPollIntervalMs);
    expect(getCursor).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0); // Capture was restored, so polling can sleep.

    controller.setPassthrough(true);
    expect(vi.getTimerCount()).toBe(1);
    controller.stopCursorPolling(); // Hiding/minimizing disables restarts from incoming IPC.
    controller.updateInteractiveRects([{ x: 100, y: 200, width: 80, height: 60 }]);
    vi.advanceTimersByTime(1000);
    expect(getCursor).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);

    controller.startCursorPolling();
    expect(vi.getTimerCount()).toBe(1);
    controller.updateInteractiveRects([]);
    expect(vi.getTimerCount()).toBe(0);
    controller.stopCursorPolling();
  });

  test('avoids repeating native window mutations for unchanged passthrough', () => {
    const window = createAdapter();
    const controller = new MousePassthroughController(window, () => ({ x: 0, y: 0 }));
    controller.setPassthrough(true);
    const calls = [...window.calls];
    controller.setPassthrough(true);
    expect(window.calls).toEqual(calls);
  });
  test.each([
    ['darwin', 'floating'],
    ['win32', 'pop-up-menu']
  ] as const)('keeps the %s level when polling restores mouse capture', (platform, level) => {
    const window = createAdapter();
    const controller = new MousePassthroughController(window, () => ({ x: 640, y: 430 }), macCursorPollIntervalMs, platform);
    controller.updateInteractiveRects([{ x: 100, y: 200, width: 80, height: 60 }]);

    controller.setPassthrough(true);
    expect(controller.restoreCaptureFromCursor()).toBe(true);

    expect(window.calls).toEqual([
      'ignore:true:forward',
      `top:true:${level}`,
      'moveTop',
      'ignore:false:none',
      `top:true:${level}`,
      'moveTop',
      'capture-restored'
    ]);
  });

  test('restores capture and notifies the renderer when the cursor enters an interactive rect', () => {
    const window = createAdapter();
    const controller = new MousePassthroughController(window, () => ({ x: 0, y: 0 }));

    controller.updateInteractiveRects([{ x: 100, y: 200, width: 80, height: 60 }]);
    controller.setPassthrough(true);

    expect(controller.restoreCaptureFromCursor({ x: 640, y: 430 })).toBe(true);
    expect(window.calls).toContain('ignore:false:none');
    expect(window.calls).toContain('capture-restored');
  });

  test('keeps passthrough while the cursor stays outside interactive rects', () => {
    const window = createAdapter();
    const controller = new MousePassthroughController(window, () => ({ x: 0, y: 0 }));

    controller.updateInteractiveRects([{ x: 100, y: 200, width: 80, height: 60 }]);
    controller.setPassthrough(true);

    expect(controller.restoreCaptureFromCursor({ x: 400, y: 100 })).toBe(false);
    expect(window.calls).not.toContain('ignore:false:none');
    expect(window.calls).not.toContain('capture-restored');
  });

  test('does nothing when capture is already active or no rects were reported', () => {
    const window = createAdapter();
    const controller = new MousePassthroughController(window, () => ({ x: 0, y: 0 }));

    controller.updateInteractiveRects([{ x: 0, y: 0, width: 1000, height: 1000 }]);
    controller.setPassthrough(false);
    expect(controller.restoreCaptureFromCursor({ x: 640, y: 430 })).toBe(false);

    controller.setPassthrough(true);
    controller.updateInteractiveRects([]);
    expect(controller.restoreCaptureFromCursor({ x: 640, y: 430 })).toBe(false);
    expect(window.calls).not.toContain('capture-restored');
  });

  test('starts cursor polling on macOS only', () => {
    vi.useFakeTimers();
    const window = createAdapter();
    const darwin = new MousePassthroughController(window, () => ({ x: 0, y: 0 }), macCursorPollIntervalMs, 'darwin');
    const win32 = new MousePassthroughController(window, () => ({ x: 0, y: 0 }), macCursorPollIntervalMs, 'win32');

    for (const controller of [darwin, win32]) {
      controller.updateInteractiveRects([{ x: 0, y: 0, width: 100, height: 100 }]);
      controller.setPassthrough(true);
    }
    darwin.startCursorPolling();
    win32.startCursorPolling();
    expect(vi.getTimerCount()).toBe(1);
    darwin.stopCursorPolling();
    win32.stopCursorPolling();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('macOS top-pin drag frame', () => {
  const pinY = -1410;
  const minHeight = 150;

  test('keeps the natural frame while below the pin', () => {
    expect(computeMacDragFrame({ y: -800, height: 720 }, 0, pinY, minHeight)).toEqual({ y: -800, height: 720 });
    expect(computeMacDragFrame({ y: pinY, height: 720 }, 0, pinY, minHeight)).toEqual({ y: pinY, height: 720 });
  });

  test('shrinks the window instead of moving past the pin', () => {
    // 起点顶部 -800、向下拖 -850 → 底边 -930,越过 pin 240px → 高度 480
    expect(computeMacDragFrame({ y: -800, height: 720 }, -850, pinY, minHeight)).toEqual({ y: pinY, height: 480 });
    // 越界超过可收缩量时,停在最小高度
    expect(computeMacDragFrame({ y: -800, height: 720 }, -2200, pinY, minHeight)).toEqual({ y: pinY, height: minHeight });
  });

  test('grows back while dragging down', () => {
    // 起点顶部 -1410(已钉住)、高度 510,向下 120 → 底边仍精确跟随
    expect(computeMacDragFrame({ y: pinY, height: 510 }, 120, pinY, minHeight)).toEqual({ y: pinY, height: 630 });
    expect(computeMacDragFrame({ y: pinY, height: 510 }, 300, pinY, minHeight)).toEqual({ y: -1320, height: 720 });
  });

  test('does not jump when a shortened window starts a new drag', () => {
    // 上一次拖拽留下的矮窗口:高 510、底部 -900。新拖拽向下 120 只能把底边推到 -780,
    // 高度应随底边增长到 630,而不是瞬间恢复 720 并向下跳 330px。
    const frame = computeMacDragFrame({ y: pinY, height: 510 }, 120, pinY, minHeight);
    expect(frame.y + frame.height).toBe(-780);
    expect(frame.height).toBe(630);
  });

  test('rebase restores the natural height bottom-anchored', () => {
    // 底部 -1100,顶部最多到 pinY:高度 310
    expect(computeMacRebaseFrame(-1100, pinY, minHeight)).toEqual({ y: pinY, height: 310 });
    // 底部足够低时恢复完整高度
    expect(computeMacRebaseFrame(-500, pinY, minHeight)).toEqual({ y: -1220, height: 720 });
    // 底部离顶部不足最小高度时,窗口停在 pinY 且不再继续上移
    expect(computeMacRebaseFrame(-1600, pinY, minHeight)).toEqual({ y: pinY, height: minHeight });
  });

  test('expand keeps the current frame when content already fits', () => {
    const current = { y: -800, height: 720 };
    const union = { x: 100, y: -500, width: 300, height: 300 };
    expect(computeMacExpandFrame(current, union, pinY, minHeight)).toEqual(current);
  });

  test('expand grows upward bottom-anchored when the panel needs room', () => {
    // 短窗口:高 200、底部 -1100;面板+宠物 union 从 -1900 到宠物底 -1138
    const current = { y: -1300, height: 200 };
    const union = { x: 100, y: -1900, width: 300, height: 762 };
    const frame = computeMacExpandFrame(current, union, pinY, minHeight);
    // 顶部最多到 pinY:底部锚定不动(宠物不移),面板在钉住线以上被裁剪
    expect(frame.y).toBe(pinY);
    expect(frame.height).toBe(-1100 - pinY);
    expect(frame.y + frame.height).toBe(-1100);
  });

  test('expand extends the bottom too when the union hangs below', () => {
    const current = { y: -1400, height: 150 };
    const union = { x: 100, y: -2000, width: 300, height: 958 }; // 底伸到 -1042
    const frame = computeMacExpandFrame(current, union, pinY, minHeight);
    expect(frame.y).toBe(pinY);
    expect(frame.y + frame.height).toBeGreaterThanOrEqual(-1042);
    expect(frame.height).toBeLessThanOrEqual(naturalPetWindowHeight);
  });

  test('petWindowMinHeight derives from the pet rect and bottom gap', () => {
    // 720 高窗口内宠物:顶 578、高 104(底距 38)
    expect(petWindowMinHeight(720, { x: 292, y: 578, width: 96, height: 104 })).toBe(150);
    expect(petWindowMinHeight(720, undefined)).toBe(200);
  });

  test('unionOfRects and parsePetRect helpers', () => {
    expect(unionOfRects([
      { x: 10, y: 20, width: 30, height: 40 },
      { x: 50, y: 5, width: 10, height: 10 }
    ])).toEqual({ x: 10, y: 5, width: 50, height: 55 });
    expect(unionOfRects([])).toBeUndefined();
    expect(parsePetRect({ x: 1, y: 2, width: 3, height: 4 })).toEqual({ x: 1, y: 2, width: 3, height: 4 });
    expect(parsePetRect(null)).toBeUndefined();
    expect(parsePetRect({ x: 'a', y: 2, width: 3, height: 4 })).toBeUndefined();
  });
});
