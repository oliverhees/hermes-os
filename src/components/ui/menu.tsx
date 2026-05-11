'use client'

import { Menu } from '@base-ui/react/menu'
import { cn } from '@/lib/utils'

type MenuRootProps = React.ComponentProps<typeof Menu.Root>

function MenuRoot({ children, ...props }: MenuRootProps) {
  return <Menu.Root {...props}>{children}</Menu.Root>
}

type MenuTriggerProps = React.ComponentProps<typeof Menu.Trigger>

function MenuTrigger({ className, ...props }: MenuTriggerProps) {
  return <Menu.Trigger className={cn(className)} {...props} />
}

type MenuContentProps = {
  className?: string
  side?: 'top' | 'bottom' | 'left' | 'right'
  align?: 'start' | 'center' | 'end'
  children: React.ReactNode
}

function MenuContent({
  className,
  side = 'bottom',
  align = 'end',
  children,
}: MenuContentProps) {
  return (
    <Menu.Portal>
      <Menu.Positioner side={side} align={align}>
        <Menu.Popup
          className={cn(
            'min-w-[110px] rounded-lg p-1 text-sm shadow-lg bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-800',
            className,
          )}
          style={{
            boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            opacity: 1,
            zIndex: 9999,
          }}
        >
          {children}
        </Menu.Popup>
      </Menu.Positioner>
    </Menu.Portal>
  )
}

type MenuItemProps = React.ComponentProps<typeof Menu.Item>

function MenuItem({ className, ...props }: MenuItemProps) {
  return (
    <Menu.Item
      className={cn(
        'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm select-none font-[450] text-zinc-900 dark:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800',
        className,
      )}
      {...props}
    />
  )
}

export { MenuRoot, MenuTrigger, MenuContent, MenuItem }
