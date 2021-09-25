import { Io } from '@cisl/io/io';
import isEmpty from 'lodash.isempty';

import { DisplayWindow } from './display-window';
import { ViewObject } from './view-object';
import { RabbitMessage } from '@cisl/io/types';

import { ResponseContent } from './types';

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

/**
 * Class representing the DisplayContext object.
 */
export class DisplayContext {
  private io: Io;

  public name: string;

  private displayWindows: Map<string, DisplayWindow>;

  private viewObjects: Map<string, ViewObject>;

  private windowSettings: any;

  private displayWorkerQuitHandler?: Function;

  /**
  * Creates an instance of DisplayContext.
  * @param {String} name Display context name
  * @param {Object.<String, window_settings>} window_settings - a collection of named window settings
  * @param {Object} io CELIO object instance
  */
  constructor(io: Io, name: string, windowSettings: any) {
    if (!io.rabbit) {
      throw new Error('could not find RabbitMQ instance');
    }
    this.io = io;
    this.name = name;
    this.displayWindows = new Map();
    this.viewObjects = new Map();
    if (!isEmpty(windowSettings)) {
      this.windowSettings = windowSettings;
      for (const k of Object.keys(this.windowSettings)) {
        this.windowSettings[k].windowName = k;
        if (this.windowSettings[k].displayName) {
          this.windowSettings[k].displayName = k;
        }
      }
    }

    this.io.rabbit.onTopic('display.removed', (response) => {
      this._clean((response.content as string));
    });

    this.io.rabbit.onQueueDeleted((queue_name) => {
      if (queue_name.indexOf('rpc-display-') > -1) {
        const closedDisplay = queue_name.replace('rpc-display-', '');
        this._clean(closedDisplay);
      }
    });
  }

