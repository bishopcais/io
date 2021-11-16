import { Io } from '@cisl/io/io';
import isEmpty from 'lodash.isempty';

import { DisplayWindow } from './display-window';
import { ViewObject, ViewObjectOptions, ViewObjectRequestResponse } from './view-object';
import { RabbitMessage } from '@cisl/io/types';

import { DisplayOptions, DisplayResponse, DisplayUrlOptions, ResponseContent, Window, WindowOptions } from './types';

/**
 * @typedef {Promise.<Object>} display_rpc_result
 * @property {String} status success or rejects with an Error message
 * @property {String} command The command name
 * @property {String} displayName Display Name
 * @property {String} displayContext DisplayContext Name
 */

/**
 * Callback for handling displayContextClosed event subscriptions.
 * @callback displayWorkerQuitHandler
 * @param {Object} message - The message content parsed into a javascript object.
 * @param {String} message.closedDisplay - displayName
 * @param {Array} message.closedWindows - List of window names
 * @param {Array} message.closedViewObjects - List of viewObject ids
 */

/**
 * @typedef {Object} viewobject_options
 * @property {String} url - url starting with http:// or https://; or local file on display-worker starting with file://<absolute path>
 * @property {String} left - left position in pixels or em
 * @property {String} top -  top position in pixels or em
 * @property {String} width - width in pixels or em
 * @property {String} height -  height in pixels or em
 * @property {boolean} uiDraggable - sets if the viewObject is draggable using a pointing device
 * @property {boolean} uiClosable - sets if the viewObject is closable using a pointing device
 * @property {Object} [position] - Specifies position in grid mode. ignores left and top if specified
 * @property {Number} [position.gridLeft] - column position
 * @property {Number} [position.gridTop] - row position
 * @property {Object} [slide] - Specifies sliding content in grid mode. Requires position object
 * @property {String} [direction] - values : 'left', 'right', 'down', 'up'
 * @property {boolean} [nodeIntegration] - specifies if the guest page needs to use Electron resources
 * @property {Object} [deviceEmulation] - Specifies device emulation parameters. ( For all parameter options refer http://electron.atom.io/docs/api/web-contents/#contentsenabledeviceemulationparameters)
 * @property {Number} deviceEmulation.scale - Scale of emulated view inside available space (not in fit to view mode) (default: 1)
 * @property {Object} deviceEmulation.offset - Offset of the emulated view inside available space (not in fit to view mode) (default: {x: 0, y: 0})
 * @property {Number} deviceEmulation.offset.x - Set the x axis offset from top left corner
 * @property {Number} deviceEmulation.offset.y - Set the y axis offset from top left corner
 * @property {boolean} deviceEmulation.fitToView -  Whether emulated view should be scaled down if necessary to fit into available space (default: false)
 * @property {Object} [videoOptions] - Specifies video options for url specified with local file:/// and extension .mp4.
 * @property {String} [videoOptions.group] - Specify group name of video view objects that should maintain synchronicity
 * @property {String} [videoOptions.groupSize] - Specify the number of video view objects that should maintain synchronicity
 * @property {boolean} [videoOptions.controls] - Specify video UI controls be present. (default: true)
 * @property {boolean} [videoOptions.content] - Specify content should play (true) or paused (false) (default: true)
 * @property {boolean} [videoOptions.muted] - Specify whether sound is muted or not (default: false)
 * @property {Number} [videoOptions.currentTime] - Specify the video play position in seconds(default 0.0)
 * @property {Number} [videoOptions.volume] - Specify the current volume from (0.0 - muted) to (1.0 - full volume) (default: 1.0)
 * @property {Number} [videoOptions.preload] - Specify the current video preload ('auto' | 'metadata' | 'none') (default: 'auto')
*/

interface ContextWindowSettings extends WindowOptions {
  windowName: string;
}

interface DisplayContextSettings {
  [windowName: string]: ContextWindowSettings;
}

