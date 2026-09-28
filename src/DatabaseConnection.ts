import mysql, { type Pool, type ResultSetHeader, type RowDataPacket } from "mysql2/promise";
import { Utils } from "./Utils/Utils"
import { UserManager } from "./UserManager";

export interface Word extends RowDataPacket {
	id: number;
	french: string;
	context: string;
	prefix: string;
	english: string;
}

export interface Verb extends RowDataPacket {
	id: number;
	french: string;
	infinitive: string;
	preterit: string;
	past_participle: string;
}

export interface Country extends RowDataPacket {
	id: number;
	french: string;
	english: string;
}

export class Tables {
	public static WORDS 	= "words";
	public static VERBS 	= "verbs";
	public static COUNTRY 	= "country";
	public static GRAMMAR 	= "grammar";
	public static GAMING 	= "gaming";
}

export class DatabaseConnection {
	static con: Pool;

	public static async init()
	{
		try{
			DatabaseConnection.con = mysql.createPool({
				host: "localhost",
				user: "vocab-test",
				password: Bun.env.DB_PASSWORD,
				database: "vocab-test",
				waitForConnections: true,
				connectionLimit: 10,
				queueLimit: 10,
				enableKeepAlive: true,
				keepAliveInitialDelay: 0,
			});
			console.log("Connected to database !"); 
		}
		catch(error : any)
		{
			console.error("Couldn't connect to database !", error);
		}
	}

	private static columnCache = new Map<string, string[]>();

	public static async getEditableColumns(table: string): Promise<string[]> {
		const cached = this.columnCache.get(table);
		if (cached) return cached;

		return new Promise((resolve, reject) => {
			this.doIfConnected(async (connection) => {
				try {
					const [rows] = await connection.query<RowDataPacket[]>(`SHOW COLUMNS FROM \`${table}\``);
					const columns = rows
						.filter(r => !String(r.Extra).includes("auto_increment")) // exclut id
						.map(r => r.Field as string);
					this.columnCache.set(table, columns);
					resolve(columns);
				} catch (e) { reject(e); }
			});
		});
	}

	public static async doIfConnected(callback: (connection: mysql.PoolConnection) => Promise<void>): Promise<void> {
		return new Promise(async (resolve, reject) => {
		let connection : mysql.PoolConnection | null = null;
			try {
				connection = await this.con.getConnection();
				resolve(await callback(connection));
			}
			catch(error)
			{
				console.error("Cannot call callback in DoIfConnected : ", error);
				reject(error);
			}
			finally
			{
				if (connection)
					connection.release();
			}
		});
	}

	public static async insertRow(table : string, data : Record<string, unknown>) : Promise<number>
	{
		const columns = (await this.getEditableColumns(table)).filter(c => c in data);
		if (columns.length === 0) throw new Error("Aucun champ valide");

		return new Promise((resolve, reject) => {
			this.doIfConnected(async (connection) => {
				try {
					const cols = columns.map(c => `\`${c}\``).join(", ");
					const placeholders = columns.map(() => "?").join(", ");
					const [result] = await connection.query<ResultSetHeader>(
						`INSERT INTO \`${table}\` (${cols}) VALUES (${placeholders})`,
						columns.map(c => data[c] ?? null)
					);
					resolve(result.insertId);
				} catch (e) { reject(e); }
			});
		});
	}

	public static async updateRow(table: string, id : number, data : Record<string, unknown>) : Promise<boolean>
	{
		const columns = (await this.getEditableColumns(table)).filter(c => c in data);
		if (columns.length === 0) throw new Error("Aucun champ valide");

		return new Promise((resolve, reject) => {
			this.doIfConnected(async (connection) => {
				try {
					const assignments = columns.map(c => `\`${c}\` = ?`).join(", ");
					const [result] = await connection.query<ResultSetHeader>(
						`UPDATE \`${table}\` SET ${assignments} WHERE \`id\` = ?`,
						[...columns.map(c => data[c] ?? null), id]
					);
					resolve(result.affectedRows >= 1);
				} catch (e) { reject(e); }
			});
		});
	}

	public static async deleteRow(table : string, id : number) : Promise<boolean>
	{
		var removed = false;
		await this.doIfConnected(async (connection) => {
			try {
				var query = Utils.format("DELETE FROM `{0}` WHERE `id` = ?", table);
				var result = await connection.query<ResultSetHeader>(query, [id]);
				var affectedRows = result[0].affectedRows;
				console.log(affectedRows + " record(s) deleted");
				if(affectedRows >= 1)
					removed = true
			} catch (error) {
				console.error("Error deleting word:", error);
			}
		});

		return removed;
	}

