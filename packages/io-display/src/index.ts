import cislio from '@cisl/io';
import { Io } from '@cisl/io/io';
import { UniformGridCellSize } from './display-window';
import { ViewObject, ViewObjectOptions } from './view-object';
import { DisplayOptions } from './types';

import { DisplayContext } from './display-context';
import { RabbitMessage } from '@cisl/io/types';

import { BaseResponse, Bounds } from './types';

declare module '@cisl/io/io' {
  interface Io {
    display: DisplayWorker;
  }
}

interface DisplayUrlOptions extends Pick<ViewObjectOptions, 'slide' | 'deviceEmulation'> {
  left?: number;
  top?: number;
  position?: {
    gridLeft: number;
    gridTop: number;
  };
  nodeIntegration?: boolean;
  width?: number | string;
  height?: number | string;
  widthFactor?: number;
  heightFactor?: number;
}

interface BoundsResponse {
  displayName: string;
  bounds: Bounds;
}

/**
 * @typedef {Object} focus_window
 * @property {string} status success or rejects with an Error message
 * @property {string} windowName Window Name, when status is success
 * @property {string} command The command name
 * @property {string} displayName Display Name
 * @property {string} displayContext DisplayContext Name
 * @example
 * { "command" : "get-focus-window",
 *   "status" : "success",
 *   "windowName" : "winA",
 *   "displayName" : "main",
 *   "displayContext" : "creative"
 *  }
 */

/**
 * @typedef {Object} window_settings
 * @property {string} displayName Display Name
 * @property {number} x
 * @property {number} y
 * @property {number} width
 * @property {number} height
 * @property {object} contentGrid
 * @property {number} contentGrid.row
 * @property {number} contentGrid.col
 * @property {number} contentGrid.padding
 * @property {Object.<String,String>} gridBackground. key is "row|col" and value is a valid html color string
 * @property {String} fontSize
 */

/**
 * Callback for handling viewObjects event subscriptions.
 * @callback viewObjectBasicEventCallback
 * @param {Object} message - The message content parsed into a javascript object.
 * @param {String} message.type - event type
 * @param {String} message.displayContext - The display context name
 * @param {Object} message.details - The message details.
 * @param {String} message.details.view_id - view object id
 */

/**
 * Callback for handling viewObjects URL event subscriptions.
 * @callback viewObjectURLEventCallback
 * @param {Object} message - The message content parsed into a javascript object.
 * @param {String} message.type - event type
 * @param {String} message.displayContext - The display context name
 * @param {Object} message.details - The message details.
 * @param {String} message.details.view_id - view object id
 * @param {String} message.details.url - view object url
 */

/**
 * Callback for handling viewObject created event subscriptions.
 * @callback viewObjectCreatedEventCallback
 * @param {Object} message - The message content parsed into a javascript object.
 * @param {String} message.type - event type
 * @param {String} message.displayContext - The display context name
 * @param {Object} message.details - The message details.
 */

/**
 * Callback for handling viewObject Bounds change event subscriptions.
 * @callback viewObjectBoundsEventCallback
 * @param {Object} message - The message content parsed into a javascript object.
 * @param {String} message.type - event type
 * @param {String} message.displayContext - The display context name
 * @param {Object} message.details - The message details.
 * @param {String} message.details.view_id - view object id
 * @param {Number} message.details.top - Top position in pixel.
 * @param {Number} message.details.left - Left position in pixel.
 * @param {Number} message.details.width - Width in pixel.
 * @param {Number} message.details.height - Height position in pixel.
 */

/**
 * Callback for handling displayContextClosed event subscriptions.
 * @callback displayContextClosedEventCallback
 * @param {Object} message - The message content parsed into a javascript object.
 * @param {String} message.type - event type
 * @param {String} message.displayContext - The display context name
 * @param {Object} message.details - The message details.
 * @param {String} message.details.view_id - view object id
 * @param {Number} message.details.top - Top position in pixel.
 * @param {Number} message.details.left - Left position in pixel.
 * @param {Number} message.details.width - Width in pixel.
 * @param {Number} message.details.height - Height position in pixel.
 */

/**
 * Callback for handling display worker add/remove event subscriptions.
 * Display worker added event
 * @callback displayEventCallback
 * @param {String} displayName
 */

interface FocusWindowResponse extends BaseResponse {
  windowName: string;
  displayContext: string;
}

/**
 * Class representing the DisplayContextFactory object.
 */
export class DisplayWorker {
  private io: Io;

  private displayContext?: DisplayContext;

  private uniformGridCellSize?: UniformGridCellSize;

