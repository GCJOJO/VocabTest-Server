import express from "express";
import expressWs from "express-ws";
import bodyParser from "body-parser";
import cors from "cors";

import * as GameManager from "./GameManager.js";
import * as DatabaseConnection from "./DatabaseConnection.js";
import * as UserManager from "./UserManager.js";

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
		//console.log(msg);
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
					lobby_id: GameManager.createLobby(playerId, ws),
				};
				ws.send(JSON.stringify(response));
				break;
			}

			case "join-lobby": {
				GameManager.joinLobby(lobbyId, playerId, ws);
				break;
			}

			case "leave-lobby": {
				GameManager.leaveLobby(lobbyId, playerId);
				break;
			}

			case "start-lobby": {
				GameManager.startLobby(lobbyId, playerId);
				break;
			}

			case "send-word": {
				GameManager.receiveWord(lobbyId, playerId, json.word);
				break;
			}

			case "request-next-word": {
				GameManager.playerRequestedNextWord(lobbyId, playerId);
				break;
			}
		}
	});
});

app.get("/vocab-test", (req, res) => {
	res.send({ action: "set-words", words: DatabaseConnection.getWords() });
});

app.post("/add-word", jsonParser, (req, res) => {
	DatabaseConnection.addWord(req.params.french, req.params.context, req.params.english);
	res.send({ action: "word-added", word: { français: req.params.french, contexte: req.params.context, anglais: req.params.english } });
});

app.post("/register", jsonParser, async (req, res) => {
	console.log(req);
	var result = await UserManager.createUser(req.body.username, req.body.first_name, req.body.last_name, req.body.password_hash);
	if(result.success)
		res.send({ action: "login-success", user_uuid: result.uuid });
	else
		res.send({ action: "login-failed" });
});

app.post("/login", jsonParser, async (req, res) => {
	var result = await UserManager.login(req.body.username, req.body.password_hash);
	if(result.success)
		res.send({ action: "login-success", user_uuid: result.uuid });
	else
		res.send({ action: "login-failed" });
});

app.get("/user-info", jsonParser, async (req, res) => {
	var result = await UserManager.getUserInfo(req.query.user_id);
	if(result.success)			res.send({ action: "user-info", user_info: result.user_info });
	else						res.send({ action: "user-info-failed" });
});

app.get("/lobbies", (req, res) => {
	//console.log(lobbies);
	res.send({ action: "set-lobbies", lobbies: GameManager.getLobbies() });
});

// SERVER/owner/<lobby_id>?player_id=<player_id>
app.get("/owner/:lobby_id", jsonParser, (req, res) => {
	res.send({
		action: "test-ownership",
		result: GameManager.testOwnership(req.params.lobby_id, req.query.player_id),
	});
});

app.listen(app.get("port"));
wsApp.listen(wsApp.get("port"));

console.log("Server running !");

DatabaseConnection.getWords();