import mysql  from 'mysql2';
import express from 'express'
import expressWs from 'express-ws'
import bodyParser from 'body-parser'
import cors from 'cors'

var lobbies = [];
var cachedWords = [];

let con = mysql.createConnection({
    host: "localhost",
    user: "root",
    password: "",
    database: "vocab_test"
});

const corsOption =
{
    origin: '*',
    optionsSuccessStatus: 200
}

const app = express()

app.use(cors(corsOption))
app.set('port', process.env.PORT || 5762);

const wsApp = express()
wsApp.use(cors(corsOption))
wsApp.set('port', process.env.PORT || 5763);
expressWs(wsApp)

// create application/json parser
var jsonParser = bodyParser.json()
 
// create application/x-www-form-urlencoded parser
var urlencodedParser = bodyParser.urlencoded({ extended: false })

wsApp.ws('/', function(ws, req)
{
    ws.on('message', function(msg)
    {
        //var dataStr = new TextDecoder("utf-8").decode(msg);
        console.log(msg);
        try {
            var json = JSON.parse(msg);
        } catch (error) {
            return;
        }
        
        var playerId = json.player_id;
        var action = json.action;
        
        switch (action) 
        {
            case "create-lobby":
            {
                let lobbyId = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
                

                let organisedWords = getWords()                
                let words = shuffle(organisedWords)
                lobbies[lobbyId] = 
                {
                    "owner" : playerId,
                    "players" : 
                    [
                        {"id" : playerId, "entered_word" : "", "score" : 0, "websocket" : ws}
                    ],
                    "words" : words,
                    "current_word_index" : 0,
                    "status" : "waiting"
                };

                let response = {"action" : "lobby-created", "lobby_id" : lobbyId}
                ws.send(JSON.stringify(response));
                

               break;
            }

            case "join-lobby":
            {
                let lobbyId = json.lobby_id;
                let lobby = lobbies[lobbyId];
                if(lobby != undefined)
                {
                    if(lobby.players.filter(player => player.id == playerId).length != 0)
                    {
                        console.warn("Player has already joined !");
                        break;
                    }

                    let playerJoined = {"action" : "player-joined", "player_id" : playerId};
                    lobby.players.forEach(player => player.websocket.send(JSON.stringify(playerJoined)));

                    lobby.players.push({"id" : playerId, "entered_word" : "", "score" : 0, "websocket" : ws});
                    let response = {"action" : "lobby-joined", "lobby_id" : lobbyId}
                    ws.send(JSON.stringify(response));
                }
                break;  
            }

            case "leave-lobby":
            {
                let lobbyId = json.lobby_id;
                let lobby = lobbies[lobbyId];
                if(lobby != undefined)
                {
                    lobby.players = lobby.players.filter(player => player.id != playerId);
                    let response = {"action" : "lobby-left", "lobby_id" : lobbyId}
                    ws.send(JSON.stringify(response));

                    lobby.players.forEach(player => 
                    {
                        let playerLeft = {"action" : "player-left", "player_id" : playerId};
                        player.websocket.send(JSON.stringify(playerLeft));
                    });
                }
                break;
            }
            case "disband-lobby":
            {
                let lobbyId = json.lobby_id;
                let lobby = lobbies[lobbyId];
                if(lobby != undefined && lobby.owner == playerId)
                {
                    let response = {"action" : "lobby-disbanded", "lobby_id" : lobbyId}
                    lobby.players.forEach(player => player.websocket.send(JSON.stringify(response)));

                    delete lobbies[lobbyId];
                }
                break;
            }

            case "start-lobby":
            {
                let lobbyId = json.lobby_id;
                let lobby = lobbies[lobbyId];
                if(lobby != undefined && lobby.owner == playerId)
                {
                    lobby.status = "started";
                    let response = {"action" : "lobby-started", "lobby_id" : lobbyId}
                    lobby.players.forEach(player => player.websocket.send(JSON.stringify(response)));

                    lobby.current_word_index = 0;
                    let current_word = lobby.words[lobby.current_word_index];
                    let newWord = {"action" : "new-word", "word" : current_word}
                    lobby.players.forEach(player => player.websocket.send(JSON.stringify(newWord)));
                }
                break;
            }

            case "send-word":
            {
                let lobbyId = json.lobby_id;
                let lobby = lobbies[lobbyId];
                if(lobby != undefined)
                {
                    let word = json.word;
                    let response = {"action" : "word-received", "word" : word}
                    ws.send(JSON.stringify(response));

                    lobby.players[json.player_id].entered_word = word;
                    let players_all_played = true;
                    lobby.players.forEach(player => 
                    {
                         if(player.entered_word == "")
                            players_all_played = false;                        
                    });

                    if(players_all_played)
                    {
                        let updatedScores = [];
                        lobby.players.forEach(player =>
                        {
                            if(player.entered_word == lobby.words[lobby.current_word_index].english_word)
                            {
                                player.entered_word = "";
                                player.score += 1;
                                updatedScores.push({"player_id" : player.id, "new_score" : player.score});
                            }
                        });
                        
                        let updateScores = {"action" : "update-scores", "scores" : updatedScores};
                        lobby.players.forEach(player => player.websocket.send(JSON.stringify(updateScores)));

                        //choose new word
                        lobby.current_word_index += 1;

                        if(lobby.current_word_index >= lobby.words.length)
                        {
                            lobby.status = "ended";
                            let endGame = {"action" : "end-game"};
                            lobby.players.forEach(player => player.websocket.send(JSON.stringify(endGame)));
                            return;
                        }

                        let current_word = lobby.words[lobby.current_word_index];
                        let newWord = {"action" : "new-word", "word" : current_word}
                        lobby.players.forEach(player => player.websocket.send(JSON.stringify(newWord)));
                    }
                }
            break;
            }
        }
    })
});

