import type { TodoItem } from './types';

export function isTodoActive(item: TodoItem): boolean {
  return !item.completed && !item.suspended;
}
