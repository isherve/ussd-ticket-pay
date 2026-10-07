/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ADMIN_SECRET?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface QrDetector {
  detect: (source: CanvasImageSource) => Promise<Array<{ rawValue: string }>>;
}

interface Window {
  BarcodeDetector?: new (options?: { formats?: string[] }) => QrDetector;
}