interface QuitHandlerObj {
  closedDisplay: string;
  closedWindows: string[];
  closedViewObjects: string[];
}

interface InitializeResponse {
  status: string;
  x: number;
  y: number;
  width: number;
  height: number;
  displayName: string;
  displayContextName: string;
  windowName: string;
}

interface InitializeReturn extends InitializeResponse {
  displayContext: DisplayContext;
}

/**
 * Class representing the DisplayContext object.
 */
export class DisplayContext {
  private io: Io;

  public name: string;

  private displayWindows: Map<string, DisplayWindow>;

  private displayNames: Set<string>;

  private viewObjects: Map<string, ViewObject>;

  private settings: DisplayContextSettings;

  private displayWorkerQuitHandler?: (obj: QuitHandlerObj) => void;

  /**
  * Creates an instance of DisplayContext.
  * @param {String} name Display context name
  * @param {Object.<String, window_settings>} windowSettings - a collection of named window settings
  * @param {Object} io CELIO object instance
  */
  constructor(io: Io, name: string, settings: DisplayOptions) {
    if (!io.rabbit) {
      throw new Error('could not find RabbitMQ instance');
    }
    this.io = io;
    this.name = name;
    this.displayWindows = new Map();
    this.viewObjects = new Map();

    this.displayNames = new Set();

    this.settings = Object.keys(settings).reduce<DisplayContextSettings>((acc, key) => {
      acc[key] = {
        ...settings[key],
        windowName: key,
        displayName: settings[key].displayName || key,
      };

      this.displayNames.add(acc[key].displayName);

      return acc;
    }, {});

    this.io.rabbit.onTopic('display.removed', (response) => {
      this._clean((response.content as string));
    }).catch((err) => {
      console.error('Failed to remove display', err);
    });

    this.io.rabbit.onQueueDeleted((queueName) => {
      if (this.validQueue(queueName)) {
        const closedDisplay = queueName.replace('rpc-display-', '');
        this._clean(closedDisplay);
      }
    });
  }

  private validQueue(queueName: string): boolean {
    return (queueName.indexOf('rpc-display-') > -1) && this.displayNames.has(queueName.replace('rpc-display-', ''));
  }

  _clean(closedDisplay: string): void {
    const closedWindows: string[] = [];
    for (const [k, v] of this.displayWindows) {
      if (v.displayName === closedDisplay) {
        closedWindows.push(k);
      }
    }
    closedWindows.forEach(w => this.displayWindows.delete(w));
    const vboToRemove: string[] = [];
    for (const [k, v] of this.viewObjects) {
      if (v.displayName === closedDisplay) {
        vboToRemove.push(k);
      }
    }
    vboToRemove.forEach(v => this.viewObjects.delete(v));

    if (this.displayWorkerQuitHandler) {
      const obj = {
        closedDisplay: closedDisplay,
        closedWindows: closedWindows,
        closedViewObjects: vboToRemove,
      };
      this.displayWorkerQuitHandler(obj);
    }
  }

  async _postRequest<T = any>(displayName: string, data): Promise<T> {
    const response = await this.io.rabbit.publishRpc(`rpc-display-${displayName}`, data);
    if (Buffer.isBuffer(response.content) || typeof response.content !== 'object') {
      throw new Error('Invalid response type');
    }
    return response.content as unknown as T;
  }

