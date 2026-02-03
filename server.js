import mysql from "mysql2";
import express from "express";
import expressWs from "express-ws";
import bodyParser from "body-parser";
import cors from "cors";

var lobbies = [];
var cachedWords = [];

let con = mysql.createConnection({
	host: "localhost",
	user: "root",
	password: "",
	database: "vocab_test",
});

const corsOption = {
	origin: "*",
	optionsSuccessStatus: 200,
};

const app = express();

app.use(cors(corsOption));
app.set("port", process.env.PORT || 5762);

const wsApp = express();
wsApp.use(cors(corsOption));
wsApp.set("port", process.env.PORT || 5763);
expressWs(wsApp);

// create application/json parser
var jsonParser = bodyParser.json();

// create application/x-www-form-urlencoded parser
var urlencodedParser = bodyParser.urlencoded({ extended: false });

wsApp.ws("/", function (ws, req) {
	ws.on("message", function (msg) {
		//var dataStr = new TextDecoder("utf-8").decode(msg);
		console.log(msg);
		try {
			var json = JSON.parse(msg);
		} catch (error) {
			return;
		}

		var playerId = json.player_id;
		var action = json.action;
		var lobbyId = json.lobby_id;

		switch (action) {
			case "create-lobby": {
				let response = {
					action: "lobby-created",
					lobby_id: createLobby(playerId, ws),
				};
				ws.send(JSON.stringify(response));
				break;
			}

			case "join-lobby": {
				if (joinLobby(lobbyId, playerId, ws)) {
					let response = { action: "lobby-joined", lobby_id: lobbyId };
					ws.send(JSON.stringify(response));
				}
				break;
			}

			case "leave-lobby": {
				if (leaveLobby(lobbyId, playerId)) {
					let response = { action: "lobby-left", lobby_id: lobbyId };
					ws.send(JSON.stringify(response));

					if (lobbies[lobbyId].players.length == 0) disbandLobby(lobbyId);
				}
				break;
			}

			case "start-lobby": {
				startLobby(lobbyId, playerId);
				break;
			}

			case "send-word": {
				let lobby = lobbies[lobbyId];
				if (lobby != undefined) receiveWord(lobbyId, playerId, json.word);

				break;
			}

			case "request-next-word": {
				let lobby = lobbies[lobbyId];
				if (lobby != undefined) playerRequestedNextWord(lobbyId, playerId);

				break;
			}
		}
	});
});

app.get("/vocab-test", (req, res) => {
	res.send({ action: "set-words", words: getWords() });
});

