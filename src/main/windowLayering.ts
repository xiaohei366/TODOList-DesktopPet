import type { InteractiveRect } from '../shared/types';

type PetAlwaysOnTopLevel = 'floating' | 'pop-up-menu';

export function getPetAlwaysOnTopLevel(platform: NodeJS.Platform = process.platform): PetAlwaysOnTopLevel {
  // macOS 输入法候选窗应位于桌宠之上；菜单弹窗层级会遮挡候选窗。
  return platform === 'darwin' ? 'floating' : 'pop-up-menu';
}

export const macCursorPollIntervalMs = 80;

export type PetLayerWindow = {
  setAlwaysOnTop(flag: boolean, level?: PetAlwaysOnTopLevel): void;
  moveTop(): void;
  setIgnoreMouseEvents(ignore: boolean, options?: { forward?: boolean }): void;
};

export function keepPetWindowOnTop(
  window: Pick<PetLayerWindow, 'setAlwaysOnTop' | 'moveTop'>,
  platform: NodeJS.Platform = process.platform
): void {
  window.setAlwaysOnTop(true, getPetAlwaysOnTopLevel(platform));
  window.moveTop();
}

export function setPetWindowMousePassthrough(
  window: PetLayerWindow,
  ignore: boolean,
  platform: NodeJS.Platform = process.platform
): void {
  if (ignore) {
    window.setIgnoreMouseEvents(true, { forward: true });
  } else {
    window.setIgnoreMouseEvents(false);
  }
  keepPetWindowOnTop(window, platform);
}

export function isCursorOverInteractiveArea(
  cursor: { x: number; y: number },
  contentBounds: { x: number; y: number },
  rects: InteractiveRect[],
  zoomFactor = 1
): boolean {
  const localX = (cursor.x - contentBounds.x) / zoomFactor;
  const localY = (cursor.y - contentBounds.y) / zoomFactor;
  return rects.some(
    (rect) =>
      localX >= rect.x &&
      localX <= rect.x + rect.width &&
      localY >= rect.y &&
      localY <= rect.y + rect.height
  );
}

export function parseInteractiveRects(value: unknown): InteractiveRect[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const rects: InteractiveRect[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== 'object' || rects.length >= 64) {
      continue;
    }
    const candidate = raw as Record<string, unknown>;
    const x = Number(candidate.x);
    const y = Number(candidate.y);
    const width = Number(candidate.width);
    const height = Number(candidate.height);
    if ([x, y, width, height].every(Number.isFinite)) {
      rects.push({ x, y, width, height });
    }
  }
  return rects;
}

export function parsePetRect(value: unknown): InteractiveRect | undefined {
  return parseInteractiveRects([value])[0];
}

export function unionOfRects(rects: InteractiveRect[]): InteractiveRect | undefined {
  if (rects.length === 0) {
    return undefined;
  }
  const x1 = Math.min(...rects.map((rect) => rect.x));
  const y1 = Math.min(...rects.map((rect) => rect.y));
  const x2 = Math.max(...rects.map((rect) => rect.x + rect.width));
  const y2 = Math.max(...rects.map((rect) => rect.y + rect.height));
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}

/** 窗口标准高度(面板全展开时的自然尺寸)。 */
export const naturalPetWindowHeight = 720;

/** 窗口底部到宠物底边的保留间距之外,再留的安全余量。 */
export const petWindowMargin = 8;

/**
 * macOS 会把窗口顶部钉在所在显示器的工作区顶部(setPosition 无法越过)。
 * 宠物锚定在窗口底部,若照常上移,宠物只能到半屏。改为:顶部钉住时收缩窗口高度,
 * 底部锚定的内容继续跟随光标;拖回来时高度按需恢复。
 *
 * 必须以拖拽起点的底边为基准。窗口可能是上一次拖拽留下的矮窗口,
 * 若按固定自然高度推算,第二次向下拖动会瞬间跳高。
 */
export function computeMacDragFrame(
  start: { y: number; height: number },
  deltaY: number,
  pinY: number,
  minHeight: number,
  naturalHeight = naturalPetWindowHeight
): { y: number; height: number } {
  return computeMacRebaseFrame(start.y + start.height + deltaY, pinY, minHeight, naturalHeight);
}

/** 以底边为基准恢复自然高度:顶部不超过 pinY,高度不足时保持最小高度。 */
export function computeMacRebaseFrame(
  bottom: number,
  pinY: number,
  minHeight: number,
  naturalHeight = naturalPetWindowHeight
): { y: number; height: number } {
  const height = Math.max(Math.min(naturalHeight, bottom - pinY), minHeight);
  return { y: Math.max(bottom - height, pinY), height };
}

