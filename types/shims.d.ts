/**
 * Temporary type shims to satisfy VS Code on host without local node_modules.
 * Remove this file once local node_modules are available on the host.
 */
declare module 'next' {
  export type Metadata = {
    title?: string;
    description?: string;
    [key: string]: any;
  };
}

declare module 'next/font/google' {
  export function Geist(options: { variable?: string; subsets?: string[] }): any;
  export function Geist_Mono(options: { variable?: string; subsets?: string[] }): any;
}

declare module 'sonner' {
  export interface ToasterProps {
    richColors?: boolean;
    position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
  }
  export const Toaster: (props: ToasterProps) => any;
}

declare namespace React {
  type ReactNode = any;
}

declare namespace JSX {
  interface IntrinsicElements {
    [elemName: string]: any;
  }
}
// Temporary shims to satisfy VS Code on host without local node_modules.
// Remove these when host-side node_modules is available or when using Dev Containers.

declare module 'next/server' {
  export type NextRequest = any;
  export type NextResponse = any;
  export const NextResponse: any;
}

declare module 'next-auth' {
  export function getServerSession(...args: any[]): Promise<any>;
}