import { Io } from '@cisl/io/io';
import { RabbitMessage } from '@cisl/io/types';
import { DisplayWindow } from './display-window';
import { ResponseContent } from './types';

export interface DeviceEmulationOptions {
  screenPosition: 'desktop' | 'mobile';
  screenSize: {
    width: number;
    height: number;
  };
  viewPosition: {
    x: number;
    y: number;
  };
  deviceScaleFactor: number;
  viewSize: {
    width: number;
    height: number;
  };
  scale: number;
}

export interface ViewObjectOptions {
  url: string;
  width: string;
  height: string;
  left?: number;
  top?: number;
  position?: {
    gridLeft: number;
    gridTop: number;
  };
  slide?: {
    direction: 'left' | 'right' | 'down' | 'up';
    cascade: boolean;
  };
  uiDraggable: boolean;
  uiClosable: boolean;
  nodeIntegration: boolean;
  deviceEmulation?: {
    screenPosition?: 'mobile' | 'desktop';
    screenSize?: {
      height: number;
      width: number;
    };
    viewPosition?: {
      x: number;
      y: number;
    };
    deviceScaleFactor?: number;
    viewSize?: {
      height: number;
      width: number;
    };
    scale: number;
  };
}

export interface ViewObjectRequestResponse {
  command: string;
  status: string;
  viewId: string;
}

/**
 * Class representing the ViewObject
 * @class ViewObject
 */
export class ViewObject {
  private io: Io;

  public viewId: string;

  public displayName: string;

  private window: DisplayWindow;

  public windowName: string;

  private displayContextName: string;

  constructor(
    io: Io,
    window: DisplayWindow,
    options: {
      viewId: string;
      displayName: string;
      displayContextName: string;
      windowName: string;
    },
  ) {
    if (!io.rabbit) {
      throw new Error('Could not find RabbitMQ instance');
    }
    this.io = io;
    this.viewId = options.viewId;
    this.displayName = options.displayName;
    this.displayContextName = options.displayContextName;
    this.window = window;
    this.windowName = window.windowName;
  }

  private async _postRequest<T = any>(data: {
    command: string;
    options: { viewId: string; [key: string]: unknown };
  }): Promise<T> {
    const res = await this.io.rabbit.publishRpc(
      `rpc-display-${this.displayName}`,
      data,
    );
    if (typeof res.content !== 'object' || Buffer.isBuffer(res.content)) {
      throw new Error('Invalid expected response');
    }
    return res.content as unknown as T;
  }

  /**
   * Sets the url of the view object
   * @param {String} url
   * @returns {display_rpc_result}
   */
  setUrl(url: string): Promise<object> {
    const cmd = {
      command: 'set-url',
      options: {
        viewId: this.viewId,
        url: url,
      },
    };
    return this._postRequest(cmd);
  }

  /**
   * gets the current url of the view object
   * @returns {Promise}
   */
  getUrl(): Promise<object> {
    const cmd = {
      command: 'get-url',
      options: {
        viewId: this.viewId,
      },
    };
    return this._postRequest(cmd);
  }

  /**
   * sets the css style string
   * @returns {display_rpc_result}
   */
  setCSSStyle(cssText: string): Promise<object> {
    const cmd = {
      command: 'set-webview-css-style',
      options: {
        viewId: this.viewId,
        cssText: cssText,
      },
    };
    return this._postRequest(cmd);
  }

  /**
   * enables device emulation
   * @param {Object} options http://electron.atom.io/docs/api/web-contents/#contentsenabledeviceemulationparameters
   * @returns {display_rpc_result}
   */
  enableDeviceEmulation(options: DeviceEmulationOptions): Promise<object> {
    const cmd = {
      command: 'enable-device-emulation',
      options: {
        viewId: this.viewId,
        parameters: options,
      },
    };
    return this._postRequest(cmd);
  }

