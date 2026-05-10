import mysql from "mysql2";

let con = mysql.createConnection({
	host: "localhost",
	user: "vocab-test",
	password: "bonjoirjesuisleservernode",
	database: "vocab-test",
});

var cachedWords = [];
var cachedVerbs = [];
var cachedCountries = [];
var cachedGrammar = [];

export function getWords() {
	con.connect(function (err) {
		if (err) throw err;
		!(async function () {
			var query = "SELECT * FROM `words`";
			var [rows, fields] = await con.promise().query(query);
			cachedWords = rows;
		})();
	});
	return cachedWords;
}

export function getVerbs() {
	con.connect(function (err) {
		if (err) throw err;
		!(async function () {
			var query = "SELECT * FROM `verbs`";
			var [rows, fields] = await con.promise().query(query);
			cachedVerbs = rows;
		})();
	});
	return cachedVerbs;
}

export function getCountries() {
	con.connect(function (err) {
		if (err) throw err;
		!(async function () {
			var query = "SELECT * FROM `country`";
			var [rows, fields] = await con.promise().query(query);
			cachedCountries = rows;
		})();
	});
	return cachedCountries;
}

export function getGrammar() {
	con.connect(function (err) {
		if (err) throw err;
		!(async function () {
			var query = "SELECT * FROM `grammar`";
			var [rows, fields] = await con.promise().query(query);
			cachedGrammar = rows;
		})();
	});
	return cachedGrammar;
}

export function addWord(french, context, prefix, english) {
	con.connect(function (err) {
		if (err) throw err;
		!(async function () {
			var query = "INSERT INTO `words` (`français`, `contexte`, `prefix` `anglais`) VALUES (?, ?, ?, ?)";
			var result = await con.promise().query(query, [french, context, prefix, english]);
			var affectedRows = result[0].affectedRows;
			console.log(affectedRows + " record(s) inserted");
		})();
	});
}

export function changeWord(id, french, context, prefix, english) {
	con.connect(function (err) {
		if (err) throw err;
		!(async function () {
			var query = "UPDATE `words` SET `français` = ?, `contexte` = ?, `prefix` = ?, `anglais` = ? WHERE `identifiant` = ?";
			var result = await con.promise().query(query, [french, context, prefix, english, id]);
			var affectedRows = result[0].affectedRows;
			console.log(affectedRows + " record(s) updated");
		}
		)();
	});
}

export function removeWord(id) {
	con.connect(function (err) {
		if (err) throw err;
		!(async function () {
			var query = "DELETE FROM `words` WHERE `identifiant` = ?";
			var result = await con.promise().query(query, [id]);
			var affectedRows = result[0].affectedRows;
			console.log(affectedRows + " record(s) deleted");
		})();
	});
}

export async function createUser(uuid, username, first_name, last_name, password_hash) {
	return new Promise((resolve, reject) => {
		con.connect(function (err) {
			if (err) {
				return reject(err);
			}
			(async function () {
				try {
					var query = "INSERT INTO `users` (`uuid`, `username`, `first_name`, `last_name`, `password_hash`) VALUES (?, ?,  ?, ?, ?)";
					var result = await con.promise().query(query, [uuid, username, first_name, last_name, password_hash]);
					var affectedRows = result[0].affectedRows;
					console.log(affectedRows + " record(s) inserted");
					resolve(affectedRows >= 1);
				} catch (e) {
					reject(e);
				}
			})();
		});
	});
}

export async function login(username, password_hash) {
	return new Promise((resolve, reject) => {
		con.connect(function (err) {
			if (err) {
				return reject(err);
			}
			(async function () {
				try {
					var query = "SELECT `uuid` FROM `users` WHERE `username` = ? AND `password_hash` = ?";
					var [rows, fields] = await con.promise().query(query, [username, password_hash]);
					if (rows.length > 0) {
						resolve({ success: true, uuid: rows[0].uuid });
					} else {
						resolve({ success: false });
					}
				} catch (e) {
					reject(e);
				}
			})();
		});
	});
}

export async function getUserInfo(user_id) {
	return new Promise((resolve, reject) => {
		con.connect(function (err) {
			if (err) {
				return reject(err);
			}
			(async function () {
				try {
					var query = "SELECT `uuid`, `username`, `first_name`, `last_name` FROM `users` WHERE `uuid` = ?";
					var [rows, fields] = await con.promise().query(query, [user_id]);
					if (rows.length > 0) {
						resolve({ success: true, user_info: rows[0] });
					} else {
						resolve({ success: false });
					}
				} catch (e) {
					reject(e);
				}
			})();
		});
	});
}

export async function getUsersInfo(user_ids) {
	return new Promise((resolve, reject) => {
		con.connect(function (err) {
			if (err) {
				return reject(err);
			}
			(async function () {
				try {
					var query = "SELECT `uuid`, `username`, `first_name`, `last_name` FROM `users` WHERE `uuid` IN (?)";
					var [rows, fields] = await con.promise().query(query, [user_ids]);
					resolve({ success: true, users_info: rows });
				} catch (e) {
					reject(e);
				}
			})();
		});
	});
}

export function getUserScore(user_id) {
	return new Promise((resolve, reject) => {
		con.connect(function (err) {
			if (err) {
				return reject(err);
			}
			(async function () {
				try {
					var query = "SELECT `score` FROM `users` WHERE `uuid` = ?";
					var [rows, fields] = await con.promise().query(query, [user_id]);
					if (rows.length > 0) {
						resolve({ success: true, score: rows[0].score });
					} else {
						resolve({ success: false });
					}
				} catch (e) {
					reject(e);
				}
			})();
		});
	});
}

export async function updateUserScore(user_id, score) {
	return new Promise((resolve, reject) => {
		con.connect(function (err) {
			if (err) {
				return reject(err);
			}
			(async function () {
				try {
					var current_score = await getUserScore(user_id);
					if (!current_score.success) {
						return resolve({ success: false });
					}

					if (score <= current_score.score) {
						return resolve({ success: false, new_score: current_score.score });
					}

					var query = "UPDATE `users` SET `score` = ? WHERE `uuid` = ?";
					var result = await con.promise().query(query, [score, user_id]);
					var affectedRows = result[0].affectedRows;
					console.log(affectedRows + " record(s) updated");
					if (affectedRows >= 1) {
						resolve({ success: true, new_score: score });
					}
					else {
						resolve({ success: false });
					}
				} catch (e) {
					reject(e);
				}
			})();
		});
	});
}

export async function getLeaderboard() {
	return new Promise((resolve, reject) => {
		con.connect(function (err) {
			if (err) {
				return reject(err);
			}
			(async function () {
				try {
					var query = "SELECT `uuid`, `username`, `score` FROM `users` ORDER BY `score` DESC";
					var [rows, fields] = await con.promise().query(query);
					resolve({ success: true, leaderboard: rows.filter((row) => row != null && row.score > 0) });
				}
				catch (e) {
					reject(e);
				}
			})();
		});
	});
}