  async restoreFromDisplayWorkerStates(reset = false): Promise<any> {
    // check for available display workers
    const cmd = {
      command: 'get-dw-context-windows-vbo',
      options: {
        context: this.name,
      },
    };

    interface State {
      displayName: string;
      context: string;
      windows: Record<string, Window>;
      viewObjects: Record<string, string>;
    }

    const states = await this._executeInAvailableDisplays<State>(cmd);
    // restoring display context from display workers
    this.displayWindows.clear();
    this.viewObjects.clear();
    let windowCount = 0;

    states.forEach(state => {
      if (state.context !== this.name) {
        return;
      }
      if (state.windows) {
        for (const k of Object.keys(state.windows)) {
          const opts = state.windows[k];
          windowCount++;
          this.displayWindows.set(k, new DisplayWindow(this.io, {
            ...opts,
            displayContext: this,
          }));
        }
      }
      if (state.viewObjects) {
        for (const k of Object.keys(state.viewObjects)) {
          const wn = this.displayWindows.get(state.viewObjects[k]);
          if (wn) {
            const opts = {
              viewId: k,
              displayName: wn.displayName,
              displayContextName: this.name,
              windowName: wn.windowName,
            };
            this.viewObjects.set(k, new ViewObject(this.io, opts));
          }
        }
      }
    });

    if (windowCount === 0) {
      // initialize display context from options
      const bounds = await this.getWindowBounds();
      return this.initialize(bounds);
    }
    else if (reset) {
      // making it active and reloading
      await this.show();
      const m = await this.reloadAll();
      return m;
    }

    // making it active and not reloading
    return this.show();
  }

  async _executeInAvailableDisplays<T = any>(cmd: { command: string; options: { context: string }}): Promise<T[]> {
    const qs = await this.io.rabbit.getQueues();
    const availableDisplayNames: string[] = [];
    qs.forEach(queue => {
      if ((queue.state === 'running' || queue.state === 'live') && this.validQueue(queue.name)) {
        availableDisplayNames.push(queue.name);
      }
    });

    if (availableDisplayNames.length === 0) {
      return Promise.reject(new Error(`No display-worker found while executing: ${JSON.stringify(cmd)}`));
    }

    const _ps: Promise<T>[] = [];
    availableDisplayNames.forEach(dm => {
      _ps.push(this.io.rabbit.publishRpc(dm, cmd).then(response => {
        return (response.content as T);
      }));
    });
    return Promise.all(_ps);
  }

  /**
   * gets a map of windowName with bounds
   * @returns {Promise.<Object>} A map of windowNames with bounds
   */
  async getWindowBounds(): Promise<DisplayContextSettings> {
    if (this.settings && !isEmpty(this.settings)) {
      return Promise.resolve(this.settings);
    }

    // get existing context state from display workers
    const cmd = {
      command: 'get-window-bounds',
      options: {
        context: this.name,
      },
    };
    const bounds = await this._executeInAvailableDisplays<Record<string, ContextWindowSettings>>(cmd);

    const boundMap: DisplayContextSettings = {};
    for (let x = 0; x < bounds.length; x++) {
      for (const k of Object.keys(bounds[x])) {
        boundMap[k] = bounds[x][k];
      }
    }
    this.settings = boundMap;
    return Promise.resolve(boundMap);
  }

  /**
   * gets a window object by window name
   */
  getDisplayWindow(windowName: string): DisplayWindow {
    const window = this.displayWindows.get(windowName);
    if (!window) {
      throw new Error(`Could not get Display Window by name: ${windowName}`);
    }
    return window;
  }

  /**
   * gets all window names
   * @returns {Array.<String>} An array of window names
   */
  getDisplayWindowNames(): IterableIterator<string> {
    return this.displayWindows.keys();
  }

  /**
   * Shows all windows of a display context
   * @returns {display_rpc_result} returns a status object
   */
  async show(): Promise<DisplayResponse[]> {
    const cmd = {
      command: 'set-display-context',
      options: {
        context: this.name,
      },
    };

    /*
      'status' : 'success',
      'command' : 'set-active-context',
      'displayName' : this.displayName,
      'message' : this.activeDisplayContext + ' is now active'
    */
    const m = await this._executeInAvailableDisplays<DisplayResponse>(cmd);
    await this.io.redis.getset('display:activeDisplayContext', this.name);
    return m;
  }

