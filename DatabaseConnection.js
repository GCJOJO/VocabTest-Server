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
    con.connect(function (err) {
        if (err) throw err;
        !(async function () {
            var query = "INSERT INTO `users` (`uuid`, `username`, `first_name`, `last_name`, `password_hash`) VALUES (?, ?,  ?, ?, ?)";
            var result = await con.promise().query(query, [uuid, username, first_name, last_name, password_hash]);
            var affectedRows = result[0].affectedRows;
            console.log(affectedRows + " record(s) inserted");
            return affectedRows >= 1;
        })();
    });
}