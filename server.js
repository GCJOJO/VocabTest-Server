import mysql  from 'mysql2';
import express from 'express'
import expressWs from 'express-ws'
import bodyParser from 'body-parser'
import cors from 'cors'

var lobbies = [];

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
                var lobbyId = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

                var words = shuffle(getWords());

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

                var response = {"action" : "lobby-created", "lobbyId" : lobbyId}
                ws.send(JSON.stringify(response));
                break;
            }

            case "join-lobby":
            {
                var lobbyId = json.lobby_id;
                var lobby = lobbies[lobbyId];
                if(lobby != undefined)
                {
                    var playerJoined = {"action" : "player-joined", "player_id" : playerId};
                    lobby.players.forEach(player => player.websocket.send(JSON.stringify(playerJoined)));

                    lobby.players.push({"id" : playerId, "entered_word" : "", "score" : 0, "websocket" : ws});
                    var response = {"action" : "lobby-joined", "lobby_id" : lobbyId}
                    ws.send(JSON.stringify(response));
                }
                break;  
            }

            case "leave-lobby":
            {
                var lobbyId = json.lobby_id;
                var lobby = lobbies[lobbyId];
                if(lobby != undefined)
                {
                    lobby.players = lobby.players.filter(player => player.id != playerId);
                    var response = {"action" : "lobby-left", "lobby_id" : lobbyId}
                    ws.send(JSON.stringify(response));

                    lobby.players.forEach(player => 
                    {
                        var playerLeft = {"action" : "player-left", "player_id" : playerId};
                        player.websocket.send(JSON.stringify(playerLeft));
                    });
                }
                break;
            }
            case "disband-lobby":
            {
                var lobbyId = json.lobby_id;
                var lobby = lobbies[lobbyId];
                if(lobby != undefined && lobby.owner == playerId)
                {
                    var response = {"action" : "lobby-disbanded", "lobby_id" : lobbyId}
                    lobby.players.forEach(player => player.websocket.send(JSON.stringify(response)));

                    delete lobbies[lobbyId];
                }
                break;
            }

            case "start-lobby":
            {
                var lobbyId = json.lobby_id;
                var lobby = lobbies[lobbyId];
                if(lobby != undefined && lobby.owner == playerId)
                {
                    lobby.status = "started";
                    var response = {"action" : "lobby-started", "lobby_id" : lobbyId}
                    lobby.players.forEach(player => player.websocket.send(JSON.stringify(response)));
                }
                break;
            }

            case "send-word":
            {
                var lobbyId = json.lobby_id;
                var lobby = lobbies[lobbyId];
                if(lobby != undefined)
                {
                    var word = json.word;
                    var response = {"action" : "word-received", "word" : word}
                    ws.send(JSON.stringify(response));

                    lobby.players[json.player_id].entered_word = word;
                    var players_all_played = true;
                    lobby.players.forEach(player => 
                    {
                         if(player.entered_word == "")
                            players_all_played = false;                        
                    });

                    if(players_all_played)
                    {
                        var updatedScores = [];
                        lobby.players.forEach(player =>
                        {
                            if(player.entered_word == lobby.words[lobby.current_word_index].english_word)
                            {
                                player.entered_word = "";
                                player.score += 1;
                                updatedScores.push({"player_id" : player.id, "new_score" : player.score});
                            }
                        });
                        
                        var updateScores = {"action" : "update-scores", "scores" : updatedScores};
                        lobby.players.forEach(player => player.websocket.send(JSON.stringify(updateScores)));

                        //choose new word
                        lobby.current_word_index += 1;

                        if(lobby.current_word_index >= lobby.words.length)
                        {
                            lobby.status = "ended";
                            var endGame = {"action" : "end-game"};
                            lobby.players.forEach(player => player.websocket.send(JSON.stringify(endGame)));
                            return;
                        }

                        lobby.current_word = lobby.words[lobby.current_word_index];
                        var newWord = {"action" : "new-word", "word" : lobby.current_word.french_word}
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
    console.log(lobbies);

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

function getWords()
{
    var words = [];
    con.connect(function(err)
    {
        if(err) throw err;
        !async function () {
                var query = "SELECT * FROM `words`";
                var [rows, fields] = await con.promise().query(query);
                words = rows;
            }
    })
    return words;
}

function shuffle(array) 
{
  let currentIndex = array.length;

  // While there remain elements to shuffle...
  while (currentIndex != 0) {

    // Pick a remaining element...
    let randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex--;

    // And swap it with the current element.
    [array[currentIndex], array[randomIndex]] = [
      array[randomIndex], array[currentIndex]];
  }
}

app.listen(app.get('port'));
wsApp.listen(wsApp.get('port'));   

console.log("Server running !");