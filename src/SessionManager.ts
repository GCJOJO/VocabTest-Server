import { Database } from "bun:sqlite";

interface Session {
  user_id: string;
  expires_at: number;
}

interface SessionRow
{
    user_id : string,
    expires_at : number
}

class SessionManager
{
    static db : Database;
    static readonly SESSIONS_DURATION_MS = 31 * 24 * 60 * 60 * 1000;

    static init()
    {
        this.db = new Database("sessions.sqlite");

        this.db.run(`CREATE TABLE IF NOT EXISTS sessions (
            token TEXT PRIMARY_KEY,
            user_id TEXT NOT NULL,
            expires_at INTEGER NOT NULL
            )`
        );

        this.db.run(`CREATE INDEX IF NOT EXISTS idx_sessions_expires_at on sessions(expires_at)`)
    }

    static create_session(user_id : string) : string
    {
        const token = crypto.randomUUID() + crypto.randomUUID();
        const expires_at = Date.now() + this.SESSIONS_DURATION_MS;

        this.db.run("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)", [
            token,
            user_id,
            expires_at
        ]);

        return token;
    }

    static verify_session(token : string) : string | null
    {
        const row = this.db
            .query("SELECT user_id, expires_at FROM sessions WHERE token = ?")
            .get(token) as SessionRow | null;

        if(!row) return null;

        if(Date.now() > row.expires_at)
        {
            this.destroy_session(token);
            return null;
        }

        return row.user_id;
    }

    static destroy_session(token : string) : void 
    {
        this.db.run("DELETE FROM sessions WHERE token = ?", [token]);
    }

    static destroy_all_user_sessions(user_id : string) : void
    {
        this.db.run("DELETE FROM sessions WHERE user_id = ?", [user_id]);
    }

    static clean_expired_session() : void
    {
        try{
            if(!this.db)
            {
                console.log("Error with database !");
                return;
            }
            const result = this.db.run("DELETE FROM sessions WHERE expires_at < ?", [Date.now()]);
            if(result.changes > 0)
                console.log(`Cleaned ${result.changes} session(s)`);
        }
        catch (error)
        {
            console.error(error);
        }
    }


}

export { SessionManager }

Bun.cron("@hourly", SessionManager.clean_expired_session);