  _clean(closedDisplay: string) {
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

  async _postRequest(displayName: string, data): Promise<object> {
    const response = await this.io.rabbit.publishRpc(`rpc-display-${displayName}`, data);
    if (Buffer.isBuffer(response.content) || typeof response.content !== 'object') {
      throw new Error('Invalid response type');
    }
    return response.content as object;
  }

  restoreFromDisplayWorkerStates(reset = false): Promise<any> {
    // check for available display workers
    const cmd = {
      command: 'get-dw-context-windows-vbo',
      options: {
        context: this.name,
      },
    };
    return this._executeInAvailableDisplays(cmd).then(states => {
      // restoring display context from display workers
      this.displayWindows.clear();
      this.viewObjects.clear();
      let windowCount = 0;
      (states ).forEach(state => {
        if (state.windows) {
          for (const k of Object.keys(state.windows)) {
            const opts = state.windows[k];
            windowCount++;
            opts.displayContext = this;
            this.displayWindows.set(k, new DisplayWindow(this.io, opts));
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
        return this.getWindowBounds().then(bounds => {
          return this.initialize(bounds);
        });
      }
      else if (reset) {
        // making it active and reloading
        return this.show().then(m => {
          return this.reloadAll();
        }).then(m => {
          return m;
        });
      }

      // making it active and not reloading
      return this.show();

    });
  }

  _executeInAvailableDisplays(cmd: object): Promise<any[]> {
    return this.io.rabbit.getQueues().then(qs => {
      const availableDisplayNames: string[] = [];
      qs.forEach(queue => {
        if ((queue.state === 'running' || queue.state === 'live') && queue.name.indexOf('rpc-display-') > -1) {
          availableDisplayNames.push(queue.name);
        }
      });

      const _ps: Promise<any>[] = [];
      availableDisplayNames.forEach(dm => {
        _ps.push(this.io.rabbit.publishRpc(dm, cmd).then(response => {
          return (response.content as object);
        }));
      });
      if (_ps.length > 0) {
        return Promise.all(_ps);
      }

      return new Promise((resolve, reject) => {
        reject(new Error(`No display-worker found while executing: ${JSON.stringify(cmd)}`));
      });

    });
  }

  /**
   * gets a map of windowName with bounds
   * @returns {Promise.<Object>} A map of windowNames with bounds
   */
  getWindowBounds() {
    if (this.windowSettings && !isEmpty(this.windowSettings)) {
      return Promise.resolve(this.windowSettings);
    }

    // get existing context state from display workers
    const cmd = {
      command: 'get-window-bounds',
      options: {
        context: this.name,
      },
    };
    return this._executeInAvailableDisplays(cmd).then(bounds => {
      const boundMap = {};
      for (let x = 0; x < bounds.length; x++) {
        for (const k of Object.keys(bounds[x])) {
          boundMap[k] = bounds[x][k];
        }
      }
      this.windowSettings = boundMap;
      return Promise.resolve(boundMap);
    });

  }

  /**
   * gets a window object by window name
   */
  getDisplayWindowSync(windowName: string): DisplayWindow {
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
  getDisplayWindowNamesSync(): IterableIterator<string> {
    return this.displayWindows.keys();
  }

  /**
   * Shows all windows of a display context
   * @returns {display_rpc_result} returns a status object
   */
  show() {
    const cmd = {
      command: 'set-display-context',
      options: {
        context: this.name,
      },
    };
    return this._executeInAvailableDisplays(cmd).then(m => {
      this.io.redis.getset('display:activeDisplayContext', this.name).then(() => {
        return m;
      });
    });
  }

  /**
   * hides all windows of a display context
   * @returns {display_rpc_result} returns a status object
   */
  hide() {
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
  close() {
    const cmd = {
      command: 'close-display-context',
      options: {
        context: this.name,
      },
    };
    return this._executeInAvailableDisplays(cmd).then(m => {
      const map: any[] = [];
      let isHidden = false;
      for (let i = 0; i < m.length; i++) {
        const res = m[i];
        if (res.command === 'hide-display-context') {
          isHidden = true;
        }
        map.push(res);
      }
      if (!isHidden) {
        this.displayWindows.clear();
        this.viewObjects.clear();
        this.io.redis.get('display:activeDisplayContext').then(x => {
          if (x === this.name) {
            // clearing up active display context in store
            this.io.redis.del('display:activeDisplayContext');
          }
        });
        this.io.rabbit.publishTopic('display.displayContext.closed', JSON.stringify({
          'type': 'displayContextClosed',
          'details': map,
        }));
      }
      return map;
    });
  }

  /**
  * reloads all viewObjects of a display context
  * @returns {display_rpc_result} returns a status object
  */
  reloadAll() {
    const _ps: Promise<any>[] = [];
    for (const viewObject of this.viewObjects.values()) {
      _ps.push(viewObject.reload());
    }

    return Promise.all(_ps);
  }

  initialize(options) {
    if (isEmpty(options)) {
      return new Promise((resolve, reject) => {
        reject(new Error('Cannot initialize display context without proper window_settings.'));
      });
    }

    return this.show().then(() => {
      const _ps: Promise<any>[] = [];
      // creating displaywindows
      for (const k of Object.keys(options)) {
        options[k].template = 'index.html';
        const cmd = {
          command: 'create-window',
          options: options[k],
        };
        _ps.push(this._postRequest(options[k].displayName, cmd));
      }
      return Promise.all(_ps);
    }).then(m => {
      const map = {};
      for (let i = 0; i < m.length; i++) {
        const res = m[i];
        map[res.windowName] = res;
        res.displayContext = this;
        this.displayWindows.set(res.windowName, new DisplayWindow(this.io, res));
      }
      return map;
    });

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
  captureDisplayWindows() {
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
  async createViewObject(options: any, windowName = 'main'): Promise<ViewObject> {
    options.displayContext = this.name;
    if (this.displayWindows.has(windowName)) {
      const viewObject = await this.displayWindows.get(windowName)?.createViewObject(options);
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

    const bounds = this.getWindowBounds();
    let windowNameCheck = false;
    for (const k of Object.keys(bounds)) {
      if (bounds[k].displayName === undefined) {
        bounds[k].displayName = k;
      }
      if (windowName === k) {
        windowNameCheck = true;
      }
      bounds[k].windowName = k;
      bounds[k].template = 'index.html';
      bounds[k].displayContext = this.name;
    }
    if (!windowNameCheck) {
      throw new Error(`windowName ${windowName} is not defined by the user. Inferencing based on existing display-workers also failed.`);
    }
    await this.initialize(bounds);
    return await this.createViewObject(options, windowName);

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
    });
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
    });
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
    });
  }

  /**
   * DisplayWorkerQuit Event
   * @param {displayWorkerQuitHandler} handler
   */
  onDisplayWorkerQuit(handler) {
    this.displayWorkerQuitHandler = handler;
  }
}
