import { Io } from '@cisl/io/io';
import { RabbitMessage } from '@cisl/io/types';
import { ViewObject, ViewObjectOptions } from './view-object';
import { DisplayContext } from './display-context';

interface GenericObject {
  [key: string]: unknown;
}

export interface UniformGridCellSize {
  width: number;
  height: number;
}

interface DisplayWindowOptions {
  windowName: string;
  displayName: string;
  displayContext: DisplayContext;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface UniformGridOptions {
  contentGrid: {
    row: number;
    col: number;
    rowHeight?: number[];
    colWidth?: number[];
    padding?: number;
    custom?: {
      label: string;
      left: number | string;
      top: number | string;
      width: number | string;
      height: number | string;
    };
  };
  gridBackground?: {
    [name: string]: string;
  };
  windowName?: string;
}

/*
 * @param {String} options.url
 * @param {Object|String} [options.position]
 * @param {Number} options.position.gridTop
 * @param {Number} options.position.gridLeft
 * @param {String} options.width - in pixels or em
 * @param {String} options.height - in pixels or em
 * @param {boolean} options.nodeintegration
 * @param {String} options.cssText
 * @param {boolean} options.uiDraggable
 * @param {boolean} options.uiClosable
 * @param {object} options.deviceEmulation
 * @param {Number} options.deviceEmulation.scale
 */

interface CloseReturn extends GenericObject {
  viewObjects: string[];
}

interface CreateViewObjectResponse extends ViewObjectOptions {
  message?: string;
  status: string;
  command: string;
  viewId: string;
  displayName: string;
  windowName: string;
  displayContextName: string;
}

/**
 * Class representing DisplayWindow
 * @class DisplayWindow
 */
export class DisplayWindow {
  private io: Io;

  private displayContext: DisplayContext;

  public windowName: string;

  public displayName: string;

  public uniformGridCellSize: UniformGridCellSize;

  constructor(io: Io, options: DisplayWindowOptions) {
    if (!io.rabbit) {
      throw new Error('could not find RabbitMQ instance');
    }
    this.io = io;
    this.windowName = options.windowName;
    this.displayName = options.displayName;
    this.displayContext = options.displayContext;
    this.uniformGridCellSize = null;
  }

  _postRequest<T = object>(data: object): Promise<T> {
    return this.io.rabbit
      .publishRpc(`rpc-display-${this.displayName}`, data)
      .then((response: RabbitMessage) => {
        if (
          Buffer.isBuffer(response.content) ||
          typeof response.content !== 'object'
        ) {
          throw new Error('invalid response content');
        }
        return response.content as unknown as T;
      });
  }

  id(): string {
    return this.windowName;
  }

  /**
   * Clears grid defined in the display window
   * @returns {display_rpc_result}
   */
  clearGrid(): Promise<object> {
    const cmd = {
      command: 'clear-grid',
      options: {
        windowName: this.windowName,
      },
    };
    return this._postRequest(cmd);
  }

  /**
   * Clears contents (viewobjects) defined in the display window
   * @returns {display_rpc_result}
   */
  clearContents(): Promise<object> {
    const cmd = {
      command: 'clear-contents',
      options: {
        windowName: this.windowName,
      },
    };
    return this._postRequest(cmd);
  }

  /*
      args: options (json object)
          - contentGrid (json Object)
              (for uniform grid)
              - row (integer, no of rows)
              - col (integer, no of cols)
              - rowHeight ( float array, height percent for each row - 0.0 to 1.0 )
              - colWidth ( float array,  width percent for each col - 0.0 to 1.0 )
              - padding (float) // in px or em
              (for custom grid)
              - custom ( array of json Object)
                  [{ 'label' : 'cel-id-1',  left, top, width, height}, // in px or em or percent
                  { 'label' : 'cel-id-2',  left, top, width, height},
                  { 'label' : 'cel-id-3',  left, top, width, height},
                  ...
                  ]
          - gridBackground (json Object)
              {
                  'row|col' : 'backgroundColor',
                  'cel-id-1' : 'backgroundColor',
                  'cel-id-2' : 'backgroundColor',
              }
  */

  /**
   * Creates a  simple grid layout in the display window
   * @example <caption> A sample options object </caption>
   * 'contentGrid': {
          'row': 2,
          'col': 2,
          'padding': 5,
          'rowHeight' : [ 0.5, 0.5] // ( float array, height percent for each row - 0.0 to 1.0 )
          'colWidth' : [ 0.4, 0.6] //( float array,  width percent for each col - 0.0 to 1.0 )
      },
      'gridBackground' : {
          '1|1' : 'white',
          '1|2' : 'grey',
          '2|1' : 'grey',
          '2|2' : 'white'
      }
    * @param {Object} options
    * @returns {display_rpc_result}
    */
  createUniformGrid(options: UniformGridOptions): Promise<object> {
    options.windowName = this.windowName;
    const cmd = {
      command: 'create-grid',
      options: options,
    };
    return this._postRequest(cmd);
  }

  /**
   * adds a cell to the grid
   * @param {String} label
   * @param {Object.<{left: String, top: String, width : String, height: String}>} bounds
   * @param {String} backgroundStyle
   * @returns {display_rpc_result}
   */
  addToGrid(
    label: string,
    bounds: { left: string; top: string; width: string; height: string },
    backgroundStyle: string,
  ): Promise<object> {
    const cmd = {
      command: 'add-to-grid',
      options: {
        windowName: this.windowName,
        label: label,
        bounds: bounds,
        style: backgroundStyle,
      },
    };
    return this._postRequest(cmd);
  }

