/// <reference types="vite/client" />

declare module "monaco-vs/editor/editor.api.js" {
  export * from "monaco-editor";
}
declare module "monaco-vs/*" {
  const mod: unknown;
  export default mod;
}
declare module "*?worker" {
  const WorkerCtor: new () => Worker;
  export default WorkerCtor;
}
