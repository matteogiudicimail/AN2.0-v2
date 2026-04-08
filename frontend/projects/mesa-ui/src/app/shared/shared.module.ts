import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClientModule } from '@angular/common/http';
import { TranslateModule } from '@ngx-translate/core';
import { SidebarComponent }      from './components/sidebar/sidebar.component';
import { ActionBarComponent }    from './components/action-bar/action-bar.component';
import { CommentModalComponent } from './components/comment-modal/comment-modal.component';

@NgModule({
  declarations: [SidebarComponent, ActionBarComponent, CommentModalComponent],
  imports: [CommonModule, FormsModule, HttpClientModule, TranslateModule],
  exports: [CommonModule, FormsModule, HttpClientModule, TranslateModule, SidebarComponent, ActionBarComponent, CommentModalComponent],
})
export class SharedModule {}
