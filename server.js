import express from "express";
import expressWs from "express-ws";
import bodyParser from "body-parser";
import cors from "cors";
import fs from "fs";
import https from "https";
var privateKey  = fs.readFileSync('server.key', 'utf8');
var certificate = fs.readFileSync('server.crt', 'utf8');

const serverPort = 5762;
const wsServerPort = 5763;

const credentials = {
	key: privateKey,
	cert: certificate,
	passphrase: "feurestunstegosaure"
};

import * as GameManager from "./GameManager.js";
import * as DatabaseConnection from "./DatabaseConnection.js";
import * as UserManager from "./UserManager.js";

const corsOption = {
	origin: "*",
	optionsSuccessStatus: 200,
};

const app = express();

app.use(cors(corsOption));
app.use(express.static("public"));
//app.set("port", process.env.PORT || 5762);

var httpsServer = https.createServer(credentials, app);


const wsApp = express();
wsApp.use(cors(corsOption));
wsApp.set("port", process.env.PORT || 5763);
var wsHttpsServer = https.createServer(credentials, wsApp);
expressWs(wsApp, wsHttpsServer);


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

		try {
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

				case "update-lobby-options": {
					GameManager.updateLobbyOptions(lobbyId, playerId, json.options);
					break;
				}

				case "start-lobby": {
					GameManager.startLobby(lobbyId, playerId);
					break;
				}

				case "send-answer":
				{
					//console.log("Received answer from player " + playerId + " in lobby " + lobbyId + ": " + json.answer, " (" + json.answer_type + ")");	
					GameManager.receiveAnswer(lobbyId, playerId, json.answer, json.answer_type);
					break;
				}

				case "request-next-question": {
					GameManager.playerRequestedNextQuestion(lobbyId, playerId);
					break;
				}
			}
		} catch (error) {
			console.error("Error handling WebSocket message:", error);
		}
	});
});

app.get("/words-list", (req, res) => {
	try {
		res.send({ action: "words-list", words: DatabaseConnection.getWords() });
	}
	catch (error) {
		console.error("Error fetching words:", error);
	}
});

app.get("/verbs-list", (req, res) => {
	try {
		res.send({ action: "verbs-list", verbs: DatabaseConnection.getVerbs() });
	}
	catch (error) {
		console.error("Error fetching verbs:", error);
	}
});

app.post("/add-word", jsonParser, (req, res) => {
	try {
		DatabaseConnection.addWord(req.body.french, req.body.context, req.body.prefix, req.body.english);
		res.send({ action: "word-added", word: { français: req.body.french, contexte: req.body.context, prefix: req.body.prefix, anglais: req.body.english } });
	}
	catch (error) {
		console.error("Error adding word:", error);
		res.send({ action: "add-word-failed" });
	}
});

app.post("/change-word", jsonParser, (req, res) => {
	try {
		DatabaseConnection.changeWord(req.body.id, req.body.french, req.body.context, req.body.prefix, req.body.english);
		res.send({ action: "word-changed", word: { français: req.body.french, contexte: req.body.context, prefix: req.body.prefix, anglais: req.body.english } });
	}
	catch (error) {
		console.error("Error changing word:", error);
		res.send({ action: "change-word-failed" });
	}
});

app.post("/remove-word", jsonParser, (req, res) => {
	try {
		DatabaseConnection.removeWord(req.body.id);
		res.send({ action: "word-removed", word: { id: req.body.id } });
	}
	catch (error) {
		console.error("Error removing word:", error);
		res.send({ action: "remove-word-failed" });
	}
});

app.post("/register", jsonParser, async (req, res) => {
	try {
		console.log(req);
		var result = await UserManager.createUser(req.body.username, req.body.first_name, req.body.last_name, req.body.password_hash);
		if (result.success) res.send({ action: "login-success", user_uuid: result.uuid });
		else res.send({ action: "login-failed" });
	}
	catch (error) {
		console.error("Error registering user:", error);
		res.send({ action: "login-failed" });
	}
});

app.post("/login", jsonParser, async (req, res) => {
	try {
		var result = await UserManager.login(req.body.username, req.body.password_hash);
		if (result.success) res.send({ action: "login-success", user_uuid: result.uuid });
		else res.send({ action: "login-failed" });
	}
	catch (error) {
		console.error("Error logging in user:", error);
		res.send({ action: "login-failed" });
	}
});

app.get("/users", jsonParser, async (req, res) => {
	try {
		var userIds = req.body.user_ids;
		var result = await UserManager.getUsersInfo(userIds);
		if (result.success) res.send({ action: "users-info", users_info: result.users_info });
		else
			res.send({ action: "users-info-failed" });
	}
	catch (error) {
		console.error("Error fetching users info:", error);
		res.send({ action: "users-info-failed" });
	}
});

// SERVER-ADDRESS/user/<user_id>
app.get("/user/:user_id", async (req, res) => {
	try {
		var result = await UserManager.getUserInfo(req.params.user_id);
		if (result.success) res.send({ action: "user-info", user_info: result.user_info });
		else res.send({ action: "user-info-failed" });
	}
	catch (error) {
		console.error("Error fetching user info:", error);
		res.send({ action: "user-info-failed" });
	}
});

app.get("/lobbies", (req, res) => {
	//console.log(lobbies);
	try {
		res.send({ action: "set-lobbies", lobbies: GameManager.getLobbies() });
	}
	catch (error) {
		console.error("Error fetching lobbies:", error);
		res.send({ action: "set-lobbies", lobbies: [] });
	}
});

// SERVER/owner/<lobby_id>?player_id=<player_id>
app.get("/owner/:lobby_id", jsonParser, (req, res) => {
	try {
		res.send({
			action: "test-ownership",
			result: GameManager.testOwnership(req.params.lobby_id, req.query.player_id),
		});
	}
	catch (error) {
		console.error("Error testing lobby ownership:", error);
		res.send({ action: "test-ownership", result: false });
	}
});

//app.listen(app.get("port"));
httpsServer.listen(serverPort, () => {
	console.log(`HTTPS Server running on port ${serverPort}`);
});

wsHttpsServer.listen(wsServerPort, () => {
	console.log(`WebSocket HTTPS Server running on port ${wsServerPort}`);
});

console.log("Server running !");

DatabaseConnection.getWords();
