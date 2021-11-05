export interface ResponseContent {
  details: {
    viewId: string;
    closedDisplayContextName: string;
    lastDisplayContext: string;
    [key: string]: string;
  };
}

export interface Bounds {
  displayName?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  contentGrid?: any;
}

export interface Window {
  x: number;
  y: number;
  width: number;
  height: number;
  displayName: string;
  contentGrid: any;
  windowName: string;
  template: string;
  command: string;
  displayContextName: string;
}

export interface ContentGrid {
  row: number;
  col: number;
  padding?: number;
}

export interface WindowOptions {
  displayName: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  contentGrid?: ContentGrid;
}

export interface DisplayOptions {
  [windowName: string]: WindowOptions;
}

export interface DisplayResponse extends BaseResponse {
  message: string;
}

export interface BaseResponse {
  status: string;
  command: string;
  displayName: string;
}
