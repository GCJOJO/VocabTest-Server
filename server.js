let mysql = require('mysql2');
const express = require('express')
const app = express()
var cors = require('cors')

let con = mysql.createConnection({
    host: "localhost",
    user: "root",
    password: "",
    database: "vocab_test"
});

corsOption =
{
    origin: '*',
    optionsSuccessStatus: 200
}

app.use(cors(corsOption))
app.set('port', process.env.PORT || 5762);

app.get('/vocab-test', (req, res) => 
{
   con.connect(function(err)
   {
    if(err) throw err;

    !async function () {

            var query = "SELECT * FROM `words`";
            var [rows, fields] = await con.promise().query(query);

            response = {"action" : "set-words", "words" : rows}
            console.log(response);

            res.send(response)
        }();
   })

});

app.listen(app.get('port'));

console.log("Server running !");