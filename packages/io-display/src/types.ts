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