  /**
   * hides all windows of a display context
   * @returns {display_rpc_result} returns a status object
   */
  hide(): Promise<any[]> {
    const cmd = {
      command: 'hide-display-context',
      options: {
        context: this.name,
      },
    };
    return this._executeInAvailableDisplays(cmd);
  }

  /**
  * closes all windows of a display context
  * @returns {display_rpc_result} returns a status object
  */
  async close(): Promise<{ status: string; command: string; displayName: string }[]> {
    const cmd = {
      command: 'close-display-context',
      options: {
        context: this.name,
      },
    };

    interface State {
      status: string;
      command: string;
      displayName: string;
    }

    const m = await this._executeInAvailableDisplays<State>(cmd);
    let isHidden = false;
    for (let i = 0; i < m.length; i++) {
      if (m[i].command === 'hide-display-context') {
        isHidden = true;
        break;
      }
    }
    if (!isHidden) {
      this.displayWindows.clear();
      this.viewObjects.clear();
      this.io.redis.get('display:activeDisplayContext').then(x => {
        if (x === this.name) {
          // clearing up active display context in store
          this.io.redis.del('display:activeDisplayContext').catch(() => {
            // ignore
          });
        }
      }).catch(() => {
        // ignore
      });
      this.io.rabbit.publishTopic('display.displayContext.closed', JSON.stringify({
        'type': 'displayContextClosed',
        'details': m,
      })).catch(() => {
        // ignore
      });
    }
    return m;
  }

  /**
  * reloads all viewObjects of a display context
  * @returns {display_rpc_result} returns a status object
  */
  reloadAll(): Promise<ViewObjectRequestResponse[]> {
    const _ps: Promise<ViewObjectRequestResponse>[] = [];
    for (const viewObject of this.viewObjects.values()) {
      _ps.push(viewObject.reload());
    }

    return Promise.all(_ps);
  }

  async initialize(options: DisplayContextSettings): Promise<Record<string, InitializeReturn>> {
    if (isEmpty(options)) {
      throw new Error('Cannot initialize display context without proper window_settings.');
    }

    await this.show();
    const _ps: Promise<InitializeResponse>[] = [];
    // creating displaywindows
    for (const k of Object.keys(options)) {
      const cmd = {
        command: 'create-window',
        options: {
          ...options[k],
          template: 'index.html',
        },
      };
      _ps.push(this._postRequest<InitializeResponse>(options[k].displayName, cmd));
    }
    const m = await Promise.all(_ps);
    const map: Record<string, InitializeResponse & { displayContext: DisplayContext }> = {};
    for (let i = 0; i < m.length; i++) {
      map[m[i].windowName] = {
        ...m[i],
        displayContext: this,
      };
      this.displayWindows.set(m[i].windowName, new DisplayWindow(this.io, map[m[i].windowName]));
    }
    return map;
  }

  /**
  * gets a viewObject
  * @param {String} id - an uuid of the viewobject
  * @returns {ViewObject} returns the ViewObject instance
  */
  getViewObject(id: string): ViewObject {
    const viewObject = this.viewObjects.get(id);
    if (!viewObject) {
      throw new Error(`Invalid ViewObject for id: ${id}`);
    }
    return viewObject;
  }

  /**
    * gets all viewObjects
    * @returns {Map.<String, ViewObject>} returns the collection of ViewObject instances
    */
  getViewObjects(): Map<string, ViewObject> {
    return this.viewObjects;
  }

  /**
   * Captures screenshot of display windows
   * @returns {Map.<Buffer>} returns a map of screenshot image buffer with windowNames as key and image Buffer as value
   */
  captureDisplayWindows(): Promise<any> {
    const _ps: Promise<object>[] = [];
    const _dispNames: string[] = [];
    for (const [k, v] of this.displayWindows) {
      _ps.push(v.capture());
      _dispNames.push(k);
    }
    return Promise.all(_ps).then(m => {
      const resMap = new Map();
      for (let i = 0; i < m.length && i < _dispNames.length; i++) {
        resMap.set(_dispNames[i], m[i]);
      }
      return resMap;
    });
  }