  private uniformGridCellSizeByWindow: Map<string, UniformGridCellSize>;


  constructor(io: Io) {
    this.io = io;
    this.io.rabbit.setTimeout(10000);

    this.uniformGridCellSizeByWindow = new Map();
  }

  /**
   *
   * @param name The name of the display worker to communicate with
   * @param display The name of the context within display worker to communicate with
   */
  public async openDisplayWorker(displayContextName: string, displayOptions: DisplayOptions): Promise<{displayContext: DisplayContext; uniformGridCellSize: UniformGridCellSize}> {
    /*
    const windows = await this.displayContextFactory.getDisplays();
    const bounds = windows.get(displayName) || {};
    bounds.contentGrid = contentGrid;
    bounds.displayName = displayName;
    */

    const displays = await this.getDisplays();
    for (const windowName of Object.keys(displayOptions)) {
      const display = displays.get(displayOptions[windowName].displayName);
      if (display) {
        displayOptions[windowName] = {
          ...display,
          ...displayOptions[windowName],
        };
      }
    }

    this.displayContext = await this.create(displayContextName, displayOptions);
    for (const windowName of Object.keys(displayOptions)) {
      const displayWindow = this.displayContext.getDisplayWindow(windowName);
      await displayWindow.clearContents();
      if (displayOptions[windowName].contentGrid) {
        await displayWindow.createUniformGrid({
          contentGrid: displayOptions[windowName].contentGrid,
        });
      }
      const uniformGridCellSize = await displayWindow.getUniformGridCellSize();
      this.uniformGridCellSizeByWindow.set(windowName, uniformGridCellSize);
      this.uniformGridCellSize = uniformGridCellSize;
    }

    return {displayContext: this.displayContext, uniformGridCellSize: this.uniformGridCellSize};
  }

  public async displayUrl(url: string, options: DisplayUrlOptions): Promise<ViewObject>;
  public async displayUrl(windowName: string, url: string, options: DisplayUrlOptions): Promise<ViewObject>;

