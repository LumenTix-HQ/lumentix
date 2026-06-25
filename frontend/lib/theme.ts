export type Theme = 'light' | 'dark';

export function toggle_color_theme(current: Theme): Theme {
  return current === 'light' ? 'dark' : 'light';
}

export function persist_theme_preference(theme: Theme): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem('theme', theme);
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }
}

export function apply_dark_theme_styles(theme: Theme): void {
  if (typeof window !== 'undefined') {
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }
}

export function get_saved_theme(): Theme {
  if (typeof window === 'undefined') return 'light';
  return (localStorage.getItem('theme') as Theme) ?? 'light';
}
