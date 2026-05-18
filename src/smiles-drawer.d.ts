declare module 'smiles-drawer' {
  interface DrawerOptions {
    width?: number;
    height?: number;
    bondThickness?: number;
    fontSizeLarge?: number;
    fontSizeSmall?: number;
  }
  class Drawer {
    constructor(options?: DrawerOptions);
    draw(tree: unknown, canvas: HTMLCanvasElement, theme?: string, invert?: boolean): void;
  }
  function parse(
    smiles: string,
    successCallback: (tree: unknown) => void,
    errorCallback?: (err: unknown) => void
  ): void;
  export { Drawer, parse };
}
