// ═══════════════════════════════════════════════════════════════════════════════
// BENNY'S FOOTBALL - Season Manager
// 16-game regular season. 10+ wins -> single-elimination playoffs.
// 16-0 -> straight to the championship. <10 wins -> season failed.
// State persists in localStorage so a season survives reloads.
// ═══════════════════════════════════════════════════════════════════════════════

class SeasonManager {
    constructor() {
        this.data = null;
        this.load();
    }

    load() {
        try {
            const raw = localStorage.getItem(LS_SEASON);
            if (raw) this.data = JSON.parse(raw);
        } catch (e) { this.data = null; }
    }

    save() {
        try { localStorage.setItem(LS_SEASON, JSON.stringify(this.data)); }
        catch (e) { /* ignore */ }
    }

    reset() {
        this.data = null;
        try { localStorage.removeItem(LS_SEASON); } catch (e) { /* ignore */ }
    }

    isActive() { return !!(this.data && this.data.active); }

    // Begin a fresh season with the chosen team colour.
    start(teamColorName) {
        this.data = {
            active: true,
            teamColor: teamColorName,
            wins: 0,
            losses: 0,
            gamesPlayed: 0,
            schedule: this._buildSchedule(teamColorName),
            results: [],              // { opp, us, them, win, stage }
            stage: 'regular',         // 'regular' | 'playoffs' | 'championship' | 'done' | 'failed' | 'champions'
            playoffRound: 0,          // index into SEASON.PLAYOFF_ROUNDS
            opponentColor: null       // colour for the current pending game
        };
        this._setNextOpponent();
        this.save();
        return this.data;
    }

    // Build a 16-game schedule: all unique opponents first (shuffled), then
    // random repeats to fill remaining slots. Player never faces their own colour.
    _buildSchedule(teamColorName) {
        const others = TEAM_COLORS.filter(c => c.name !== teamColorName).map(c => c.name);
        const shuffle = arr => {
            const a = [...arr];
            for (let i = a.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [a[i], a[j]] = [a[j], a[i]];
            }
            return a;
        };
        const schedule = [];
        while (schedule.length < SEASON.REGULAR_GAMES) {
            for (const name of shuffle(others)) {
                if (schedule.length >= SEASON.REGULAR_GAMES) break;
                schedule.push(name);
            }
        }
        return schedule;
    }

    // Returns names of opponents already faced in playoff/championship games.
    _playoffOpponentsUsed() {
        return (this.data.results || [])
            .filter(r => r.stage === 'playoffs' || r.stage === 'championship')
            .map(r => r.opp);
    }

    // Decide who we face next based on the current stage.
    // Playoff and championship opponents are always unique from each other.
    _setNextOpponent() {
        const d = this.data;
        if (d.stage === 'regular') {
            d.opponentColor = d.schedule[d.gamesPlayed];
        } else if (d.stage === 'playoffs' || d.stage === 'championship') {
            const used = new Set([d.teamColor, ...this._playoffOpponentsUsed()]);
            let choices = TEAM_COLORS.filter(c => !used.has(c.name));
            if (choices.length === 0) choices = TEAM_COLORS.filter(c => c.name !== d.teamColor);
            d.opponentColor = choices[Math.floor(Math.random() * choices.length)].name;
        }
    }

    // Human-readable label for the upcoming matchup.
    currentMatchupLabel() {
        const d = this.data;
        if (d.stage === 'regular') {
            return `GAME ${d.gamesPlayed + 1} OF ${SEASON.REGULAR_GAMES}`;
        }
        if (d.stage === 'playoffs') {
            return `PLAYOFFS: ${SEASON.PLAYOFF_ROUNDS[d.playoffRound]}`;
        }
        if (d.stage === 'championship') {
            return 'CHAMPIONSHIP GAME';
        }
        return '';
    }

    // Record the result of the just-finished game and advance the season.
    // Returns an outcome string describing the transition.
    recordResult(usScore, themScore) {
        const d = this.data;
        const win = usScore > themScore;
        d.results.push({ opp: d.opponentColor, us: usScore, them: themScore, win, stage: d.stage });

        if (d.stage === 'regular') {
            return this._advanceRegular(win);
        }
        if (d.stage === 'playoffs') {
            return this._advancePlayoffs(win);
        }
        if (d.stage === 'championship') {
            d.stage = win ? 'champions' : 'done';
            this.save();
            return win ? 'champions' : 'lost_championship';
        }
        this.save();
        return 'done';
    }

    _advanceRegular(win) {
        const d = this.data;
        d.gamesPlayed++;
        if (win) d.wins++; else d.losses++;

        if (d.gamesPlayed < SEASON.REGULAR_GAMES) {
            this._setNextOpponent();
            this.save();
            return 'next_game';
        }

        // Regular season complete.
        if (d.wins >= SEASON.PERFECT_WINS) {
            d.stage = 'championship';
            this._setNextOpponent();
            this.save();
            return 'perfect_to_championship';
        }
        if (d.wins >= SEASON.PLAYOFF_WIN_THRESHOLD) {
            d.stage = 'playoffs';
            d.playoffRound = 0;
            this._setNextOpponent();
            this.save();
            return 'made_playoffs';
        }
        d.stage = 'failed';
        this.save();
        return 'missed_playoffs';
    }

    _advancePlayoffs(win) {
        const d = this.data;
        if (!win) {
            d.stage = 'done';
            this.save();
            return 'eliminated';
        }
        // Won this round; advance.
        d.playoffRound++;
        if (d.playoffRound >= SEASON.PLAYOFF_ROUNDS.length) {
            // Won the final playoff round = champions.
            d.stage = 'champions';
            this.save();
            return 'champions';
        }
        this._setNextOpponent();
        this.save();
        return 'advanced_playoff';
    }

    isSeasonOver() {
        return this.data && ['done', 'failed', 'champions'].includes(this.data.stage);
    }

    // ─── Mid-game state persistence ──────────────────────────────────────────
    // Saves the in-progress game state so the player can resume across sessions.
    saveGameState(gs, onDefense, opp) {
        try {
            localStorage.setItem(LS_GAME_STATE, JSON.stringify({ gs, onDefense, opp }));
        } catch (e) { /* ignore */ }
    }

    loadGameState() {
        try {
            const raw = localStorage.getItem(LS_GAME_STATE);
            return raw ? JSON.parse(raw) : null;
        } catch (e) { return null; }
    }

    clearGameState() {
        try { localStorage.removeItem(LS_GAME_STATE); } catch (e) { /* ignore */ }
    }

    hasGameInProgress() {
        return !!this.loadGameState();
    }
}