app.get('/vocab-test', (req, res) => 
{
    res.send({"action" : "set-words", "words" : getWords()});
});

app.get('/lobbies', (req, res) => 
{
    //console.log(lobbies);

    var lobbiesJson = [];
    Object.keys(lobbies).forEach(function(lobbyId)
    {
        var lobbyJson = {};
        var lobby = lobbies[lobbyId];
        lobbyJson["id"] = lobbyId;
        lobbyJson["owner"] = lobby.owner;
        lobbyJson["player_count"] = lobby.players.length;
        lobbyJson["words"] = lobby.words;
        lobbyJson["current_word_index"] = lobby.current_word_index;
        lobbyJson["status"] = lobby.status;
        lobbiesJson.push(lobbyJson);
    });

  res.send({"action" : "set-lobbies", "lobbies" : lobbiesJson});  
})

app.get('/owner', jsonParser, (req, res) => 
{
    var lobby_id = req.body["lobby_id"];
    var lobby = lobbies[lobby_id]
    if(lobby == undefined)
    {
        res.send({"action" : "test-ownership", "result" : false});
        return;
    }    
    res.send({"action" : "test-ownership", "result" : lobby.owner == req.body["player_id"]});
});

function getWords()
{
    con.connect(function(err)
    {
        if(err) throw err;
        !async function () 
        {
            var query = "SELECT * FROM `words`";
            var [rows, fields] = await con.promise().query(query);
            cachedWords = rows;
        }();
    })
    return cachedWords;
}

function shuffle(array) 
{
    let arrayCopy = array
    let currentIndex = arrayCopy.length;

    // While there remain elements to shuffle...
    while (currentIndex != 0) {

        // Pick a remaining element...
        let randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex--;

        // And swap it with the current element.
        [arrayCopy[currentIndex], arrayCopy[randomIndex]] = [
        arrayCopy[randomIndex], arrayCopy[currentIndex]];
    }
    return arrayCopy
}

app.listen(app.get('port'));
wsApp.listen(wsApp.get('port'));   

console.log("Server running !");

getWords();