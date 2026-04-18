import './HamburgerMenu.css'

interface HamburgerMenuProps {
  isOpen: boolean
  onToggle: () => void
}

function HamburgerMenu({ isOpen, onToggle }: HamburgerMenuProps) {
  return (
    <button
      className={`hamburger ${isOpen ? 'open' : ''}`}
      onClick={onToggle}
      aria-label="Toggle menu"
      aria-expanded={isOpen}
    >
      <span className="hamburger-line"></span>
      <span className="hamburger-line"></span>
      <span className="hamburger-line"></span>
    </button>
  )
}

export default HamburgerMenu
