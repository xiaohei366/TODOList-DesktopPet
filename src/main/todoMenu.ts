import type { MenuItemConstructorOptions } from 'electron';
import type { I18nKey } from '../shared/i18n';
import type { TodoItem, TodoMenuAction, TodoSubTask, SubTaskMenuAction } from '../shared/types';

type Translate = (key: I18nKey) => string;

export function buildTodoMenuTemplate(item: TodoItem, tr: Translate, send: (action: TodoMenuAction) => void): MenuItemConstructorOptions[] {
  if (item.suspended || item.completed) {
    return [
      {
        label: item.suspended ? tr('menu.restore') : tr('menu.markActive'),
        click: () => send({ type: item.suspended ? 'toggle-suspended' : 'toggle-completed', id: item.id })
      },
      { type: 'separator' },
      {
        label: tr('menu.delete'),
        click: () => send({ type: 'delete', id: item.id })
      }
    ];
  }
  return [
    {
      label: tr('menu.edit'),
      click: () => send({ type: 'edit', id: item.id })
    },
    {
      label: tr('focus.enter'),
      click: () => send({ type: 'enter-focus', id: item.id })
    },
    { type: 'separator' },
    {
      label: item.completed ? tr('menu.markActive') : tr('menu.markDone'),
      click: () => send({ type: 'toggle-completed', id: item.id })
    },
    {
      label: item.deadline ? tr('menu.changeDeadline') : tr('menu.setDeadline'),
      click: () => send({ type: 'set-deadline', id: item.id })
    },
    {
      label: tr('menu.adjustStatus'),
      submenu: [
        { label: tr('menu.suspend'), click: () => send({ type: 'toggle-suspended', id: item.id }) },
        { label: item.highlighted ? tr('menu.unmarkRed') : tr('menu.markRed'), click: () => send({ type: 'toggle-highlighted', id: item.id }) }
      ]
    },
    {
      label: tr('menu.adjustPriority'),
      enabled: !item.completed,
      submenu: [
        {
          label: tr('menu.moveUp'),
          click: () => send({ type: 'move-up', id: item.id })
        },
        {
          label: tr('menu.moveDown'),
          click: () => send({ type: 'move-down', id: item.id })
        }
      ]
    },
    { type: 'separator' },
    {
      label: tr('menu.editNotes'),
      click: () => send({ type: 'edit-notes', id: item.id })
    },
    {
      label: tr('menu.editTag'),
      click: () => send({ type: 'edit-tag', id: item.id })
    },
    {
      label: tr('menu.addSubTask'),
      click: () => send({ type: 'add-sub-task', id: item.id })
    },
    { type: 'separator' },
    {
      label: tr('menu.delete'),
      click: () => send({ type: 'delete', id: item.id })
    }
  ];
}

export function buildSubTaskMenuTemplate(parentId: string, sub: TodoSubTask, tr: Translate, send: (action: SubTaskMenuAction) => void): MenuItemConstructorOptions[] {
  if (sub.completed) {
    return [
      { label: tr('menu.markActive'), click: () => send({ type: 'toggle-completed', parentId, subTaskId: sub.id }) },
      { type: 'separator' },
      { label: tr('menu.delete'), click: () => send({ type: 'delete', parentId, subTaskId: sub.id }) }
    ];
  }
  return [
    {
      label: tr('menu.edit'),
      click: () => send({ type: 'edit', parentId, subTaskId: sub.id })
    },
    {
      label: tr('focus.enter'),
      click: () => send({ type: 'enter-focus', parentId, subTaskId: sub.id })
    },
    { type: 'separator' },
    {
      label: sub.completed ? tr('menu.markActive') : tr('menu.markDone'),
      click: () => send({ type: 'toggle-completed', parentId, subTaskId: sub.id })
    },
    {
      label: sub.deadline ? tr('menu.changeDeadline') : tr('menu.setDeadline'),
      click: () => send({ type: 'set-deadline', parentId, subTaskId: sub.id })
    },
    {
      label: tr('menu.adjustPriority'),
      enabled: !sub.completed,
      submenu: [
        {
          label: tr('menu.moveUp'),
          click: () => send({ type: 'move-up', parentId, subTaskId: sub.id })
        },
        {
          label: tr('menu.moveDown'),
          click: () => send({ type: 'move-down', parentId, subTaskId: sub.id })
        }
      ]
    },
    { type: 'separator' },
    {
      label: tr('menu.delete'),
      click: () => send({ type: 'delete', parentId, subTaskId: sub.id })
    }
  ];
}