/**
 * 内容矩形(屏幕坐标)超出当前窗口时扩容(如短窗口状态下打开 TODO 面板):
 * 底部锚定向上生长,宠物保持不动;顶部被钉时不再上移,面板在钉住线以上被裁剪。
 * 已能容纳时返回原尺寸(调用方据此跳过 setBounds)。
 */
export function computeMacExpandFrame(
  current: { y: number; height: number },
  union: InteractiveRect,
  pinY: number,
  minHeight: number,
  margin = petWindowMargin,
  naturalHeight = naturalPetWindowHeight
): { y: number; height: number } {
  const currentBottom = current.y + current.height;
  const bottom = Math.max(currentBottom, union.y + union.height + margin);
  const top = Math.min(current.y, union.y - margin);
  if (top >= current.y - 0.5 && bottom <= currentBottom + 0.5) {
    return { y: current.y, height: current.height };
  }
  const clampedTop = Math.max(top, pinY);
  const height = Math.max(Math.min(naturalHeight, bottom - clampedTop), minHeight);
  const y = Math.max(bottom - height, clampedTop);
  return { y, height };
}

/** 由当前窗口内容高度与宠物矩形推算最小窗口高度(宠物必须完整可见)。 */
export function petWindowMinHeight(contentHeight: number, petRect: InteractiveRect | undefined): number {
  if (!petRect || petRect.height <= 0) {
    return 200;
  }
  const bottomGap = Math.max(0, contentHeight - petRect.y - petRect.height);
  return Math.ceil(petRect.height + bottomGap + petWindowMargin);
}

export type PassthroughWindowAdapter = PetLayerWindow & {
  getContentBounds(): { x: number; y: number };
  getZoomFactor(): number;
  notifyCaptureRestored(): void;
};

/**
 * Owns the pet window's mouse-passthrough state. On Windows the renderer keeps
 * receiving forwarded mousemove events while ignoring mouse input, so it can
 * toggle passthrough itself. On macOS a click-through transparent window cannot
 * rely on receiving pointer events, so the main process polls the cursor and
 * restores capture when it enters an interactive region reported by the renderer.
 */
export class MousePassthroughController {
  private ignoring = false;
  private rects: InteractiveRect[] = [];
  private petRectValue: InteractiveRect | undefined;
  private pollTimer: NodeJS.Timeout | undefined;
  private pollingEnabled = false;

  constructor(
    private readonly window: PassthroughWindowAdapter,
    private readonly getCursor: () => { x: number; y: number },
    private readonly intervalMs = macCursorPollIntervalMs,
    private readonly platform: NodeJS.Platform = process.platform
  ) {}

  setPassthrough(ignore: boolean): void {
    if (this.ignoring === ignore) {
      return;
    }
    this.ignoring = ignore;
    setPetWindowMousePassthrough(this.window, ignore, this.platform);
    this.updateCursorPolling();
  }

  updateInteractiveRects(rects: InteractiveRect[], petRect?: InteractiveRect): void {
    this.rects = rects;
    this.petRectValue = petRect;
    this.updateCursorPolling();
  }

  get petRect(): InteractiveRect | undefined {
    return this.petRectValue;
  }

  startCursorPolling(): void {
    this.pollingEnabled = true;
    this.updateCursorPolling();
  }

  private updateCursorPolling(): void {
    if (this.platform !== 'darwin' || !this.pollingEnabled || !this.ignoring || this.rects.length === 0) {
      this.clearCursorPolling();
      return;
    }
    if (this.pollTimer) {
      return;
    }
    this.pollTimer = setInterval(() => {
      this.restoreCaptureFromCursor();
    }, this.intervalMs);
    this.pollTimer.unref();
  }

  stopCursorPolling(): void {
    this.pollingEnabled = false;
    this.clearCursorPolling();
  }

  private clearCursorPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = undefined;
    }
  }

  restoreCaptureFromCursor(cursor?: { x: number; y: number }): boolean {
    if (!this.ignoring || this.rects.length === 0) {
      return false;
    }
    if (
      !isCursorOverInteractiveArea(cursor ?? this.getCursor(), this.window.getContentBounds(), this.rects, this.window.getZoomFactor())
    ) {
      return false;
    }
    this.setPassthrough(false);
    this.window.notifyCaptureRestored();
    return true;
  }
}
