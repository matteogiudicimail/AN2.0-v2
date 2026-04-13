import { Component, EventEmitter, Input, Output } from '@angular/core';
import { User } from '../../../core/models/grid.model';

@Component({
  selector: 'app-topbar',
  templateUrl: './topbar.component.html',
  styleUrls: ['./topbar.component.scss'],
})
export class TopbarComponent {
  @Input() user: User | null = null;
  @Input() activeNav = 'HTML Grid';
  @Output() logoutClicked = new EventEmitter<void>();
}
