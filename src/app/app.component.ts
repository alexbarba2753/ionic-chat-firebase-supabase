import { Component } from '@angular/core';
import { IonApp, IonRouterOutlet } from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  cameraOutline,
  chatbubblesOutline,
  flameOutline,
  logoGoogle,
  logOutOutline,
  radioButtonOn,
  serverOutline,
  syncOutline,
} from 'ionicons/icons';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  imports: [IonApp, IonRouterOutlet],
})
export class AppComponent {
  constructor() {
    addIcons({
      cameraOutline,
      chatbubblesOutline,
      flameOutline,
      logoGoogle,
      logOutOutline,
      radioButtonOn,
      serverOutline,
      syncOutline,
    });
  }
}
