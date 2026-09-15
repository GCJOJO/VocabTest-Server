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

	public static async DoIfConnected(callback: (connection: mysql.PoolConnection) => Promise<void>): Promise<void> {
		const connection = await this.con.getConnection();
		
		try {
			await callback(connection);
		}
		catch(error)
		{
			console.error("Cannot call callback in DoIfConnected : ", error);
		}
		finally
		{
			connection.release();
		}
	}

	public static async InsertIntoTable(table : string, data : any)
	{
		var baseQuery = Utils.format("INSERT INTO `{0}`", table);
		var varNames = "";
		var varFields = "";
		var varFieldData : any[] = [];
		var isFirst = true;

		var entries = Object.entries(data);

		for(var i = 0; i < entries.length; i++)
		{
			var field = entries[i];
			var fieldName = field?.[0];
			if(!fieldName)
				continue;

			var fieldData : any = field?.[1];
			console.log("Field Name :", fieldName)
			varFieldData.push(fieldData);

			if(isFirst)
			{
				isFirst = false;
				varNames += Utils.format("`{0}`", fieldName);
				varFields += "?";
				continue;
			}

			varNames += Utils.format(", `{0}`", fieldName);
			varFields += ", ?";
		}

		var query = Utils.format("{0} ({1}) VALUES ({2})", baseQuery, varNames, varFields);
		console.log("Query : ", query);

		var returnId = -1;
		await this.DoIfConnected(async (connection) => {
			try {
				var result = await connection.query<ResultSetHeader>(query, varFieldData);
				var affectedRows = result[0].affectedRows;
				console.log(affectedRows + " record(s) inserted");

				var insertedId = result[0].insertId;
				if(insertedId)
					returnId = insertedId;
			} catch (error) {
				console.error("Unable to insert into database : ", error);
			}
		});

		return returnId;
	}

	public static async ChangeRow(table: string, id : number, data : any)
	{
		var baseQuery = Utils.format("UPDATE `{0}` SET", table);

		var varFields = "";
		var varFieldData : any[] = [];
		var isFirst = true;

		var entries = Object.entries(data);

		for(var i = 0; i < entries.length; i++)
		{
			var field = entries[i];
			var fieldName = field?.[0];
			if(!fieldName)
				continue;

			var fieldData : any = field?.[1];
			console.log("Field Name :", fieldName)
			varFieldData.push(fieldData);

			if(isFirst)
			{
				isFirst = false;
				varFields += Utils.format("`{0}` = ?", fieldName);
				continue;
			}

			varFields += Utils.format(", `{0}` = ?", fieldName);
		}
		
		var id_check = Utils.format("WHERE `ID` = {0}", id);

		var query = Utils.format("{0} {1} {2}", baseQuery, varFields, id_check);
		console.log("Query : ", query);

		var returnId = -1;
		await this.DoIfConnected(async (connection) => {
			try {
				var result = await connection.query<ResultSetHeader>(query, varFieldData);
				var affectedRows = result[0].affectedRows;
				console.log(affectedRows + " record(s) updated");

				var insertedId = result[0].insertId;
				if(insertedId)
					returnId = insertedId;
			} catch (error) {
				console.error("Unable to update row ", id ," from database : ", error);
			}
		});

		return returnId;
	}

	public static async RemoveFromTable(table : string, id : number) 
	{
		this.DoIfConnected(async (connection) => {
			try {
				var query = Utils.format("DELETE FROM `{0}` WHERE `id` = ?", table);
				var result = await connection.query<ResultSetHeader>(query, [id]);
				var affectedRows = result[0].affectedRows;
				console.log(affectedRows + " record(s) deleted");
			} catch (error) {
				console.error("Error deleting word:", error);
			}
		});
	}

	public static async GetTable<T extends RowDataPacket>(table : string): Promise<T[]>
	{
		return new Promise((resolve, reject) => {
			this.DoIfConnected(async (connection) => {
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

	public static async CreateUser(uuid: string, username: string, first_name: string, last_name: string, password_hash: string) {
		return new Promise((resolve, reject) => {
			this.DoIfConnected(async (connection) => {
				try {
					var query = "INSERT INTO `users` (`uuid`, `username`, `first_name`, `last_name`, `password_hash`) VALUES (?, ?,  ?, ?, ?)";
					var result = await connection.query<ResultSetHeader>(query, [uuid, username, first_name, last_name, password_hash]);
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

	public static async Login(username: string, password: string) {
		return new Promise((resolve, reject) => {
			this.DoIfConnected(async (connection) => {
				try {
					var query = "SELECT `uuid` FROM `users` WHERE `username` = ?";
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

	public static async IsUserAdmin(uuid : string) {
		return new Promise((resolve, reject) => {
			this.DoIfConnected(async (connection) => {
				try {
					var query = "SELECT `uuid` WHERE `uuid` = ? AND `is_admin` = 1";
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

	public static async GetUserInfo(user_id: string) {
		return new Promise((resolve, reject) => {
			this.DoIfConnected(async (connection) => {
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

	public static async GetUsersInfo(user_ids: string[]) {
		return new Promise((resolve, reject) => {
			this.DoIfConnected(async function (connection) {
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

	public static GetUserScore(user_id: string) {
		return new Promise((resolve, reject) => {
			this.DoIfConnected(async function (connection) {
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

	public static async GetLeaderboard() {
		return new Promise((resolve, reject) => {
			this.DoIfConnected(async function (connection) {
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
