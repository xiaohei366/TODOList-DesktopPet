// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { App } from '../src/renderer/src/App';
import type { EnterTodoFocusPayload, TodoItem } from '../src/shared/types';
import { defaultLanguage, t } from '../src/shared/i18n';

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function todo(id: string, text: string): TodoItem {
  return {
    id,
    text,
    date: '2026-10-27',
    completed: false,
    highlighted: false,
    overdue: false,
    sourceLine: 1,
    notes: '',
    subTasks: []
  };
}

function mockBridge(initialTodos: Promise<TodoItem[]>) {
  let onTodos: (items: TodoItem[]) => void = () => {};
  let onFocus: (payload: EnterTodoFocusPayload) => void = () => {};
  const subscribe = () => () => {};
  const rendererReady = vi.fn(async () => {});
  const api = {
    todos: {
      list: vi.fn(() => initialTodos),
      onChanged: (listener: typeof onTodos) => {
        onTodos = listener;
        return () => { onTodos = () => {}; };
      }
    },
    pets: { list: async () => [], onChanged: subscribe },
    schedules: { list: async () => [], onChanged: subscribe },
    settings: { getLanguage: async () => defaultLanguage, onLanguageChanged: subscribe },
    usage: { onOpenPanel: subscribe },
    window: {
      setMousePassthrough: async () => {},
      updateInteractiveRects: () => {},
      onVisibilityChanged: subscribe,
      onMousePassthroughChanged: subscribe
    },
    ui: {
      rendererReady,
      onEnterTodoFocus: (listener: typeof onFocus) => {
        onFocus = listener;
        return () => { onFocus = () => {}; };
      },
      onToggleTodoPanel: subscribe,
      onToggleSchedulePanel: subscribe,
      onSelectPet: subscribe,
      onTodoAction: subscribe,
      onSubTaskAction: subscribe
    }
  } as unknown as Window['todoPet'];
  Object.defineProperty(window, 'todoPet', { configurable: true, writable: true, value: api });
  return { rendererReady, emitTodos: (items: TodoItem[]) => onTodos(items), emitFocus: (payload: EnterTodoFocusPayload) => onFocus(payload) };
}

describe('reminder focus during renderer startup', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 27, 8, 5));
    localStorage.clear();
    vi.stubGlobal('ResizeObserver', class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    });
    vi.stubGlobal('requestAnimationFrame', () => 1);
    vi.stubGlobal('cancelAnimationFrame', () => {});
  });

  afterEach(() => {
    cleanup();
    Reflect.deleteProperty(window, 'todoPet');
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  test('waits for initial TODO data before requesting queued startup reminders', async () => {
    const initial = deferred<TodoItem[]>();
    const reminder = todo('startup-reminder', 'Startup reminder');
    const bridge = mockBridge(initial.promise);
    bridge.rendererReady.mockImplementation(async () => { bridge.emitFocus({ id: reminder.id, force: false }); });

    await act(async () => { render(<App />); });
    expect(bridge.rendererReady).not.toHaveBeenCalled();

    await act(async () => { initial.resolve([reminder]); });
    expect(bridge.rendererReady).toHaveBeenCalledTimes(1);
    expect(within(screen.getByRole('dialog', { name: 'Focus mode' })).getByText(reminder.text)).toBeTruthy();
  });

  test('retains a newer TODO change received before an older initial-list response', async () => {
    const initial = deferred<TodoItem[]>();
    const reminder = todo('new-reminder', 'Newly generated reminder');
    const bridge = mockBridge(initial.promise);

    await act(async () => { render(<App />); });
    await act(async () => { bridge.emitTodos([reminder]); });
    expect(bridge.rendererReady).toHaveBeenCalledTimes(1);
    expect(screen.getByText(reminder.text)).toBeTruthy();

    await act(async () => { initial.resolve([]); });
    expect(screen.getByText(reminder.text)).toBeTruthy();
    expect(bridge.rendererReady).toHaveBeenCalledTimes(1);
  });

  test('keeps the first reminder focused and queues the second when both arrive in one batch', async () => {
    const first = todo('first-reminder', 'First reminder');
    const second = todo('second-reminder', 'Second reminder');
    const bridge = mockBridge(Promise.resolve([first, second]));

    await act(async () => { render(<App />); });
    expect(bridge.rendererReady).toHaveBeenCalledTimes(1);
    act(() => {
      bridge.emitFocus({ id: first.id, force: false });
      bridge.emitFocus({ id: second.id, force: false });
    });
    const focus = screen.getByRole('dialog', { name: 'Focus mode' });
    expect(within(focus).getByText(first.text)).toBeTruthy();
    expect(within(focus).getByRole('status').textContent).toBe(t(defaultLanguage, 'focus.queuedCount', { count: 1 }));

    fireEvent.click(within(focus).getByRole('button', { name: t(defaultLanguage, 'focus.exit') }));
    const nextFocus = screen.getByRole('dialog', { name: 'Focus mode' });
    expect(within(nextFocus).getByText(second.text)).toBeTruthy();
    expect(within(nextFocus).queryByRole('status')).toBeNull();
  });
});
