// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { TodoStreak } from '../src/renderer/src/TodoStreak';
import { t } from '../src/shared/i18n';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

test('stops the heading timer on a native hide notification even when document.hidden is false', () => {
  vi.useFakeTimers();
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
  const { rerender } = render(<TodoStreak completed={0} remaining={1} language="en-US" visible />);
  expect(vi.getTimerCount()).toBe(1);
  rerender(<TodoStreak completed={0} remaining={1} language="en-US" visible={false} />);
  expect(vi.getTimerCount()).toBe(0);
  rerender(<TodoStreak completed={0} remaining={1} language="en-US" visible />);
  expect(vi.getTimerCount()).toBe(1);
});

test('rotates the header, pauses while hidden, and resumes without a timer leak', () => {
  vi.useFakeTimers();
  let hidden = false;
  vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden);
  const { unmount, rerender } = render(<TodoStreak completed={2} remaining={3} language="en-US" />);
  expect(screen.getByText(t('en-US', 'todo.completedToday', { count: 2 }))).toBeTruthy();
  act(() => { vi.advanceTimersByTime(4000); });
  expect(screen.getByText(t('en-US', 'todo.remainingToday', { count: 3 }))).toBeTruthy();

  rerender(<TodoStreak completed={2} remaining={4} language="en-US" />);
  expect(screen.getByText(t('en-US', 'todo.remainingToday', { count: 4 }))).toBeTruthy();
  act(() => { hidden = true; document.dispatchEvent(new Event('visibilitychange')); });
  expect(vi.getTimerCount()).toBe(0);
  act(() => { vi.advanceTimersByTime(20000); });
  expect(screen.getByText(t('en-US', 'todo.remainingToday', { count: 4 }))).toBeTruthy();

  act(() => { hidden = false; document.dispatchEvent(new Event('visibilitychange')); });
  expect(vi.getTimerCount()).toBe(1);
  act(() => { vi.advanceTimersByTime(4000); });
  expect(screen.getByText(t('en-US', 'todo.completedToday', { count: 2 }))).toBeTruthy();
  unmount();
  expect(vi.getTimerCount()).toBe(0);
});
