import { describe, expect, test, vi } from 'vitest';
import type { MenuItemConstructorOptions } from 'electron';
import { buildTodoMenuTemplate, buildSubTaskMenuTemplate } from '../src/main/todoMenu';
import { t } from '../src/shared/i18n';
import type { TodoItem } from '../src/shared/types';

const item: TodoItem = {
  id: 'todo', date: '2026-10-12', text: 'Task', completed: false,
  highlighted: false, overdue: false, sourceLine: 1, notes: '', subTasks: []
};
const tr = t.bind(null, 'zh-CN');
const click = (entry: MenuItemConstructorOptions) => (entry.click as () => void)();

describe('TODO native menus', () => {
  test('groups suspension and the red marker under Adjust Status', () => {
    const send = vi.fn();
    const menu = buildTodoMenuTemplate(item, tr, send);
    expect(menu.map((entry) => entry.label)).not.toContain('标红');
    const status = menu.find((entry) => entry.label === '调整状态')!;
    const children = status.submenu as MenuItemConstructorOptions[];
    expect(children.map((entry) => entry.label)).toEqual(['挂起', '标红']);
    click(children[0]);
    expect(send).toHaveBeenLastCalledWith({ type: 'toggle-suspended', id: 'todo' });
    click(children[1]);
    expect(send).toHaveBeenLastCalledWith({ type: 'toggle-highlighted', id: 'todo' });
    const highlighted = buildTodoMenuTemplate({ ...item, highlighted: true }, tr, send);
    expect((highlighted.find((entry) => entry.label === '调整状态')!.submenu as MenuItemConstructorOptions[])[1].label).toBe('取消标红');
  });

  test('suspended todos separate Restore from Delete', () => {
    const send = vi.fn();
    const menu = buildTodoMenuTemplate({ ...item, suspended: true }, tr, send);
    expect(menu.map((entry) => entry.label ?? entry.type)).toEqual(['恢复', 'separator', '删除']);
    click(menu[0]);
    expect(send).toHaveBeenCalledWith({ type: 'toggle-suspended', id: 'todo' });
    click(menu[2]);
    expect(send).toHaveBeenLastCalledWith({ type: 'delete', id: 'todo' });
  });

  test('completed todos and subtasks separate Undo Completion from Delete', () => {
    const send = vi.fn();
    const menu = buildTodoMenuTemplate({ ...item, completed: true }, tr, send);
    expect(menu.map((entry) => entry.label ?? entry.type)).toEqual(['取消完成', 'separator', '删除']);
    click(menu[0]);
    expect(send).toHaveBeenLastCalledWith({ type: 'toggle-completed', id: 'todo' });
    click(menu[2]);
    expect(send).toHaveBeenLastCalledWith({ type: 'delete', id: 'todo' });
    const childMenu = buildSubTaskMenuTemplate('todo', { id: 'child', text: 'Child', completed: true }, tr, send);
    expect(childMenu.map((entry) => entry.label ?? entry.type)).toEqual(['取消完成', 'separator', '删除']);
    click(childMenu[0]);
    expect(send).toHaveBeenLastCalledWith({ type: 'toggle-completed', parentId: 'todo', subTaskId: 'child' });
    click(childMenu[2]);
    expect(send).toHaveBeenLastCalledWith({ type: 'delete', parentId: 'todo', subTaskId: 'child' });
  });
});
