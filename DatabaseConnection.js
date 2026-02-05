import mysql from "mysql2";

let con = mysql.createConnection({
    host: "localhost",
    user: "root",
    password: "",
    database: "vocab_test",
});

var cachedWords = [];

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

export function addWord(french, context, english) 
{
    con.connect(function (err) {
        if (err) throw err;
        !(async function () {
            var query = "INSERT INTO `words` (`français`, `contexte`, `anglais`) VALUES (?, ?, ?)";
            var result = await con.promise().query(query, [french, context, english]);
            var affectedRows = result[0].affectedRows;
            console.log(affectedRows + " record(s) inserted");
        })();
    });
}

export async function createUser(uuid, username, first_name, last_name, password_hash)
{
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

export async function login(username, password_hash)
{
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

export async function getUserInfo(user_id)
{
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