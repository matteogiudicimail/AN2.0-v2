import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { InputData } from 'cfs-report';

@Component({
  selector: 'app-report-page',
  templateUrl: './report-page.component.html',
})
export class ReportPageComponent implements OnInit {
  inputData: InputData = {
    token:      '',
    apiBaseUrl: 'http://localhost:3000/api',
    role:       'Admin',
    userId:     'dev-user',
  };

  isReady = false;

  constructor(private route: ActivatedRoute) {}

  ngOnInit(): void {
    const reportIdParam = this.route.snapshot.paramMap.get('reportId');
    if (reportIdParam) {
      const reportId = Number(reportIdParam);
      if (reportId > 0) this.inputData = { ...this.inputData, reportId };
    }

    const taskIdParam = this.route.snapshot.paramMap.get('taskId');
    if (taskIdParam) {
      const taskId = Number(taskIdParam);
      if (taskId > 0) this.inputData = { ...this.inputData, taskId };
    }

    fetch('http://localhost:3000/api/auth/dev-token')
      .then((r) => r.json())
      .then((data: { token: string }) => {
        this.inputData = { ...this.inputData, token: data.token };
        this.isReady = true;
      })
      .catch(() => {
        console.warn('[dev-shell] Could not fetch dev token from backend.');
        this.isReady = true;
      });
  }
}