  /**
   * Removes a cell from the grid
   * @param {String} label - cell label
   * @returns {display_rpc_result}
   */
  removeFromGrid(label: string): Promise<object> {
    const cmd = {
      command: 'remove-from-grid',
      options: {
        windowName: this.windowName,
        label: label,
      },
    };
    return this._postRequest(cmd);
  }

  /**
   * get the grid layout object
   * @returns {Object}
   */
  getGrid(): Promise<object> {
    const cmd = {
      command: 'get-grid',
      options: {
        windowName: this.windowName,
      },
    };
    return this._postRequest(cmd);
  }

  /**
   * gets the cell size of the uniform content grid
   * @returns {{width : Number, height : Number }}
   */
  async getUniformGridCellSize(): Promise<UniformGridCellSize> {
    const cmd = {
      command: 'uniform-grid-cell-size',
      options: {
        windowName: this.windowName,
      },
    };
    this.uniformGridCellSize = await this._postRequest<UniformGridCellSize>(
      cmd,
    );
    return this.uniformGridCellSize;
  }

  /**
   * setting DisplayWindow cssText
   * label is row|col or custom cell name
   * js_css_style : http://www.w3schools.com/jsref/dom_obj_style.asp
   * @param {String} label
   * @param {String} style - based on  http://www.w3schools.com/jsref/dom_obj_style.asp
   * @param {Object} animation - based on W3 animation API
   * @returns {display_rpc_result}
   */
  setCellStyle(
    label: string,
    style: string,
    animation?: object,
  ): Promise<object> {
    const cmd = {
      command: 'cell-style',
      options: {
        windowName: this.windowName,
        label: label,
        style: style,
        animationOptions: animation,
      },
    };

    return this._postRequest(cmd);
  }

  /**
   * Sets the font size of the display window object
   * @param {String} fontSize - font size in pixels
   * @returns {display_rpc_result}
   */
  setFontSize(fontSize: string): Promise<object> {
    const cmd = {
      command: 'set-displaywindow-font-size',
      options: {
        windowName: this.windowName,
        fontSize,
      },
    };
    return this._postRequest(cmd);
  }

  /**
   * Hides the display window
   * @returns {display_rpc_result}
   */
  hide(): Promise<object> {
    const cmd = {
      command: 'hide-window',
      options: {
        windowName: this.windowName,
      },
    };
    return this._postRequest(cmd);
  }

  /**
   * shows the displayWindow
   * @returns {display_rpc_result}
   * @memberOf DisplayWindow
   */
  show(): Promise<object> {
    const cmd = {
      command: 'show-window',
      options: {
        windowName: this.windowName,
      },
    };
    return this._postRequest(cmd);
  }

  /**
   * closes the displayWindow and destroys the viewobjects
   * @returns {display_rpc_result}
   */
  async close(): Promise<object> {
    const cmd = {
      command: 'close-window',
      options: {
        windowName: this.windowName,
      },
    };

    const content = await this._postRequest(cmd);
    (content as CloseReturn).viewObjects.forEach((v) => {
      const view = this.displayContext.getViewObject(v);
      if (view) {
        view.close().catch((err) => {
          console.error(`Error closing ${view.viewId}`, err);
        });
      }
    });
    return content;
  }

  /**
   * opens debug console
   * @returns {display_rpc_result}
   */
  openDevTools(): Promise<object> {
    const cmd = {
      command: 'window-dev-tools',
      options: {
        windowName: this.windowName,
        devTools: true,
      },
    };
    return this._postRequest(cmd);
  }

  /**
   * closes the debug console
   * @returns {display_rpc_result}
   */
  closeDevTools(): Promise<object> {
    const cmd = {
      command: 'window-dev-tools',
      options: {
        windowName: this.windowName,
        devTools: false,
      },
    };
    return this._postRequest(cmd);
  }

  /**
   * gets the screenshotof the display window as image buffer
   * @returns {Promise.<Buffer>}
   */
  async capture(): Promise<object> {
    const cmd = {
      command: 'capture-window',
      options: {
        windowName: this.windowName,
      },
    };
    const response = await this.io.rabbit.publishRpc(
      `rpc-display-${this.displayName}`,
      cmd,
    );
    if (
      Buffer.isBuffer(response.content) ||
      typeof response.content !== 'object'
    ) {
      throw new Error('invalid response type');
    }
    return response.content;
  }

  /**
   * Creates a view object in the window
   *
   * options:
   *  - url
   *  - position (label or grid-top & gridLeft)
   *  - width // in px or em
   *  - height // in px or em
   *  - cssText (string)
   *  - nodeintegration (boolean)
   *
   * @param {Object} options
   * @param {String} options.url
   * @param {Object|String} [options.position]
   * @param {Number} options.position.gridTop
   * @param {Number} options.position.gridLeft
   * @param {String} options.width - in pixels or em
   * @param {String} options.height - in pixels or em
   * @param {boolean} options.nodeintegration
   * @param {String} options.cssText
   * @param {boolean} options.uiDraggable
   * @param {boolean} options.uiClosable
   * @param {object} options.deviceEmulation
   * @param {Number} options.deviceEmulation.scale
   * @returns {ViewObject} View object
   */
  async createViewObject(options: ViewObjectOptions): Promise<ViewObject> {
    const cmd = {
      command: 'create-view-object',
      options: {
        ...options,
        windowName: this.windowName,
        displayContextName: this.displayContext.name,
        displayName: this.displayName,
      },
    };

    const content = await this._postRequest<CreateViewObjectResponse>(cmd);
    if (content.status === 'error') {
      throw new Error(`ViewObject not created: ${content.message}`);
    }
    return new ViewObject(this.io, this, content);
  }
}
