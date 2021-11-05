import cislio from '@cisl/io';
import { Io } from '@cisl/io/io';
import { DisplayContextFactory } from './display-context-factory';
import { DisplayContext } from './display-context';
import { UniformGridCellSize } from './display-window';
import { ViewObject, ViewObjectOptions } from './view-object';
import { DisplayOptions } from './types';

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

export class DisplayWorker {
  private io: Io;

  public displayContextFactory: DisplayContextFactory;

  public displayContext?: DisplayContext;

  public uniformGridCellSize?: UniformGridCellSize;

  public uniformGridCellSizeByWindow: Map<string, UniformGridCellSize>;

  public constructor(io: Io) {
    this.io = io;
    this.displayContextFactory = new DisplayContextFactory(io);
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

    const displays = await this.displayContextFactory.getDisplays();
    for (const windowName of Object.keys(displayOptions)) {
      const display = displays.get(displayOptions[windowName].displayName);
      if (display) {
        displayOptions[windowName] = {
          ...display,
          ...displayOptions[windowName],
        };
      }
    }

    this.displayContext = await this.displayContextFactory.create(displayContextName, displayOptions);
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
}

export function registerDisplayWorker(io: Io): void {
  if (!io.rabbit || !io.redis) {
    throw new Error('Requires both redis and rabbitmq');
  }
  io.display = new DisplayWorker(io);
}

cislio.registerPlugins(registerDisplayWorker);
