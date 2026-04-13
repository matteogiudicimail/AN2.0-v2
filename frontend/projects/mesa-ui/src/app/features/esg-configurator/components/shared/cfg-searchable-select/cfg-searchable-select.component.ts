import {
  Component, ElementRef, EventEmitter, HostListener,
  Input, OnChanges, Output, SimpleChanges, ViewChild,
} from '@angular/core';

export interface SearchableSelectItem {
  value:    string;
  label:    string;
  group?:   string;
  badge?:   string;   // e.g. 'VIEW'
  disabled?: boolean;
}

@Component({
  selector: 'cfg-searchable-select',
  templateUrl: './cfg-searchable-select.component.html',
})
export class CfgSearchableSelectComponent implements OnChanges {
  /** Full list of items to display. */
  @Input() items: SearchableSelectItem[] = [];
  /** Currently selected value (two-way binding via (selectionChange)). */
  @Input() value: string | null = null;
  /** Placeholder shown when nothing is selected. */
  @Input() placeholder = 'Select…';
  /** When true the dropdown is disabled. */
  @Input() disabled = false;
  /** Optional ARIA label for the trigger button. */
  @Input() ariaLabel = '';

  @Output() selectionChange = new EventEmitter<string | null>();

  @ViewChild('searchInput') searchInputRef?: ElementRef<HTMLInputElement>;

  isOpen     = false;
  searchText = '';
  focusIndex = -1;

  get selectedLabel(): string {
    const found = this.items.find(i => i.value === this.value);
    return found ? found.label : '';
  }

  get filteredItems(): SearchableSelectItem[] {
    const q = this.searchText.toLowerCase().trim();
    if (!q) return this.items;
    return this.items.filter(i =>
      i.label.toLowerCase().includes(q) ||
      (i.group ?? '').toLowerCase().includes(q)
    );
  }

  get groups(): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const item of this.filteredItems) {
      const g = item.group ?? '';
      if (!seen.has(g)) { seen.add(g); out.push(g); }
    }
    return out;
  }

  itemsForGroup(group: string): SearchableSelectItem[] {
    return this.filteredItems.filter(i => (i.group ?? '') === group);
  }

  hasGroups(): boolean {
    return this.items.some(i => !!i.group);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['items']) { this.focusIndex = -1; }
  }

  open(): void {
    if (this.disabled) return;
    this.isOpen     = true;
    this.searchText = '';
    this.focusIndex = -1;
    setTimeout(() => this.searchInputRef?.nativeElement.focus(), 0);
  }

  close(): void {
    this.isOpen     = false;
    this.searchText = '';
    this.focusIndex = -1;
  }

  toggle(): void {
    this.isOpen ? this.close() : this.open();
  }

  select(item: SearchableSelectItem): void {
    if (item.disabled) return;
    this.value = item.value;
    this.selectionChange.emit(item.value);
    this.close();
  }

  clear(event: MouseEvent): void {
    event.stopPropagation();
    this.value = null;
    this.selectionChange.emit(null);
  }

  @HostListener('document:keydown', ['$event'])
  onKeyDown(e: KeyboardEvent): void {
    if (!this.isOpen) return;
    const flat = this.filteredItems.filter(i => !i.disabled);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      this.focusIndex = Math.min(this.focusIndex + 1, flat.length - 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      this.focusIndex = Math.max(this.focusIndex - 1, 0);
    } else if (e.key === 'Enter' && this.focusIndex >= 0) {
      e.preventDefault();
      this.select(flat[this.focusIndex]);
    } else if (e.key === 'Escape') {
      this.close();
    }
  }

  @HostListener('document:click', ['$event'])
  onDocClick(e: MouseEvent): void {
    if (!this.isOpen) return;
    const target = e.target as HTMLElement;
    if (!target.closest('cfg-searchable-select')) { this.close(); }
  }

  isFocused(item: SearchableSelectItem): boolean {
    const flat = this.filteredItems.filter(i => !i.disabled);
    return this.focusIndex >= 0 && flat[this.focusIndex]?.value === item.value;
  }

  trackByValue(_: number, item: SearchableSelectItem): string { return item.value; }
  trackByGroup(_: number, g: string): string { return g; }
}
