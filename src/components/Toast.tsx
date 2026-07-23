type ToastProps = {
  message: string
  actionLabel: string
  onAction: () => void
  onDismiss: () => void
}

function Toast({ message, actionLabel, onAction, onDismiss }: ToastProps) {
  return (
    <div className="toast">
      <span className="toast-message">{message}</span>
      <button type="button" className="toast-action" onClick={onAction}>
        {actionLabel}
      </button>
      <button type="button" className="toast-close" onClick={onDismiss} aria-label="Chiudi">
        ×
      </button>
    </div>
  )
}

export default Toast