  /**
   * Creates a view object
   * @param {viewobject_options} options - view object options
   * @param {String} [windowName='main'] - window name
   * @returns {Promise<ViewObject>} returns the ViewObject instance
   */
  async createViewObject(options: ViewObjectOptions, windowName = 'main'): Promise<ViewObject> {
    const displayWindow = this.displayWindows.get(windowName);
    if (!displayWindow) {
      throw new Error('Invalid window name');
    }
    const viewObject = await displayWindow.createViewObject(options);
    if (!viewObject) {
      throw new Error('Could not create viewObject');
    }
    this.viewObjects.set(viewObject.viewId, viewObject);
    const map = {};
    for (const [k, v] of this.viewObjects) {
      map[k] = v.windowName;
    }
    return viewObject;
  }

  public async displayUrl(windowName: string, url: string, options: DisplayUrlOptions): Promise<ViewObject> {
    const uniformGridCellSize = await this.displayWindows.get(windowName).getUniformGridCellSize();

    if ((options.width === undefined || options.height === undefined) && uniformGridCellSize === undefined) {
      throw new Error('Uniform grid cell size must be initialized');
    }

    if (options.width === undefined && options.widthFactor === undefined) {
      throw new Error('width or widthFactor is required');
    }
    if (options.height === undefined && options.heightFactor === undefined) {
      throw new Error('height or heightFactor is required');
    }

    return await this.createViewObject({
      nodeIntegration: false,
      uiDraggable: true,
      uiClosable: true,
      ...(options.top === undefined && options.left === undefined ? {
        position: {
          gridLeft: 1,
          gridTop: 1,
        },
      } : {}),
      ...options,
      width:
        options.width !== undefined
          ? (typeof options.width === 'string' ? options.width : `${options.width}px`)
          : `${options.widthFactor * uniformGridCellSize.width}px`,
      height:
        options.height !== undefined
          ? (typeof options.height === 'string' ? options.height : `${options.height}px`)
          : `${options.heightFactor * uniformGridCellSize.height}px`,
      url,
    }, windowName);
  }

  /**
   * DisplayContext closed event
   * @param {displayContextClosedEventCallback} handler - event handler
   */
  onClosed(handler: (content: ResponseContent, response: RabbitMessage) => void): void {
    this.io.rabbit.onTopic('display.displayContext.closed', (response) => {
      if (handler != null) {
        const content = (response.content as ResponseContent);
        if (content.details.closedDisplayContextName === this.name) {
          handler(content, response);
        }
      }
    }).catch(() => { /* pass */ });
  }

  /**
   * DisplayContext changed event
   * @param {displayContextChangedEventCallback} handler - event handler
   */
  onActivated(handler: (content: ResponseContent, response: RabbitMessage) => void): void {
    this.io.rabbit.onTopic('display.displayContext.changed', (response) => {
      if (handler != null) {
        const content = (response.content as ResponseContent);
        if (content.details.displayContext === this.name) {
          handler(content, response);
        }
      }
    }).catch(() => { /* pass */ });
  }

  /**
   * DisplayContext changed event
   * @param {displayContextChangedEventCallback} handler - event handler
   */
  onDeactivated(handler: (content: ResponseContent, response: RabbitMessage) => void): void {
    this.io.rabbit.onTopic('display.displayContext.changed', (response) => {
      if (handler != null) {
        const content = (response.content as ResponseContent);
        if (content.details.lastDisplayContext === this.name) {
          handler(content, response);
        }
      }
    }).catch(() => { /* pass */ });
  }

  /**
   * DisplayWorkerQuit Event
   * @param {displayWorkerQuitHandler} handler
   */
  onDisplayWorkerQuit(handler: (obj: QuitHandlerObj) => void): void {
    this.displayWorkerQuitHandler = handler;
  }
}
