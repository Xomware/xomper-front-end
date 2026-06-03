import { Component, Input, OnInit } from '@angular/core'
import { trigger, state, style, animate, transition } from '@angular/animations'
import { ToastService, ToastHandler } from 'src/app/services/toast.service'
import { NgIf, NgClass } from '@angular/common';

@Component({
    selector: 'app-toast',
    templateUrl: './toast.component.html',
    styleUrls: ['./toast.component.scss'],
    animations: [
        trigger('fade', [
            state('void', style({ opacity: 0 })),
            transition(':enter', [animate('500ms ease-in')]),
            transition(':leave', [animate('500ms ease-out')]),
        ]),
    ],
    standalone: true,
    imports: [NgIf, NgClass],
})
export class ToastComponent implements OnInit, ToastHandler {
  @Input() toastType: 'positive' | 'negative' = 'positive'
  message = ''
  isVisible = false

  constructor(private toastService: ToastService) {}

  ngOnInit(): void {
    this.toastService.registerToast(this)
  }

  showToast(msg: string): void {
    this.message = msg
    this.isVisible = true

    setTimeout(() => {
      this.isVisible = false
      this.message = ''
    }, 3000)
  }
}