	public static async getTable<T extends RowDataPacket>(table : string): Promise<T[]>
	{
		return new Promise((resolve, reject) => {
			this.doIfConnected(async (connection) => {
				try {
					var query = Utils.format("SELECT * FROM `{0}`", table);
					var [rows] = await connection.query<T[]>(query);
					resolve(rows);
				} catch (error) {
					console.error("Error fetching table ", table, ", ", error);
					reject(error);
				}
			});
		});
	}

	public static async createUser(uuid: string, username: string, first_name: string, last_name: string, password_hash: string) : Promise<{success: boolean, error?: any}> {
		return new Promise((resolve, reject) => {
			this.doIfConnected(async (connection) => {
				try {
					var query = "INSERT INTO `users` (`uuid`, `username`, `first_name`, `last_name`, `password_hash`) VALUES (?, ?,  ?, ?, ?)";
					var result = await connection.query<ResultSetHeader>(query, [uuid, username, first_name, last_name, password_hash]);
					var affectedRows = result[0].affectedRows;
					console.log(affectedRows + " record(s) inserted");
					if(affectedRows >= 1)
						resolve({ success: true });
					else
						resolve({ success: false, error: "Failed to create user" });
				} catch (e) {
					console.error("Error creating user:", e);
					reject(e);
				}
			});
		});
	}

	public static async login(username: string, password: string) {
		return new Promise((resolve, reject) => {
			this.doIfConnected(async (connection) => {
				try {
					var query = "SELECT `uuid`, `username`, `password_hash` FROM `users` WHERE `username` = ?";
					var [rows, fields] = await connection.query<RowDataPacket[]>(query, [username]);
					if (rows.length > 0 && rows[0] != null) {
						const user = rows[0];
						if(await UserManager.check_password(password, user.password_hash))
						{
							resolve({ success: true, uuid: rows[0].uuid });
							return;
						}
					}
					resolve({ success: false });
					return;
				} catch (e) {
					reject(e);
				}
			});
		});
	}

	public static async isUserAdmin(uuid : string) {
		return new Promise((resolve, reject) => {
			this.doIfConnected(async (connection) => {
				try {
					var query = "SELECT `uuid` FROM `admin_user` WHERE `uuid` = ?";
					var [rows, fields] = await connection.query<RowDataPacket[]>(query, [uuid]);
					if (rows.length > 0 && rows[0] != null) {
						resolve({ success: true, });
					} else {
						resolve({ success: false });
					}
				} catch (e) {
					reject(e);
				}
			});
		});
	}

	public static async getUserInfo(user_id: string) : Promise<{success : boolean, user_info? : RowDataPacket}> {
		return new Promise((resolve, reject) => {
			this.doIfConnected(async (connection) => {
				try {
					var query = "SELECT `uuid`, `username`, `first_name`, `last_name` FROM `users` WHERE `uuid` = ?";
					var [rows, fields] = await connection.query<RowDataPacket[]>(query, [user_id]);
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

	public static async getUsersInfo(user_ids: string[]) {
		return new Promise((resolve, reject) => {
			this.doIfConnected(async function (connection) {
				try {
					var query = "SELECT `uuid`, `username`, `first_name`, `last_name` FROM `users` WHERE `uuid` IN (?)";
					var [rows, fields] = await connection.query<RowDataPacket[]>(query, [user_ids]);
					resolve({ success: true, users_info: rows });
				} catch (e) {
					reject(e);
				}
			});
		});
	}

	public static getUserScore(user_id: string) {
		return new Promise((resolve, reject) => {
			this.doIfConnected(async function (connection) {
				try {
					var query = "SELECT `score` FROM `users` WHERE `uuid` = ?";
					var [rows, fields] = await connection.query<RowDataPacket[]>(query, [user_id]);
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

	public static async updateUserScore(user_id: string, score: number) {
		return new Promise((resolve, reject) => {
			this.doIfConnected(async function (connection) {
				try {
					var current_score: any = await DatabaseConnection.getUserScore(user_id);
					if (!current_score.success) {
						return resolve({ success: false });
					}

					if (score <= current_score.score) {
						return resolve({ success: false, new_score: current_score.score });
					}

					var query = "UPDATE `users` SET `score` = ? WHERE `uuid` = ?";
					var result = await connection.query<ResultSetHeader>(query, [score, user_id]);
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

	public static async getLeaderboard() {
		return new Promise((resolve, reject) => {
			this.doIfConnected(async function (connection) {
				try {
					var query = "SELECT `uuid`, `username`, `score` FROM `users` ORDER BY `score` DESC";
					var [rows, fields] = await connection.query<RowDataPacket[]>(query);
					resolve({ success: true, leaderboard: rows.filter((row) => row != null && row.score > 0) });
				} catch (e) {
					reject(e);
				}
			});
		});
	}
}