  /**
   * disables device emulation
   * @returns {display_rpc_result}
   */
  disableDeviceEmulation(): Promise<object> {
    const cmd = {
      command: 'disable-device-emulation',
      options: {
        viewId: this.viewId,
      },
    };
    return this._postRequest(cmd);
  }

  /**
   * reloads the view object
   * @returns {display_rpc_result}
   */
  async reload(): Promise<ViewObjectRequestResponse> {
    const cmd = {
      command: 'reload',
      options: {
        viewId: this.viewId,
      },
    };
    return this._postRequest<ViewObjectRequestResponse>(cmd);
  }

  /**
   * hides the view object
   * @returns {display_rpc_result}
   */
  hide(): Promise<object> {
    const cmd = {
      command: 'hide',
      options: {
        viewId: this.viewId,
      },
    };
    return this._postRequest(cmd);
  }

  /**
   * shows the view object
   * @returns {display_rpc_result}
   */
  show(): Promise<object> {
    const cmd = {
      command: 'show',
      options: {
        viewId: this.viewId,
      },
    };
    return this._postRequest(cmd);
  }

  /**
   * closes the view object
   * @returns {display_rpc_result}
   */
  close(): Promise<object> {
    const cmd = {
      command: 'close',
      options: {
        viewId: this.viewId,
      },
    };
    return this._postRequest(cmd);
  }

  /**
   * setBounds the view object
   * @param {Object} options
   * @returns {display_rpc_result}
   */
  setBounds(options: {
    gridLeft?: number;
    gridTop?: number;
    left?: number;
    top?: number;
    widthFactor?: number;
    width?: number;
    heightFactor?: number;
    height?: number;
  }): Promise<object> {
    // if(options.scaleContent){
    //     let w = parseFloat(options.width)
    //     let h = parseFloat(options.height)
    //     let dia = Math.sqrt( Math.pow(w,2) + Math.pow(h,2) )
    //     options.scale = dia * 1.0 /this.o_diagonal
    // }
    console.log(this.window.uniformGridCellSize);
    if (options.gridLeft) {
      options.left = this.window.uniformGridCellSize.width * (options.gridLeft - 1);
      delete options.gridLeft;
    }
    if (options.gridTop) {
      options.top = this.window.uniformGridCellSize.height * (options.gridTop - 1);
      delete options.gridTop;
    }
    if (options.widthFactor) {
      options.width =
        this.window.uniformGridCellSize.width * options.widthFactor;
      delete options.widthFactor;
    }
    if (options.heightFactor) {
      options.height =
        this.window.uniformGridCellSize.height * options.heightFactor;
      delete options.heightFactor;
    }
    console.log(options);
    const cmd = {
      command: 'set-bounds',
      options: {
        ...options,
        viewId: this.viewId,
      },
    };
    return this._postRequest(cmd);
  }

  /**
   * gets the bounds of the view object
   * @returns {display_rpc_result}
   */
  getBounds(): Promise<object> {
    const cmd = {
      command: 'get-bounds',
      options: {
        viewId: this.viewId,
      },
    };
    return this._postRequest(cmd);
  }

  /**
   * navigates back if available
   * @returns {display_rpc_result}
   */
  goBack(): Promise<object> {
    const cmd = {
      command: 'back',
      options: {
        viewId: this.viewId,
      },
    };
    return this._postRequest(cmd);
  }

  /**
   * navigates forward if available
   * @returns {display_rpc_result}
   */
  goForward(): Promise<object> {
    const cmd = {
      command: 'forward',
      options: {
        viewId: this.viewId,
      },
    };
    return this._postRequest(cmd);
  }

  /**
   * opens debug console
   * @returns {display_rpc_result}
   */
  openDevTools(): Promise<object> {
    const cmd = {
      command: 'view-object-dev-tools',
      options: {
        viewId: this.viewId,
        devTools: true,
      },
    };
    return this._postRequest(cmd);
  }

  /**
   * closes debug console
   * @returns {display_rpc_result}
   */
  closeDevTools(): Promise<object> {
    const cmd = {
      command: 'view-object-dev-tools',
      options: {
        viewId: this.viewId,
        devTools: false,
      },
    };
    return this._postRequest(cmd);
  }

