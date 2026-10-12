import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, test, beforeEach, afterEach } from 'vitest';
import { TodoMarkdownStore, formatDateKey, selectVisibleTodos } from '../src/main/todoStore';

describe('TodoMarkdownStore', () => {
  let dir: string;
  let file: string;
  const today = new Date(2026, 4, 11);

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'tolist-todos-'));
    file = join(dir, 'todos.md');
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  test('adds a first item into a human-readable year month day markdown section', async () => {
    const store = new TodoMarkdownStore(file, () => today);

    const item = await store.add('Review PR');

    expect(item).toMatchObject({
      date: '2026-05-11',
      text: 'Review PR',
      completed: false,
      highlighted: false,
      overdue: false
    });
    await expect(readFile(file, 'utf8')).resolves.toBe(
      '# 2026\n\n## 2026-05\n\n### 2026-05-11 Monday\n\n- [ ] Review PR\n'
    );
  });

  test('parses highlighted completed items and selects overdue plus today items', async () => {
    await writeFile(
      file,
      [
        '# 2026',
        '',
        '## 2026-05',
        '',
        '### 2026-05-10 Sunday',
        '',
        '- [ ] [!] Pay bill',
        '- [x] ~~Old done~~',
        '',
        '### 2026-05-11 Monday',
        '',
        '- [ ] Write tests',
        '- [x] ~~Ship build~~',
        ''
      ].join('\n'),
      'utf8'
    );
    const store = new TodoMarkdownStore(file, () => today);

    const items = await store.listAll();
    const visible = selectVisibleTodos(items, formatDateKey(today));

    expect(visible.map((item) => item.text)).toEqual(['Pay bill', 'Write tests', 'Ship build']);
    expect(visible[0]).toMatchObject({ highlighted: true, overdue: true, completed: false });
    expect(visible[2]).toMatchObject({ completed: true, overdue: false });
  });

  test('marks an item complete with strikethrough and moves it to the end of its day', async () => {
    const store = new TodoMarkdownStore(file, () => today);
    const first = await store.add('First');
    await store.add('Second');

    await store.setCompleted(first.id, true);

    await expect(readFile(file, 'utf8')).resolves.toContain(
      '### 2026-05-11 Monday\n\n- [ ] Second\n- [x] [done:2026-05-11] ~~First~~\n'
    );
  });

  test('suspends and restores a todo across reloads without losing its details', async () => {
    const store = new TodoMarkdownStore(file, () => today);
    const first = await store.add('First', '2026-05-12');
    await store.updateTag(first.id, 'Work');
    await store.updateNotes(first.id, 'Keep this note');
    await store.setHighlighted(first.id, true);
    await store.addSubTask(first.id, 'Child');
    const second = await store.add('Second');
    await store.reorderVisible([first.id, second.id]);

    const suspended = await store.setSuspended(first.id, true);
    expect(suspended).toMatchObject({
      id: first.id, suspended: true, completed: false, highlighted: true,
      tag: 'Work', notes: 'Keep this note', deadline: '2026-05-12'
    });
    expect(suspended.completedDate).toBeUndefined();
    expect(suspended.displayOrder).toBeUndefined();
    expect(suspended.subTasks).toEqual([{ id: `${first.id}::0`, text: 'Child', completed: false, displayOrder: 1 }]);
    await expect(readFile(file, 'utf8')).resolves.toContain('- [-] [ddl:2026-05-12] [tag:Work] [!] ~~First~~');

    const reloaded = new TodoMarkdownStore(file, () => today);
    expect((await reloaded.list()).map((todo) => todo.text)).toEqual(['Second', 'First']);
    await reloaded.reorderVisible([first.id, second.id]);
    expect((await reloaded.list()).map((todo) => todo.text)).toEqual(['Second', 'First']);

    const restored = await reloaded.setSuspended(first.id, false);
    expect(restored).toMatchObject({ suspended: false, completed: false, text: 'First', tag: 'Work', highlighted: true });
    expect(restored.subTasks[0].completed).toBe(false);
    const markdown = await readFile(file, 'utf8');
    expect(markdown).toContain('- [ ] [ddl:2026-05-12] [tag:Work] [!] First');
    expect(markdown).not.toContain('- [-]');
    expect(markdown).not.toContain('~~First~~');
  });

  test('keeps suspended todos visible across days and restores overdue state', async () => {
    const store = new TodoMarkdownStore(file, () => today);
    const first = await store.add('Paused');
    await store.setSuspended(first.id, true);
    const nextDay = new TodoMarkdownStore(file, () => new Date(2026, 4, 12));
    const active = await nextDay.add('Active');
    const visible = await nextDay.list();
    expect(visible.map((todo) => todo.id)).toEqual([active.id, first.id]);
    expect(visible[1]).toMatchObject({ suspended: true, overdue: false });
    expect(await nextDay.setSuspended(first.id, false)).toMatchObject({ suspended: false, completed: false, overdue: true });
  });

  test('completion and suspension are mutually exclusive and undo completion restores an active todo', async () => {
    const store = new TodoMarkdownStore(file, () => today);
    const first = await store.add('First');
    await store.setSuspended(first.id, true);
    expect(await store.setCompleted(first.id, true)).toMatchObject({ suspended: false, completed: true, completedDate: '2026-05-11' });
    expect(await store.setCompleted(first.id, false)).toMatchObject({ suspended: false, completed: false, completedDate: undefined });
    expect(await store.setSuspended(first.id, true)).toMatchObject({ suspended: true, completed: false, completedDate: undefined });
  });

  test('records completion date and keeps legacy completions visible when finished today', async () => {
    await writeFile(
      file,
      [
        '# 2026',
        '',
        '## 2026-05',
        '',
        '### 2026-05-10 Sunday',
        '',
        '- [ ] Legacy',
        ''
      ].join('\n'),
      'utf8'
    );
    const store = new TodoMarkdownStore(file, () => today);
    const legacy = (await store.list())[0];

    const completed = await store.setCompleted(legacy.id, true);

    expect(completed).toMatchObject({
      date: '2026-05-10',
      completed: true,
      completedDate: '2026-05-11'
    });
    expect((await store.list()).map((item) => item.text)).toEqual(['Legacy']);
    await expect(readFile(file, 'utf8')).resolves.toContain('- [x] [done:2026-05-11] ~~Legacy~~');
  });

  test('toggles highlighted marker without losing completion state', async () => {
    const store = new TodoMarkdownStore(file, () => today);
    const item = await store.add('Important');
    const completed = await store.setCompleted(item.id, true);

    await store.setHighlighted(completed.id, true);

    await expect(readFile(file, 'utf8')).resolves.toContain('- [x] [done:2026-05-11] [!] ~~Important~~');
  });

  test('updates todo text while preserving date markers and display order', async () => {
    const store = new TodoMarkdownStore(file, () => today);
    const item = await store.add('Original');
    await store.setHighlighted(item.id, true);
    const visible = await store.list();
    await store.reorderVisible([visible[0].id]);

    const updated = await store.updateText((await store.list())[0].id, 'Renamed task');

    expect(updated).toMatchObject({
      date: '2026-05-11',
      text: 'Renamed task',
      highlighted: true,
      displayOrder: 1
    });
    await expect(readFile(file, 'utf8')).resolves.toContain('- [ ] [order:1] [!] Renamed task');
  });

  test('parses, updates, and removes todo tag markers', async () => {
    await writeFile(
      file,
      [
        '# 2026',
        '',
        '## 2026-05',
        '',
        '### 2026-05-11 Monday',
        '',
        '- [ ] [tag:工作] Tagged todo',
        ''
      ].join('\n'),
      'utf8'
    );
    const store = new TodoMarkdownStore(file, () => today);
    const item = (await store.list())[0];

    expect(item).toMatchObject({ text: 'Tagged todo', tag: '工作' });

    const updated = await store.updateTag(item.id, '生活');
    expect(updated).toMatchObject({ tag: '生活' });
    await expect(readFile(file, 'utf8')).resolves.toContain('- [ ] [tag:生活] Tagged todo');

    await store.updateTag((await store.list())[0].id, undefined);
    const content = await readFile(file, 'utf8');
    expect(content).toContain('- [ ] Tagged todo');
    expect(content).not.toContain('[tag:');
  });

  test('preserves todo tag across mutations and keeps subtasks untagged', async () => {
    const store = new TodoMarkdownStore(file, () => today);
    const item = await store.add('Original');
    await store.updateTag(item.id, '工作');
    const tagged = (await store.list())[0];
    await store.addSubTask(tagged.id, 'Sub task');
    const withSub = (await store.list())[0];
    await store.setDeadline(withSub.id, '2026-05-12');
    const withDeadline = (await store.list())[0];
    await store.setHighlighted(withDeadline.id, true);
    const highlighted = (await store.list())[0];
    const renamed = await store.updateText(highlighted.id, 'Renamed');

    expect(renamed).toMatchObject({ tag: '工作', text: 'Renamed', deadline: '2026-05-12', highlighted: true });
    const completed = await store.setCompleted(renamed.id, true);
    expect(completed).toMatchObject({ tag: '工作', completed: true });
    const content = await readFile(file, 'utf8');
    expect(content).toContain('- [x] [ddl:2026-05-12] [tag:工作] [done:2026-05-11] [!] ~~Renamed~~');
    expect(content).toContain('  - [ ] Sub task');
    expect(content).not.toContain('  - [ ] [tag:');
  });

  test('reorders only active items within one day and keeps completed items last', async () => {
    const store = new TodoMarkdownStore(file, () => today);
    const first = await store.add('First');
    const second = await store.add('Second');
    const third = await store.add('Third');
    await store.setCompleted(second.id, true);
    const active = (await store.list()).filter((item) => !item.completed);

    await store.reorder('2026-05-11', [active.find((item) => item.text === 'Third')!.id, first.id]);

    const content = await readFile(file, 'utf8');
    expect(content).toContain('- [ ] Third\n- [ ] First\n- [x] [done:2026-05-11] ~~Second~~');
    expect((await store.list()).map((item) => item.text)).toEqual(['Third', 'First', 'Second']);
  });

  test('reorders visible active todos across overdue and today without changing dates', async () => {
    await writeFile(
      file,
      [
        '# 2026',
        '',
        '## 2026-05',
        '',
        '### 2026-05-10 Sunday',
        '',
        '- [ ] Yesterday',
        '',
        '### 2026-05-11 Monday',
        '',
        '- [ ] Today',
        ''
      ].join('\n'),
      'utf8'
    );
    const store = new TodoMarkdownStore(file, () => today);
    const visible = await store.list();

    await store.reorderVisible([visible.find((item) => item.text === 'Today')!.id, visible[0].id]);

    const nextVisible = await store.list();
    expect(nextVisible.map((item) => item.text)).toEqual(['Today', 'Yesterday']);
    expect(nextVisible.map((item) => item.date)).toEqual(['2026-05-11', '2026-05-10']);
    await expect(readFile(file, 'utf8')).resolves.toContain('- [ ] [order:1] Today');
    await expect(readFile(file, 'utf8')).resolves.toContain('- [ ] [order:2] Yesterday');
  });

  test('deletes a todo by removing the markdown line', async () => {
    const store = new TodoMarkdownStore(file, () => today);
    const item = await store.add('Remove me');
    await store.add('Keep me');

    await store.delete(item.id);

    const content = await readFile(file, 'utf8');
    expect(content).not.toContain('Remove me');
    expect(content).toContain('Keep me');
  });

  test('imports markdown by merging non-duplicate todos', async () => {
    const store = new TodoMarkdownStore(file, () => today);
    await store.add('Keep me');
    const importFile = join(dir, 'import.md');
    await writeFile(
      importFile,
      [
        '# 2026',
        '',
        '## 2026-05',
        '',
        '### 2026-05-11 Monday',
        '',
        '- [ ] Keep me',
        '- [ ] New imported',
        '',
        '### 2026-05-10 Sunday',
        '',
        '- [x] [done:2026-05-11] ~~Imported done~~',
        ''
      ].join('\n'),
      'utf8'
    );

    const result = await store.importMarkdown(importFile);

    expect(result).toEqual({ added: 2, skipped: 1 });
    expect((await store.listAll()).map((item) => item.text).sort()).toEqual(
      ['Imported done', 'Keep me', 'New imported'].sort()
    );
  });

  test('keeps todo ids stable when completing a todo above them (focus queue scenario)', async () => {
    const store = new TodoMarkdownStore(file, () => today);
    const first = await store.add('First');
    const second = await store.add('Second');
    const third = await store.add('Third');

    await store.setCompleted(first.id, true);
    const afterFirst = await store.list();
    const secondId = afterFirst.find((item) => item.text === 'Second')!.id;
    const thirdId = afterFirst.find((item) => item.text === 'Third')!.id;
    expect(secondId).toBe(second.id);
    expect(thirdId).toBe(third.id);

    await store.setCompleted(secondId, true);
    const afterSecond = await store.list();
    expect(afterSecond.find((item) => item.text === 'Third')!.id).toBe(third.id);
  });

  test('keeps a todo id stable when toggling its highlight and completion flags', async () => {
    const store = new TodoMarkdownStore(file, () => today);
    const item = await store.add('Stable id');
    const other = await store.add('Other');

    await store.setHighlighted(item.id, true);
    const highlighted = (await store.list()).find((entry) => entry.text === 'Stable id')!;
    expect(highlighted.id).toBe(item.id);

    const completed = await store.setCompleted(highlighted.id, true);
    expect(completed.id).toBe(item.id);
    const reopened = await store.setCompleted(completed.id, false);
    expect(reopened.id).toBe(item.id);
    expect((await store.list()).find((entry) => entry.text === 'Other')!.id).toBe(other.id);
  });

  test('keeps existing todo ids stable when adding new todos', async () => {
    const store = new TodoMarkdownStore(file, () => today);
    const first = await store.add('First');
    await store.add('Second');

    const visible = await store.list();
    expect(visible.find((item) => item.text === 'First')!.id).toBe(first.id);
  });

  test('assigns distinct ids to duplicate todos with the same text on one day', async () => {
    const store = new TodoMarkdownStore(file, () => today);
    const first = await store.add('Same text');
    const second = await store.add('Same text');

    expect(first.id).not.toBe(second.id);
  });
});
