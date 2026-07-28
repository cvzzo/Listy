import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react'
import { IconMore } from './icons'

type MenuAction = {
  label: string
  icon: ReactNode
  onSelect: () => void
  disabled?: boolean
  danger?: boolean
}

type ActionMenuProps = {
  label: string
  // Ogni gruppo è separato da una riga: serve a staccare visivamente le azioni
  // sugli articoli da quelle sulle categorie.
  groups: MenuAction[][]
}

function ActionMenu({ label, groups }: ActionMenuProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return

    function handlePointerDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  return (
    <div className="menu" ref={rootRef}>
      <button
        type="button"
        className="icon-btn"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
      >
        <IconMore />
      </button>

      {open && (
        <div className="menu-panel" role="menu" aria-label={label}>
          {groups.map((actions, groupIndex) => (
            <Fragment key={groupIndex}>
              {groupIndex > 0 && <div className="menu-separator" role="separator" />}
              {actions.map((action) => (
                <button
                  key={action.label}
                  type="button"
                  role="menuitem"
                  className={action.danger ? 'menu-item danger' : 'menu-item'}
                  disabled={action.disabled}
                  onClick={() => {
                    setOpen(false)
                    action.onSelect()
                  }}
                >
                  {action.icon}
                  {action.label}
                </button>
              ))}
            </Fragment>
          ))}
        </div>
      )}
    </div>
  )
}

export default ActionMenu
