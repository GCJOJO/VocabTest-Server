import mysql, { type OkPacketParams, type Pool, type ResultSetHeader, type RowDataPacket } from "mysql2";
import cron from "node-cron";

interface Word extends RowDataPacket {
	id: number;
	french: string;
	context: string;
	prefix: string;
	english: string;
}
interface Verb extends RowDataPacket {
	id: number;
	french: string;
	infinitive: string;
	preterit: string;
	past_participle: string;
}

interface Country extends RowDataPacket {
	id: number;
	french: string;
	english: string;
}

export class DatabaseConnection {
	static con: Pool = mysql.createPool({
		host: "localhost",
		user: "vocab-test",
		password: "bonjoirjesuisleservernode",
		database: "vocab-test",
		waitForConnections: true,
		connectionLimit: 10,
		queueLimit: 10,
		enableKeepAlive: true,
		keepAliveInitialDelay: 0,
	});

	static cachedWords: Word[] = [];
	static cachedVerbs: Verb[] = [];
	static cachedCountries: Country[] = [];
	static cachedGrammar: Word[] = [];
	static cachedGaming: Word[] = [];

	public static DoIfConnected(callback: (connection: mysql.PoolConnection) => Promise<void>) {
		try {
			this.con.getConnection(function (err, connection) {
				if (err) {
					console.error("Error connecting to database:", err);
					return;
				}

				!(async function () {
					await callback(connection);
					connection.release();
				})();
			});
		} catch (error) {
			console.error("Error connecting to database:", error);
		}
	}

	public static GetWords() {
		this.DoIfConnected(async (connection) => {
			try {
				var query = "SELECT * FROM `words`";
				var [rows] = await connection.promise().query<Word[]>(query);
				this.cachedWords = rows;
			} catch (error) {
				console.error("Error fetching words:", error);
			}
		});
		return this.cachedWords;
	}

	public static GetVerbs() {
		this.DoIfConnected(async (connection) => {
			try {
				var query = "SELECT * FROM `verbs`";
				var [rows] = await connection.promise().query<Verb[]>(query);
				this.cachedVerbs = rows;
			} catch (error) {
				console.error("Error fetching verbs:", error);
			}
		});
		return this.cachedVerbs;
	}

	public static GetCountries() {
		this.DoIfConnected(async (connection) => {
			try {
				var query = "SELECT * FROM `country`";
				var [rows] = await connection.promise().query<Country[]>(query);
				this.cachedCountries = rows;
			} catch (error) {
				console.error("Error fetching countries:", error);
			}
		});
		return this.cachedCountries;
	}

	public static GetGrammar() {
		this.DoIfConnected(async (connection) => {
			try {
				var query = "SELECT * FROM `grammar`";
				var [rows] = await connection.promise().query<Word[]>(query);
				this.cachedGrammar = rows;
			} catch (error) {
				console.error("Error fetching grammar:", error);
			}
		});
		return this.cachedGrammar;
	}

	public static GetGaming() {
		this.DoIfConnected(async (connection) => {
			try {
				var query = "SELECT * FROM `gaming`";
				var [rows] = await connection.promise().query<Word[]>(query);
				this.cachedGaming = rows;
			} catch (error) {
				console.error("Error fetching gaming:", error);
			}
		});
		return this.cachedGaming;
	}

	public static AddWord(french: string, context: string, prefix: string, english: string) {
		this.DoIfConnected(async (connection) => {
			try {
				var query = "INSERT INTO `words` (`french`, `context`, `prefix`, `english`) VALUES (?, ?, ?, ?)";
				var result = await connection.promise().query<ResultSetHeader>(query, [french, context, prefix, english]);
				var affectedRows = result[0].affectedRows;
				console.log(affectedRows + " record(s) inserted");
			} catch (error) {
				console.error("Error adding word:", error);
			}
		});
	}

	public static ChangeWord(id: number, french: string, context: string, prefix: string, english: string) {
		this.DoIfConnected(async (connection) => {
			try {
				var query = "UPDATE `words` SET `french` = ?, `context` = ?, `prefix` = ?, `english` = ? WHERE `id` = ?";
				var result = await connection.promise().query<ResultSetHeader>(query, [french, context, prefix, english, id]);
				var affectedRows = result[0].affectedRows;
				console.log(affectedRows + " record(s) updated");
			} catch (error) {
				console.error("Error updating word:", error);
			}
		});
	}

	public static RemoveWord(id: number) {
		this.DoIfConnected(async (connection) => {
			try {
				var query = "DELETE FROM `words` WHERE `id` = ?";
				var result = await connection.promise().query<ResultSetHeader>(query, [id]);
				var affectedRows = result[0].affectedRows;
				console.log(affectedRows + " record(s) deleted");
			} catch (error) {
				console.error("Error deleting word:", error);
			}
		});
	}

