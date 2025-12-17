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

declare module '@tanstack/react-query' {
  export function useInfiniteQuery<
    TQueryFnData = unknown,
    TError = unknown,
    TData = TQueryFnData,
    TQueryKey extends any[] = any[],
    TPageParam = unknown
  >(options: {
    queryKey: TQueryKey;
    queryFn: (context: { pageParam: TPageParam }) => Promise<TQueryFnData>;
    initialPageParam: TPageParam;
    getNextPageParam: (lastPage: TQueryFnData) => TPageParam | null | undefined;
    enabled?: boolean;
    staleTime?: number;
    [key: string]: any;
  }): {
    data: { pages: TQueryFnData[]; pageParams: TPageParam[] } | undefined;
    fetchNextPage: () => Promise<any>;
    hasNextPage: boolean;
    isFetchingNextPage: boolean;
    isLoading: boolean;
    isError: boolean;
    error: TError | null;
    refetch: () => Promise<any>;
    [key: string]: any;
  };
  export function useQuery<TData = unknown, TError = unknown>(options: any): any;
  export function useMutation<TData = unknown, TError = unknown>(options: any): any;
  export function useQueryClient(): any;
  export class QueryClient {
    constructor(config?: any);
    setQueryData(key: any, data: any): void;
    getQueryData(key: any): any;
    invalidateQueries(filters?: any): Promise<void>;
    [key: string]: any;
  }
  export function QueryClientProvider(props: { client: QueryClient; children: any }): any;
  export type InfiniteData<T, TPageParam = unknown> = {
    pages: T[];
    pageParams: TPageParam[];
  };
}