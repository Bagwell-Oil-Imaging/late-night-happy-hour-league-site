import './App.css'
import Header from './components/Header'
import Carousel from './components/Carousel'
import Calendar from './components/Calendar'
import UpcomingEvents from './components/UpcomingEvents'
import LeagueStandings from './components/LeagueStandings'
import SeasonScores from './components/SeasonScores'
import FutureMatchups from './components/FutureMatchups'
import LeagueSeasons from './components/LeagueSeasons'
import PlayoffBracket from './components/PlayoffBracket'
import PinnedAnnouncement from './components/PinnedAnnouncement'

function App() {
  return (
    <div className="app">
      <Header />
      <PinnedAnnouncement />
      <main className="main-content">
        <Carousel />
        <div className="content-grid">
          <section className="section">
            <UpcomingEvents />
          </section>
          <section className="section">
            <Calendar />
          </section>
        </div>
        <section className="section">
          <LeagueStandings />
        </section>
        <section className="section">
          <PlayoffBracket />
        </section>
        <section className="section">
          <FutureMatchups />
        </section>
        <section className="section">
          <SeasonScores />
        </section>
        <section className="section">
          <LeagueSeasons />
        </section>
      </main>
      <footer className="footer">
        <p>&copy; 2025 Late Night Happy Hour Bowling League. All rights reserved.</p>
      </footer>
    </div>
  )
}

export default App
