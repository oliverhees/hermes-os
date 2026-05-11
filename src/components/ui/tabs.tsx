'use client'

import { Tabs as TabsPrimitive } from '@base-ui/react/tabs'

import { cn } from '@/lib/utils'

type TabsVariant = 'default' | 'underline'

function Tabs({ className, ...props }: TabsPrimitive.Root.Props) {
  return (
    <TabsPrimitive.Root
      className={cn(
        'flex flex-col gap-2 data-[orientation=vertical]:flex-row',
        className,
      )}
      data-slot="tabs"
      {...props}
    />
  )
}

function TabsList({
  variant = 'default',
  className,
  children,
  ...props
}: TabsPrimitive.List.Props & {
  variant?: TabsVariant
}) {
  return (
    <TabsPrimitive.List
      className={cn(
        'relative z-0 flex w-fit items-center justify-center gap-x-0.5 text-zinc-500 dark:text-zinc-400',
        'data-[orientation=vertical]:flex-col',
        variant === 'default'
          ? 'p-0.5'
          : 'data-[orientation=vertical]:px-1 data-[orientation=horizontal]:py-1',
        className,
      )}
      data-slot="tabs-list"
      {...props}
    >
      {children}
      <TabsPrimitive.Indicator
        className={cn(
          '-translate-y-(--active-tab-bottom) absolute bottom-0 left-0 h-(--active-tab-height) w-(--active-tab-width) translate-x-(--active-tab-left) transition-[width,translate] duration-200 ease-in-out',
          variant === 'underline'
            ? 'data-[orientation=vertical]:-translate-x-px z-10 bg-violet-500 data-[orientation=horizontal]:h-0.5 data-[orientation=vertical]:w-0.5 data-[orientation=horizontal]:translate-y-px'
            : 'z-0 rounded-md bg-zinc-100 dark:bg-zinc-800',
        )}
        data-slot="tab-indicator"
      />
    </TabsPrimitive.List>
  )
}

function TabsTab({ className, ...props }: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      className={cn(
        '[&_svg]:-mx-0.5 relative z-10 flex h-8 shrink-0 grow cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 text-sm font-medium outline-none transition-[color,background-color,box-shadow] hover:text-zinc-900 dark:hover:text-zinc-100 focus-visible:ring-2 focus-visible:ring-violet-500 data-disabled:pointer-events-none data-[orientation=vertical]:w-full data-[orientation=vertical]:justify-start data-active:bg-violet-500/10 data-active:text-violet-500 dark:data-active:bg-violet-500/20 data-active:font-semibold data-disabled:opacity-50 [&_svg:not([class*="size-"])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0',
        className,
      )}
      data-slot="tabs-tab"
      {...props}
    />
  )
}

function TabsPanel({ className, ...props }: TabsPrimitive.Panel.Props) {
  return (
    <TabsPrimitive.Panel
      className={cn('flex-1 outline-none', className)}
      data-slot="tabs-content"
      {...props}
    />
  )
}

export {
  Tabs,
  TabsList,
  TabsTab,
  TabsTab as TabsTrigger,
  TabsPanel,
  TabsPanel as TabsContent,
}