app.get("/lobbies", (req, res) => {
	//console.log(lobbies);

	var lobbiesJson = [];
	Object.keys(lobbies).forEach(function (lobbyId) {
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

	res.send({ action: "set-lobbies", lobbies: lobbiesJson });
});

// SERVER/owner/<lobby_id>?player_id=<player_id>
app.get("/owner/:lobby_id", jsonParser, (req, res) => {
	var lobby_id = req.params.lobby_id;
	var lobby = lobbies[lobby_id];
	if (lobby == undefined) {
		res.send({ action: "test-ownership", result: false });
		return;
	}

	console.log(req.query);

	res.send({
		action: "test-ownership",
		result: lobby.owner == req.query.player_id,
	});
});

function getWords() {
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

function shuffle(array) {
	let arrayCopy = array;
	let currentIndex = arrayCopy.length;

	// While there remain elements to shuffle...
	while (currentIndex != 0) {
		// Pick a remaining element...
		let randomIndex = Math.floor(Math.random() * currentIndex);
		currentIndex--;

		// And swap it with the current element.
		[arrayCopy[currentIndex], arrayCopy[randomIndex]] = [arrayCopy[randomIndex], arrayCopy[currentIndex]];
	}
	return arrayCopy;
}

function createLobby(playerId, ownerWebsocket) {
	let lobbyId = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

	let organisedWords = getWords();
	let words = shuffle(organisedWords);
	lobbies[lobbyId] = {
		owner: playerId,
		players: [],
		words: words,
		current_word_index: 0,
		status: "waiting",
	};

	joinLobby(lobbyId, playerId, ownerWebsocket);

	return lobbyId;
}

function joinLobby(lobbyId, playerId, playerWebsocket) {
	let lobby = lobbies[lobbyId];
	if (lobby != undefined) {
		if (lobby.players.filter((player) => player.id == playerId).length != 0) {
			console.warn("Player has already joined !");
			return false;
		}

		let playerJoined = { action: "player-joined", player_id: playerId };
		lobby.players.forEach((player) => player.websocket.send(JSON.stringify(playerJoined)));

		lobby.players.push({
			id: playerId,
			entered_word: "",
			ready_for_next_word: false,
			score: 0,
			websocket: playerWebsocket,
		});
		return true;
	}

	return false;
}

function leaveLobby(lobbyId, playerId) {
	let lobby = lobbies[lobbyId];
	if (lobby != undefined) {
		lobby.players = lobby.players.filter((player) => player.id != playerId);
		lobby.players.forEach((player) => {
			let playerLeft = { action: "player-left", player_id: playerId };
			player.websocket.send(JSON.stringify(playerLeft));
		});
		return true;
	}
	return false;
}

function disbandLobby(lobbyId) {
	let lobby = lobbies[lobbyId];
	if (lobby != undefined) {
		let response = { action: "lobby-disbanded", lobby_id: lobbyId };
		lobby.players.forEach((player) => player.websocket.send(JSON.stringify(response)));

		delete lobbies[lobbyId];
	}
}

function startLobby(lobbyId, playerId) {
	let lobby = lobbies[lobbyId];
	if (lobby != undefined && lobby.owner == playerId) {
		lobby.status = "started";
		let response = { action: "lobby-started", lobby_id: lobbyId };
		lobby.players.forEach((player) => player.websocket.send(JSON.stringify(response)));

		lobby.current_word_index = 0;
		let current_word = lobby.words[lobby.current_word_index];
		sendWord(lobbyId, current_word);
	}
}

function sendWord(lobbyId, word) {
	let lobby = lobbies[lobbyId];
	if (lobby == undefined) return;

	let newWord = { action: "new-word", word: word };
	lobby.players.forEach((player) => player.websocket.send(JSON.stringify(newWord)));
}

function nextWord(lobbyId) {
	let lobby = lobbies[lobbyId];
	if (lobby == undefined) return;

	lobby.players.forEach((player) => (player.ready_for_next_word = false));

	//choose new word
	lobby.current_word_index += 1;

	if (lobby.current_word_index >= lobby.words.length) {
		lobby.status = "ended";
		let endGame = { action: "end-game" };
		lobby.players.forEach((player) => player.websocket.send(JSON.stringify(endGame)));
		return;
	}

	let current_word = lobby.words[lobby.current_word_index];
	sendWord(lobbyId, current_word);
}

function receiveWord(lobbyId, playerId, word) {
	let lobby = lobbies[lobbyId];
	if (lobby == undefined) return;

	let response = { action: "word-received", word: word };
	ws.send(JSON.stringify(response));

	lobby.players[playerId].entered_word = word;

	checkPlayerEnterWords(lobbyId);
}

function checkPlayerEnterWords(lobbyId) {
	let lobby = lobbies[lobbyId];
	if (lobby == undefined) return;

	let players_all_played = true;
	lobby.players.forEach((player) => {
		if (player.entered_word == "") players_all_played = false;
	});

	if (players_all_played) {

        let updatedScores = [];
		lobby.players.forEach((player) => {
            let valid = checkWord(player.entered_word, lobby.words[lobby.current_word_index].english_word);
			if (valid) {
				player.entered_word = "";
				player.score += 1;
				updatedScores.push({
					player_id: player.id,
					new_score: player.score,
				});
			}

            let showResults = { action: "show-results", valid: valid };
			player.websocket.send(JSON.stringify(showResults));
		});

		let updateScores = {
			action: "update-scores",
			scores: updatedScores,
		};
		lobby.players.forEach((player) => player.websocket.send(JSON.stringify(updateScores)));
	}
}

function playerRequestedNextWord(lobbyId, playerId) {
	let lobby = lobbies[lobbyId];
	if (lobby == undefined) return;

	if (lobby.players[playerId].entered_word !== "") lobby.players[playerId].ready_for_next_word = true;

	let allReady = true;
	lobby.players.forEach((player) => {
		if (!player.ready_for_next_word) allReady = false;
	});
	if (allReady) nextWord(lobbyId);
}

function checkWord(playerWord, correctWordList) {
	let englishWords = correctWordList.split("/");
	let valid = false;
	englishWords.forEach((correctWord) => {
		if (playerWord.toLowerCase().includes(correctWord.toLowerCase())) {
			valid = true;
			return;
		}
	});

	return valid; // Better check, maybe distance
}

app.listen(app.get("port"));
wsApp.listen(wsApp.get("port"));

console.log("Server running !");

getWords();