  public async displayUrl(
    windowNameOrUrl: string,
    urlOrOptions: string | DisplayUrlOptions,
    options?: DisplayUrlOptions,
  ): Promise<ViewObject> {
    const windowName = options ? windowNameOrUrl : 'main';
    const url: string = options ? urlOrOptions as string : windowNameOrUrl;
    options = options || urlOrOptions as DisplayUrlOptions;
    const uniformGridCellSize = this.uniformGridCellSizeByWindow.get(windowName);

    if (!this.displayContext) {
      throw new Error('Display context must be initialized');
    }

    if ((options.width === undefined || options.height === undefined) && uniformGridCellSize === undefined) {
      throw new Error('Uniform grid cell size must be initialized');
    }

    if (options.width === undefined && options.widthFactor === undefined) {
      throw new Error('width or widthFactor is required');
    }
    if (options.height === undefined && options.heightFactor === undefined) {
      throw new Error('height or heightFactor is required');
    }

    return await this.displayContext.createViewObject({
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
  * gets the Display Workers details running in the environment.
  * @returns {Promise} A ES2015 Map object with displayNames as keys and bounds as values.
  */
  async getDisplays(): Promise<Map<string, Bounds>> {
    const queues = await this.io.rabbit.getQueues();
    const availableDisplayNames: string[] = [];
    queues.forEach(queue => {
      if ((queue.state === 'running' || queue.state === 'live') && queue.name.indexOf('rpc-display-') > -1) {
        availableDisplayNames.push(queue.name);
      }
    });
    // get existing context state from display workers
    const cmd = {
      command: 'get-display-bounds',
    };
    const _ps: any[] = [];
    availableDisplayNames.forEach(dm => {
      _ps.push(this.io.rabbit.publishRpc(dm, cmd).then(response => {
        return response.content;
      }));
    });
    const bounds = (await Promise.all(_ps) as BoundsResponse[]);
    const boundMap = new Map();
    for (const bound of bounds) {
      boundMap.set(bound.displayName, bound.bounds);
    }
    return boundMap;
  }

  /**
  * list display contexts live in the environment.
  * @returns {Promise} An array of String containing display context names.
  */
  async list(): Promise<string[]> {
    const qs = await this.io.rabbit.getQueues();
    const availableDisplayNames: string[] = [];
    qs.forEach(queue => {
      if ((queue.state === 'running' || queue.state === 'live') && queue.name.indexOf('rpc-display-') > -1) {
        availableDisplayNames.push(queue.name);
      }
    });
    // get existing context state from display workers
    const cmd = {
      command: 'get-context-list',
    };
    const _ps: Promise<string[]>[] = [];
    availableDisplayNames.forEach(dm => {
      _ps.push(this.io.rabbit.publishRpc<string[]>(dm, cmd).then(response => {
        return response.content;
      }));
    });
    const lists = await Promise.all(_ps);
    let contextList: string[] = [];
    for (let x = 0; x < lists.length; x++) {
      contextList = contextList.concat(lists[x]);
    }
    return [...new Set(contextList)];
  }

  /**
  * gets the activelist display contexts.
  * @returns {Promise} An array of String containing display context names.
  */
  async getActive(): Promise<DisplayContext> {
    const m = await this.io.redis.get('display:activeDisplayContext');
    if (m) {
      const _dc = new DisplayContext(this.io, m, {});
      await _dc.restoreFromDisplayWorkerStates();
      return _dc;
    }

    throw new Error('No display context is active');

  }

  /**
  * sets a display context active. Making a display context active ensures only windows of the display context are visible. Windows from other display contexts are hidden.
  * @param display_ctx_name - display context name.
  * @param reset=false if the viewObjects of the displayContext need to be reloaded.
  * @returns return false if the display context name is already active.
  */
  async setActive(displayContextName: string, reset = false): Promise<string | false> {
    // since setState first gets old value and sets the new value at the sametime,
    // calling this function within multiple display workers ensures this function is executed only once.
    const name = await this.io.redis.getset('display:activeDisplayContext', displayContextName);
    if (name !== displayContextName) {
      // TODO
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const m = await (new DisplayContext(this.io, displayContextName, {})).restoreFromDisplayWorkerStates(reset);
      this.io.rabbit.publishTopic('display.displayContext.changed', {
        type: 'displayContextChanged',
        details: {
          displayContext: displayContextName,
          lastDisplayContext: name,
        },
      }).catch(() => { /* pass */ });
      // TODO
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return m;
    }

    // return false when the context is already active
    return false;
  }

  /**
  * Creates a display context. If the display context already exists, it is made active and a DisplayContext Object is restored from store.
  * @param {string} display_ctx_name - display context name.
  * @param {Object.<String, window_settings>} [window_settings={}] Key is window name and value is an object
  * @returns {Promise<Object>} A DisplayContext Object is returned.
  * @example
{
  'windowA': {
      'displayName': 'main',
      'x': 0,
      'y': 0,
      'width': 500,
      'height': 500,
      'contentGrid': {
          'row': 2,
          'col': 2,
          'padding': 5
      },
      'fontSize': '50px'
  },
  'windowB': {
      'displayName': 'main',
      'x': 505,
      'y': 0,
      'width': 500,
      'height': 500,
      'contentGrid': {
          'row': 2,
          'col': 2,
          'padding': 5
      }
  },
  'windowC': {
      'displayName': 'main',
      'x': 1010,
      'y': 0,
      'width': 500,
      'height': 500,
      'contentGrid': {
          'row': 2,
          'col': 2,
          'padding': 5
      },
      'gridBackground' : {
          '1|1' : 'white',
          '1|2' : 'grey',
          '2|1' : 'grey',
          '2|2' : 'white'
      }
  }
}
  */
  async create(displayContextName: string, windowSettings = {}): Promise<DisplayContext> {
    const _dc = new DisplayContext(this.io, displayContextName, windowSettings);
    await _dc.restoreFromDisplayWorkerStates();
    await this.io.rabbit.publishTopic('display.displayContext.created', {
      type: 'displayContextCreated',
      details: {
        displayContext: displayContextName,
      },
    });

    return _dc;
  }

  /**
  * hides all display contexts. If the display context already exists, it is made active and a DisplayContext Object is restored from store.
  * @returns {Promise<Object>} A array of JSON object containing status of hide function execution at all display workers.
  */
  async hideAll(): Promise<BaseResponse[]> {
    const cmd = {
      command: 'hide-all-windows',
    };
    const displays = await this.getDisplays();
    const _ps: Promise<BaseResponse>[] = [];
    for (const [k] of displays) {
      _ps.push(this.io.rabbit.publishRpc<BaseResponse>(`rpc-display-${k}`, cmd).then(m => m.content));
    }
    const m = await Promise.all(_ps);
    void this.io.redis.del('display:activeDisplayContext');
    return m;
  }

  /**
   * gets the details of the focused window from a display.
   * @param {string} [displayName=main] - Display Name.
   * @returns {Promise.<focus_window>} - A JSON object with window details.
   */
  async getFocusedWindow(displayName = 'main'): Promise<FocusWindowResponse> {
    const cmd = {
      command: 'get-focus-window',
    };
    const resp = await this.io.rabbit.publishRpc<FocusWindowResponse>(`rpc-display-${displayName}`, cmd);
    return resp.content;
  }

  /**
   * gets the details of the focused window from all displays.
   * @returns {Promise.<Array.<focus_window>>} - An array of JSON object with window details.
   */
  async getFocusedWindows(): Promise<FocusWindowResponse[]> {
    const cmd = {
      command: 'get-focus-window',
    };
    const displays = await this.getDisplays();
    const _ps: Promise<FocusWindowResponse>[] = [];
    for (const [k] of displays) {
      _ps.push(this.io.rabbit.publishRpc<FocusWindowResponse>(`rpc-display-${k}`, cmd).then(m => m.content));
    }
    return Promise.all(_ps);
  }

  private _on(topic: string, handler: (content: Buffer | string | number | object, response: RabbitMessage) => void): void {
    this.io.rabbit.onTopic(topic, (response) => {
      if (handler != null) {
        handler((response.content as Buffer | string | number), response);
      }
    }).catch(() => { /* pass */ });
  }

  /**
   * viewObject created event
   * @param {viewObjectCreatedEventCallback} handler
   */
  onViewObjectCreated(handler): void {
    this._on('display.*.viewObjectCreated.*', handler);
  }

  /**
   * viewObject hidden event
   * @param {viewObjectBasicEventCallback} handler
   */
  onViewObjectHidden(handler): void {
    this._on('display.*.viewObjectHidden.*', handler);
  }

  /**
   * viewObject became visible event
   * @param {viewObjectBasicEventCallback} handler
   */
  onViewObjectShown(handler): void {
    this._on('display.*.viewObjectShown.*', handler);
  }

  /**
   * viewObject closed event
   * @param {viewObjectBasicEventCallback} handler
   */
  onViewObjectClosed(handler): void {
    this._on('display.*.viewObjectClosed.*', handler);
  }

  /**
   * viewObject bounds changed event
   * @param {viewObjectBoundsEventCallback} handler
   */
  onViewObjectBoundsChanged(handler): void {
    this._on('display.*.viewObjectBoundsChanged.*', handler);
  }

  /**
   * viewObject URL changed event
   * @param {viewObjectURLEventCallback} handler
   */
  onViewObjectUrlChanged(handler): void {
    this._on('display.*.viewObjectUrlChanged.*', handler);
  }

  /**
   * viewObject URL reloaded event
   * @param {viewObjectURLEventCallback} handler
   */
  onViewObjectUrlReloaded(handler): void {
    this._on('display.*.viewObjectUrlChanged.*', handler);
  }

  /**
   * viewObject crashed event
   * @param {viewObjectBasicEventCallback} handler
   */
  onViewObjectCrashed(handler): void {
    this._on('display.*.viewObjectCrashed.*', handler);
  }

  /**
   * viewObject GPU crashed event
   * @param {viewObjectBasicEventCallback} handler
   */
  onViewObjectGPUCrashed(handler): void {
    this._on('display.*.viewObjectGPUCrashed.*', handler);
  }

  /**
   * viewObject plugin crashed event
   * @param {viewObjectBasicEventCallback} handler
   */
  onViewObjectPluginCrashed(handler): void {
    this._on('display.*.viewObjectPluginCrashed.*', handler);
  }

  /**
   * DisplayContext created event
   * @param {displayContextCreatedEventCallback} handler
   */
  onDisplayContextCreated(handler): void {
    this._on('display.displayContext.created', handler);
  }

  /**
   * DisplayContext changed event
   * @param {displayContextChangedEventCallback} handler
   */
  onDisplayContextChanged(handler): void {
    this._on('display.displayContext.changed', handler);
  }

  /**
   * DisplayContext closed event
   * @param {displayContextClosedEventCallback} handler
   */
  onDisplayContextClosed(handler): void {
    this._on('display.displayContext.closed', handler);
  }

  /**
   * Display worker removed event. Use <displayContextInstance>.onDisplayWorkerQuit instead if you want to listen to displayworker unexpected quit event.
   * @param {displayEventCallback} handler
   */
  onDisplayWorkerRemoved(handler): void {
    this._on('display.removed', handler);
  }

  /**
   * Display worker added event
   * @param {displayEventCallback} handler
   */
  onDisplayWorkerAdded(handler): void {
    this._on('display.added', handler);
  }
}

export function registerDisplayWorker(io: Io): void {
  if (!io.rabbit || !io.redis) {
    throw new Error('Requires both redis and rabbitmq');
  }
  io.display = new DisplayWorker(io);
}

cislio.registerPlugins(registerDisplayWorker);
