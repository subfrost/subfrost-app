// global.d.ts

import { PropsWithChildren } from 'react'

declare module '@radix-ui/react-tabs' {
  export interface TabsProps extends PropsWithChildren {}
  export interface TabsListProps extends PropsWithChildren {}
  export interface TabsTriggerProps extends PropsWithChildren {}
  export interface TabsContentProps extends PropsWithChildren {}
}