	public static AddCountry(french : string, english : string) {
		this.DoIfConnected(async (connection) => {
			try {
				var query = "INSERT INTO `country` (`french`, `english`) VALUES (?, ?)";
				var result = await connection.promise().query<ResultSetHeader>(query, [french, english]);
				var affectedRows = result[0].affectedRows;
				console.log(affectedRows + " record(s) inserted");
			} catch(error)
			{
				console.error("Error adding country:", error);
			}
		});
	}

	public static async CreateUser(uuid: string, username: string, first_name: string, last_name: string, password_hash: string) {
		return new Promise((resolve, reject) => {
			this.DoIfConnected(async (connection) => {
				try {
					var query = "INSERT INTO `users` (`uuid`, `username`, `first_name`, `last_name`, `password_hash`) VALUES (?, ?,  ?, ?, ?)";
					var result = await connection.promise().query<ResultSetHeader>(query, [uuid, username, first_name, last_name, password_hash]);
					var affectedRows = result[0].affectedRows;
					console.log(affectedRows + " record(s) inserted");
					resolve(affectedRows >= 1);
				} catch (e) {
					console.error("Error creating user:", e);
					reject(e);
				}
			});
		});
	}

	public static async Login(username: string, password_hash: string) {
		return new Promise((resolve, reject) => {
			this.DoIfConnected(async (connection) => {
				try {
					var query = "SELECT `uuid` FROM `users` WHERE `username` = ? AND `password_hash` = ?";
					var [rows, fields] = await connection.promise().query<RowDataPacket[]>(query, [username, password_hash]);
					if (rows.length > 0 && rows[0] != null) {
						resolve({ success: true, uuid: rows[0].uuid });
					} else {
						resolve({ success: false });
					}
				} catch (e) {
					reject(e);
				}
			});
		});
	}

	public static async GetUserInfo(user_id: string) {
		return new Promise((resolve, reject) => {
			this.DoIfConnected(async (connection) => {
				try {
					var query = "SELECT `uuid`, `username`, `first_name`, `last_name` FROM `users` WHERE `uuid` = ?";
					var [rows, fields] = await connection.promise().query<RowDataPacket[]>(query, [user_id]);
					if (rows.length > 0 && rows[0] != null) {
						resolve({ success: true, user_info: rows[0] });
					} else {
						resolve({ success: false });
					}
				} catch (e) {
					reject(e);
				}
			});
		});
	}

	public static async GetUsersInfo(user_ids: string[]) {
		return new Promise((resolve, reject) => {
			this.DoIfConnected(async function (connection) {
				try {
					var query = "SELECT `uuid`, `username`, `first_name`, `last_name` FROM `users` WHERE `uuid` IN (?)";
					var [rows, fields] = await connection.promise().query<RowDataPacket[]>(query, [user_ids]);
					resolve({ success: true, users_info: rows });
				} catch (e) {
					reject(e);
				}
			});
		});
	}

	public static GetUserScore(user_id: string) {
		return new Promise((resolve, reject) => {
			this.DoIfConnected(async function (connection) {
				try {
					var query = "SELECT `score` FROM `users` WHERE `uuid` = ?";
					var [rows, fields] = await connection.promise().query<RowDataPacket[]>(query, [user_id]);
					if (rows.length > 0 && rows[0] != null) {
						resolve({ success: true, score: rows[0].score });
					} else {
						resolve({ success: false });
					}
				} catch (e) {
					reject(e);
				}
			});
		});
	}

	public static async UpdateUserScore(user_id: string, score: number) {
		return new Promise((resolve, reject) => {
			this.DoIfConnected(async function (connection) {
				try {
					var current_score: any = await DatabaseConnection.GetUserScore(user_id);
					if (!current_score.success) {
						return resolve({ success: false });
					}

					if (score <= current_score.score) {
						return resolve({ success: false, new_score: current_score.score });
					}

					var query = "UPDATE `users` SET `score` = ? WHERE `uuid` = ?";
					var result = await connection.promise().query<ResultSetHeader>(query, [score, user_id]);
					var affectedRows = result[0].affectedRows;
					if (affectedRows >= 1) {
						resolve({ success: true, new_score: score });
					} else {
						resolve({ success: false });
					}
				} catch (e) {
					reject(e);
				}
			});
		});
	}

	public static async GetLeaderboard() {
		return new Promise((resolve, reject) => {
			this.DoIfConnected(async function (connection) {
				try {
					var query = "SELECT `uuid`, `username`, `score` FROM `users` ORDER BY `score` DESC";
					var [rows, fields] = await connection.promise().query<RowDataPacket[]>(query);
					resolve({ success: true, leaderboard: rows.filter((row) => row != null && row.score > 0) });
				} catch (e) {
					reject(e);
				}
			});
		});
	}
}
