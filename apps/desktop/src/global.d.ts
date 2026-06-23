import type { TitanbaseFileAdapter } from "@titanbase/editor";

declare global {
  interface Window {
    titanbaseDesktop: TitanbaseFileAdapter;
  }
}

export {};
