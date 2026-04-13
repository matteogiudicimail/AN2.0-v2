import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private _dark = false;

  constructor() {
    const saved = localStorage.getItem('mesa_theme');
    this._dark = saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches);
    this.apply();
  }

  get dark(): boolean { return this._dark; }

  toggle(): void {
    this._dark = !this._dark;
    localStorage.setItem('mesa_theme', this._dark ? 'dark' : 'light');
    this.apply();
  }

  private apply(): void {
    document.body.classList.toggle('dark', this._dark);
  }
}
