export interface IGlCall {
  name: string;
  args: unknown[];
}

interface ILocation {
  name: string;
}

const round = (value: unknown): unknown => {
  if (typeof value === "number") {
    return Number(value.toFixed(5));
  }

  if (ArrayBuffer.isView(value) && !(value instanceof DataView)) {
    return Array.from(value as unknown as ArrayLike<number>, (entry) => Number(entry.toFixed(5)));
  }

  if (typeof value === "object" && value !== null && "name" in value) {
    return (value as ILocation).name;
  }

  return value;
};

// Enough of WebGL for the aura: every call that reaches the GPU is recorded with its values.
export function createFakeGl(): { gl: WebGLRenderingContext; calls: IGlCall[] } {
  const calls: IGlCall[] = [];
  let nextId = 0;
  const handle = (kind: string) => (): { name: string } => {
    nextId += 1;
    return { name: `${kind}${nextId}` };
  };
  const record =
    (name: string) =>
    (...args: unknown[]): void => {
      calls.push({ name, args: args.map(round) });
    };
  const quiet = (): void => undefined;

  const gl = {
    VERTEX_SHADER: 35633,
    FRAGMENT_SHADER: 35632,
    COMPILE_STATUS: 35713,
    LINK_STATUS: 35714,
    ARRAY_BUFFER: 34962,
    STATIC_DRAW: 35044,
    FLOAT: 5126,
    TRIANGLES: 4,
    COLOR_BUFFER_BIT: 16384,
    TEXTURE_2D: 3553,
    TEXTURE0: 33984,
    TEXTURE_MIN_FILTER: 10241,
    TEXTURE_MAG_FILTER: 10240,
    TEXTURE_WRAP_S: 10242,
    TEXTURE_WRAP_T: 10243,
    LINEAR: 9729,
    CLAMP_TO_EDGE: 33071,
    RGBA: 6408,
    UNSIGNED_BYTE: 5121,
    FRAMEBUFFER: 36160,
    COLOR_ATTACHMENT0: 36064,
    FRAMEBUFFER_COMPLETE: 36053,
    createShader: handle("shader"),
    shaderSource: quiet,
    compileShader: quiet,
    getShaderParameter: () => true,
    getShaderInfoLog: () => "",
    createProgram: handle("program"),
    attachShader: quiet,
    linkProgram: quiet,
    getProgramParameter: () => true,
    getProgramInfoLog: () => "",
    deleteProgram: quiet,
    deleteShader: quiet,
    useProgram: record("useProgram"),
    createBuffer: handle("buffer"),
    bindBuffer: quiet,
    bufferData: quiet,
    getAttribLocation: () => 0,
    enableVertexAttribArray: quiet,
    vertexAttribPointer: quiet,
    getUniformLocation: (_program: unknown, name: string): ILocation => ({ name }),
    uniform1f: record("uniform1f"),
    uniform1i: record("uniform1i"),
    uniform2f: record("uniform2f"),
    uniform3f: record("uniform3f"),
    uniform4f: record("uniform4f"),
    uniform3fv: record("uniform3fv"),
    uniform4fv: record("uniform4fv"),
    viewport: record("viewport"),
    clearColor: record("clearColor"),
    clear: record("clear"),
    drawArrays: record("drawArrays"),
    createTexture: handle("texture"),
    bindTexture: record("bindTexture"),
    texImage2D: record("texImage2D"),
    texParameteri: quiet,
    activeTexture: quiet,
    deleteTexture: quiet,
    createFramebuffer: handle("framebuffer"),
    bindFramebuffer: record("bindFramebuffer"),
    framebufferTexture2D: quiet,
    checkFramebufferStatus: () => 36053,
    deleteFramebuffer: quiet,
    deleteBuffer: quiet,
    getExtension: () => null,
  };

  return { gl: gl as unknown as WebGLRenderingContext, calls };
}
