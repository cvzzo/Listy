import { Fragment, useRef, useState, type ReactNode } from 'react'
import { useDismissOnOutside } from '../hooks/useDismissOnOutside'
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
  // distruttive da quelle ordinarie.
  groups: MenuAction[][]
  // Il menu delle categorie vive dentro una riga di contenuto, non nell'header,
  // e usa un pulsante senza sfondo
  triggerClassName?: string
  // Di norma l'innesco e l'icona ⋮; nella barra in basso e invece una pastiglia di testo
  triggerContent?: ReactNode
  /**
   * Dove aprire il pannello. 'top-left' e per la barra in basso, che deve sempre
   * salire; 'auto' e per i menu sparsi nel contenuto, che scendono in cima alla
   * pagina e salgono in fondo, dove scendendo finirebbero fuori schermo.
   */
  placement?: 'bottom-right' | 'top-left' | 'auto'
}

function ActionMenu({
  label,
  groups,
  triggerClassName = 'icon-btn',
  triggerContent,
  placement = 'bottom-right',
}: ActionMenuProps) {
  const [open, setOpen] = useState(false)
  const [dropUp, setDropUp] = useState(placement === 'top-left')
  const rootRef = useRef<HTMLDivElement>(null)

  useDismissOnOutside(rootRef, () => setOpen(false), open)

  function togglePanel() {
    if (!open && placement === 'auto' && rootRef.current) {
      const { bottom } = rootRef.current.getBoundingClientRect()
      setDropUp(bottom > window.innerHeight * 0.55)
    }
    setOpen((prev) => !prev)
  }

  const panelClass = [
    'menu-panel',
    dropUp ? 'menu-panel-up' : '',
    placement === 'top-left' ? 'menu-panel-left' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className="menu" ref={rootRef}>
      <button
        type="button"
        className={triggerClassName}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={togglePanel}
      >
        {triggerContent ?? <IconMore />}
      </button>

      {open && (
        <div className={panelClass} role="menu" aria-label={label}>
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
