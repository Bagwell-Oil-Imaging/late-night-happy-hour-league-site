import LeagueStandings from '../components/LeagueStandings'
import AwardLeaders from '../components/AwardLeaders'
import SeasonPlaceholder from '../components/SeasonPlaceholder'
import { useSeasonStatus } from '../context/SeasonContext'

function StandingsPage() {
  const { seasonActive, loading } = useSeasonStatus()

  if (!loading && !seasonActive) {
    return (
      <SeasonPlaceholder
        pageTitle="Standings"
        whatYoullSee="you'll see the full team standings table ranked by points, plus season award leaders."
      />
    )
  }

  return (
    <div className="page-content">
      <LeagueStandings />
      <AwardLeaders />
    </div>
  )
}

export default StandingsPage
