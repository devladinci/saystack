export interface IWindowRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface IMeasurable {
  measureInWindow(callback: (x: number, y: number, width: number, height: number) => void): void;
}

export function measureInWindow(target: IMeasurable | null | undefined): Promise<IWindowRect | null> {
  if (target === null || target === undefined) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    target.measureInWindow((x, y, width, height) => {
      resolve(width > 0 || height > 0 ? { x, y, width, height } : null);
    });
  });
}
