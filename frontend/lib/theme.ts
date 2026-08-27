export type Theme = 'light' | 'dark';

export function toggle_color_theme(current: Theme): Theme {
  return current === 'light' ? 'dark' : 'light';
}

export function toggle_theme(current?: Theme): Theme {
  const active = current ?? get_saved_theme();
  const next = active === 'light' ? 'dark' : 'light';
  persist_theme_preference(next);
  apply_theme_tokens(next);
  return next;
}

export function persist_theme_preference(theme: Theme): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem('theme', theme);
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }
}

export function apply_theme_tokens(theme: Theme): void {
  if (typeof window !== 'undefined') {
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.classList.toggle('dark', theme === 'dark');
    if (theme === 'dark') {
      document.documentElement.style.setProperty('--bg-primary', '#0f172a');
      document.documentElement.style.setProperty('--text-primary', '#f8fafc');
      document.documentElement.style.setProperty('--border-color', '#334155');
      document.documentElement.style.setProperty('--card-bg', '#1e293b');
    } else {
      document.documentElement.style.setProperty('--bg-primary', '#ffffff');
      document.documentElement.style.setProperty('--text-primary', '#0f172a');
      document.documentElement.style.setProperty('--border-color', '#e2e8f0');
      document.documentElement.style.setProperty('--card-bg', '#ffffff');
    }
  }
}

export function apply_dark_theme_styles(theme: Theme): void {
  apply_theme_tokens(theme);
}

export function get_saved_theme(): Theme {
  if (typeof window === 'undefined') return 'light';
  return (localStorage.getItem('theme') as Theme) ?? 'light';
}