  /**
   * sets audio muted
   * @param {boolean} mute
   * @returns {display_rpc_result}
   */
  setAudioMuted(mute: boolean): Promise<object> {
    const cmd = {
      command: 'set-audio-muted',
      options: {
        viewId: this.viewId,
        audio: mute,
      },
    };
    return this._postRequest(cmd);
  }

  /**
   * gets if audio muted
   * @returns {display_rpc_result}
   */
  isAudioMuted(): Promise<object> {
    const cmd = {
      command: 'get-audio-muted',
      options: {
        viewId: this.viewId,
      },
    };
    return this._postRequest(cmd);
  }

  private _on(topic: string, handler: (response: RabbitMessage) => void): void {
    this.io.rabbit
      .onTopic(topic, (response) => {
        if (
          Buffer.isBuffer(response.content) ||
          typeof response.content !== 'object'
        ) {
          throw new Error('invalid response received');
        }
        if (
          handler != null &&
          (response.content as ResponseContent).details.viewId == this.viewId
        ) {
          handler(response);
        }
      })
      .catch(() => {
        /* pass */
      });
  }

  /**
   * viewObject hidden event
   * @param {viewObjectBasicEventCallback} handler
   */
  onHidden(handler: (response: RabbitMessage) => void): void {
    this._on(
      `display.${this.displayContextName}.viewObjectHidden.${this.viewId}`,
      handler,
    );
  }

  /**
   * viewObject became visible event
   * @param {viewObjectBasicEventCallback} handler
   */
  onShown(handler: (response: RabbitMessage) => void): void {
    this._on(
      `display.${this.displayContextName}.viewObjectShown.${this.viewId}`,
      handler,
    );
  }

  /**
   * viewObject closed event
   * @param {viewObjectBasicEventCallback} handler
   */
  onClosed(handler: (response: RabbitMessage) => void): void {
    this._on(
      `display.${this.displayContextName}.viewObjectClosed.${this.viewId}`,
      handler,
    );
  }

  /**
   * viewObject bounds changed event
   * @param {viewObjectBoundsEventCallback} handler
   */
  onBoundsChanged(handler: (response: RabbitMessage) => void): void {
    this._on(
      `display.${this.displayContextName}.viewObjectBoundsChanged.${this.viewId}`,
      handler,
    );
  }

  /**
   * viewObject URL changed event
   * @param {viewObjectURLEventCallback} handler
   */
  onUrlChanged(handler: (response: RabbitMessage) => void): void {
    this._on(
      `display.${this.displayContextName}.viewObjectUrlChanged.${this.viewId}`,
      handler,
    );
  }

  /**
   * viewObject URL reloaded event
   * @param {viewObjectURLEventCallback} handler
   */
  onUrlReloaded(handler: (response: RabbitMessage) => void): void {
    this._on(
      `display.${this.displayContextName}.viewObjectUrlChanged.${this.viewId}`,
      handler,
    );
  }

  /**
   * viewObject crashed event
   * @param {viewObjectBasicEventCallback} handler
   */
  onCrashed(handler: (response: RabbitMessage) => void): void {
    this._on(
      `display.${this.displayContextName}.viewObjectCrashed.${this.viewId}`,
      handler,
    );
  }

  /**
   * viewObject GPU crashed event
   * @param {viewObjectBasicEventCallback} handler
   */
  onGPUCrashed(handler: (response: RabbitMessage) => void): void {
    this._on(
      `display.${this.displayContextName}.viewObjectGPUCrashed.${this.viewId}`,
      handler,
    );
  }

  /**
   * viewObject plugin crashed event
   * @param {viewObjectBasicEventCallback} handler
   */
  onPluginCrashed(handler: (response: RabbitMessage) => void): void {
    this._on(
      `display.${this.displayContextName}.viewObjectPluginCrashed.${this.viewId}`,
      handler,
    );
  }
}
