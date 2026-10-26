import { useEffect, useState, type ReactElement } from 'react';
import { t, type AppLanguage } from '../../shared/i18n';

export function TodoStreak({ completed, remaining, language, visible = true }: {
  completed: number;
  remaining: number;
  language: AppLanguage;
  visible?: boolean;
}): ReactElement {
  const [phase, setPhase] = useState<'completed' | 'remaining'>('completed');

  useEffect(() => {
    let timer: number | undefined;
    const updateVisibility = (): void => {
      window.clearInterval(timer);
      timer = undefined;
      if (visible && !document.hidden) {
        timer = window.setInterval(() => {
          setPhase((current) => current === 'completed' ? 'remaining' : 'completed');
        }, 4000);
      }
    };
    updateVisibility();
    document.addEventListener('visibilitychange', updateVisibility);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', updateVisibility);
    };
  }, [visible]);

  return (
    <span className="todo-panel__streak">
      <span key={phase} className="todo-panel__streak-text">
        {phase === 'completed'
          ? t(language, 'todo.completedToday', { count: completed })
          : t(language, 'todo.remainingToday', { count: remaining })}
      </span>
    </span>
  );
}
