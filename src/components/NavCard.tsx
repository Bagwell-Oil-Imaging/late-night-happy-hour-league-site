import { Link } from 'react-router-dom'
import './NavCard.css'

interface NavCardProps {
  to: string
  icon: string
  title: string
  description: string
  stat?: string
  statLabel?: string
}

function NavCard({ to, icon, title, description, stat, statLabel }: NavCardProps) {
  return (
    <Link to={to} className="nav-card">
      <div className="nav-card-icon">{icon}</div>
      <div className="nav-card-body">
        <h3 className="nav-card-title">{title}</h3>
        <p className="nav-card-description">{description}</p>
      </div>
      {stat && (
        <div className="nav-card-stat">
          <span className="nav-card-stat-value">{stat}</span>
          {statLabel && <span className="nav-card-stat-label">{statLabel}</span>}
        </div>
      )}
      <span className="nav-card-arrow">→</span>
    </Link>
  )
}

export default NavCard
