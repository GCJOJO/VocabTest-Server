import express from "express";
import { WebSocketServer, WebSocket } from "ws";
import bodyParser from "body-parser";
import cors from "cors";
import fs from "fs";
import http from "http";
import https from "https";

import { GameManager } from "./GameManager.js";
import { DatabaseConnection, Tables, type Word, type Verb, type Country } from "./DatabaseConnection.js";
import { UserManager } from "./UserManager.js";
import { SocketServer } from "./SocketServer.js";
import { Constants } from "./Constants.js";

//var privateKey  = fs.readFileSync('server.key', 'utf8');
//var certificate = fs.readFileSync('server.crt', 'utf8');

/*const credentials = {
	key: privateKey,
	cert: certificate,
	passphrase: "feurestunstegosaure"
};*/

const GAME_VERSION = "0.0.11";

const corsOption = {
	origin: "*",
	optionsSuccessStatus: 200,
};

const app : express.Application = express();

app.use(cors(corsOption));
app.use(express.static("public"));
//app.set("port", process.env.PORT || 5762);
//var httpsServer = https.createServer(credentials, app);
var httpServer = http.createServer(app);

// create application/json parser
var jsonParser = bodyParser.json();
// create application/x-www-form-urlencoded parser
var urlencodedParser = bodyParser.urlencoded({ extended: false });

function handleWebSocketMessage(ws : WebSocket, msg : string) 
{
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

			case "set-is-spectator": {
				GameManager.setIsSpectator(lobbyId, playerId, json.is_spectator);
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

			case "continue-game":
			{
				GameManager.continueGame(lobbyId);	
				break;
			}

			case "update-is-spectator": {
				//console.log("Player " + playerId + " in lobby " + lobbyId + " is now " + (json.is_spectator ? "a spectator" : "a player"));
				GameManager.setIsSpectator(lobbyId, playerId, json.is_spectator);
				break;
			}
		}
	} catch (error) {
		console.error("Error handling WebSocket message:", error);
	}
};

const socketApp = express();
socketApp.use(cors(corsOption));
var socketServer = http.createServer(socketApp);

socketServer.listen(Constants.SOCKET_PORT, () => {
	console.log(`WebSocket Server running on port ${Constants.SOCKET_PORT}`);
});

const SocketServerInstance = new SocketServer(socketServer, handleWebSocketMessage);

app.get("/version", (req : any, res : any) => {
	console.log('Got /version request');
	res.send({ version: GAME_VERSION });
});

app.get("/words-list", async (req : any, res : any) => {
	try {
		let words : any = await DatabaseConnection.GetTable<Word>(Tables.WORDS);
		res.send({ action: "words-list", words: words });
	}
	catch (error) {
		console.error("Error fetching words:", error);
	}
});

app.get("/verbs-list", async (req : any, res : any) => {
	try {
		let verbs : any = await DatabaseConnection.GetTable<Verb>(Tables.VERBS);
		res.send({ action: "verbs-list", verbs: verbs });
	}
	catch (error) {
		console.error("Error fetching verbs:", error);
	}
});

app.get("/countries-list", async (req : any, res : any) => {
	try {
		let countries : any = await DatabaseConnection.GetTable<Country>(Tables.COUNTRY);
		res.send({ action: "countries-list", countries: countries });
	}
	catch (error) {
		console.error("Error fetching countries:", error);
	}
});

app.get("/grammar-list", async (req : any, res : any) => {
	try {
		let grammar : any = await DatabaseConnection.GetTable<Word>(Tables.GRAMMAR);
		res.send({ action: "grammar-list", grammar: grammar });
	}
	catch (error) {
		console.error("Error fetching grammar:", error);
	}
});

app.get("/gaming-list" , async (req : any, res : any) => {
	try {
		let gaming : any = await DatabaseConnection.GetTable<Word>(Tables.GAMING);
		res.send({ action: "gaming-list", gaming: gaming });
	}
	catch (error) {
		console.error("Error fetching gaming:", error);
	}
});



app.post("/add-word", jsonParser, async (req : any, res : any) => {
	try {
		if(!DatabaseConnection.IsUserAdmin(req.body.user_id))
		{
			res.send({ error: "user-not-admin" });
			return;
		}
		var word_id = DatabaseConnection.InsertIntoTable(Tables.WORDS, {french: req.body.french, context: req.body.context, prefix: req.body.prefix, english: req.body.english});
		res.send({ action: "word-added", word: { id: word_id, français: req.body.french, contexte: req.body.context, prefix: req.body.prefix, anglais: req.body.english } });
	}
	catch (error) {
		console.error("Error adding word:", error);
		res.send({ action: "add-word-failed" });
	}
});

app.post("/change-word", jsonParser, async (req : any, res : any) => {
	try {
		if(!DatabaseConnection.IsUserAdmin(req.body.user_id))
		{
			res.send({ error: "user-not-admin" });
			return;
		}
		var word_id = await DatabaseConnection.ChangeRow(Tables.WORDS, req.body.id, {french : req.body.french, context: req.body.context, english : req.body.english});
		res.send({ action: "word-changed", word_id : word_id});
	}
	catch (error) {
		console.error("Error changing word:", error);
		res.send({ action: "change-word-failed" });
	}
});

app.post("/remove-word", jsonParser, async (req : any, res : any) => {
	try {
		if(!DatabaseConnection.IsUserAdmin(req.body.user_id))
		{
			res.send({ error: "user-not-admin" });
			return;
		}
		await DatabaseConnection.RemoveFromTable(Tables.WORDS, req.body.id);
		res.send({ action: "word-removed", word: { id: req.body.id } });
	}
	catch (error) {
		console.error("Error removing word:", error);
		res.send({ action: "remove-word-failed" });
	}
});



app.post("/add-verb", jsonParser, async (req : any, res : any) => {
	try {
		if(!DatabaseConnection.IsUserAdmin(req.body.user_id))
		{
			res.send({ error: "user-not-admin" });
			return;
		}
		var word_id = DatabaseConnection.InsertIntoTable(Tables.VERBS, {french: req.body.french, context: req.body.context, infinitive : req.body.infinitive, preterit : req.body.preterit, past_participle : req.body.past_participle});
		res.send({ action: "verb-added", word: { id: word_id, french: req.body.french, context: req.body.context, infinitive : req.body.infinitive, preterit : req.body.preterit, past_participle : req.body.past_participle} });
	}
	catch (error) {
		console.error("Error adding verb:", error);
		res.send({ action: "add-verb-failed" });
	}
});

app.post("/change-verb", jsonParser, async (req : any, res : any) => {
		try {
		if(!DatabaseConnection.IsUserAdmin(req.body.user_id))
		{
			res.send({ error: "user-not-admin" });
			return;
		}
		var word_id = await DatabaseConnection.ChangeRow(Tables.VERBS, req.body.id, {french: req.body.french, context: req.body.context, infinitive : req.body.infinitive, preterit : req.body.preterit, past_participle : req.body.past_participle});
		res.send({ action: "verb-changed", word_id : word_id});
	}
	catch (error) {
		console.error("Error changing verb:", error);
		res.send({ action: "change-verb-failed" });
	}
});

app.post("/remove-verb", jsonParser, async (req : any, res : any) => {	
	try {
		if(!DatabaseConnection.IsUserAdmin(req.body.user_id))
		{
			res.send({ error: "user-not-admin" });
			return;
		}
		await DatabaseConnection.RemoveFromTable(Tables.VERBS, req.body.id);
		res.send({ action: "verb-removed", word: { id: req.body.id } });
	}
	catch (error) {
		console.error("Error removing verb:", error);
		res.send({ action: "remove-verb-failed" });
	}
});



app.post("/add-grammar", jsonParser, async (req : any, res : any) => {	
	try {
		if(!DatabaseConnection.IsUserAdmin(req.body.user_id))
		{
			res.send({ error: "user-not-admin" });
			return;
		}
		var word_id = DatabaseConnection.InsertIntoTable(Tables.GRAMMAR, {english: req.body.english, french: req.body.french, category: req.body.category, prefix: req.body.prefix});
		res.send({ action: "grammar-added", word: { id: word_id, english: req.body.english, french: req.body.french, category: req.body.category, prefix: req.body.prefix } });
	}
	catch (error) {
		console.error("Error adding grammar:", error);
		res.send({ action: "add-grammar-failed" });
	}
});

app.post("/change-grammar", jsonParser, async (req : any, res : any) => {
	try {
		if(!DatabaseConnection.IsUserAdmin(req.body.user_id))
		{
			res.send({ error: "user-not-admin" });
			return;
		}
		var word_id = await DatabaseConnection.ChangeRow(Tables.GRAMMAR, req.body.id, {english: req.body.english, french: req.body.french, category: req.body.category, prefix: req.body.prefix});
		res.send({ action: "grammar-changed", word_id : word_id});
	}
	catch (error) {
		console.error("Error changing grammar:", error);
		res.send({ action: "change-grammar-failed" });
	}
});

app.post("/remove-grammar", jsonParser, async (req : any, res : any) => {
	try {
		if(!DatabaseConnection.IsUserAdmin(req.body.user_id))
		{
			res.send({ error: "user-not-admin" });
			return
		}	
		await DatabaseConnection.RemoveFromTable(Tables.GRAMMAR, req.body.id);
		res.send({ action: "grammar-removed", word: { id: req.body.id } });
	}
	catch (error) {
		console.error("Error removing grammar:", error);
		res.send({ action: "remove-grammar-failed" });
	}
});



app.post("/add-country", jsonParser, async (req : any, res : any) => {
	
	try{
		if(!DatabaseConnection.IsUserAdmin(req.body.user_id))
		{
			res.send({ error: "user-not-admin" });
			return;
		}
		var country_id = await DatabaseConnection.InsertIntoTable(Tables.COUNTRY, {french: req.body.french, english: req.body.english});
		res.send({ action : "country-added", country: { id: country_id, french : req.body.french, english: req.body.english }});
	}
	catch (error) {
		console.error("Error adding country:", error);
		res.send({ action: "add-country-failed" });
	}
});

app.post("/change-country", jsonParser, async (req : any, res : any) => {	
	try {
		if(!DatabaseConnection.IsUserAdmin(req.body.user_id))
		{
			res.send({ error: "user-not-admin" });
			return;
		}
		await DatabaseConnection.ChangeRow(Tables.COUNTRY, req.body.id, { french: req.body.french, english: req.body.english });
		res.send({ action: "country-changed", word: { id: req.body.id } });
	}
	catch (error) {
		console.error("Error changing country:", error);
		res.send({ action: "change-country-failed" });
	}
});

app.post("/remove-country", jsonParser, async (req : any, res : any) => {	
	try {
		if(!DatabaseConnection.IsUserAdmin(req.body.user_id))
		{
			res.send({ error: "user-not-admin" });
			return;
		}

		await DatabaseConnection.RemoveFromTable(Tables.WORDS, req.body.id);
		res.send({ action: "country-removed", word: { id: req.body.id } });
	}
	catch (error) {
		console.error("Error removing country:", error);
		res.send({ action: "remove-country-failed" });
	}
});


/*
app.post("/add-gaming", jsonParser, async (req : any, res : any) => {
	try{
		var country_id = await DatabaseConnection.InsertIntoTable(Tables.GAMING, {french: req.body.french, english: req.body.english});
		res.send({ action : "gaming-added", country: { id: country_id, french : req.body.french, english: req.body.english }});
	}
	catch (error) {
		console.error("Error adding gaming:", error);
		res.send({ action: "add-gaming-failed" });
	}
});

app.post("/change-gaming", jsonParser, async (req : any, res : any) => {
	try {
		await DatabaseConnection.ChangeRow(Tables.GAMING, req.body.id, { french: req.body.french, english: req.body.english });
		res.send({ action: "gaming-changed", word: { id: req.body.id } });
	}
	catch (error) {
		console.error("Error changing country:", error);
		res.send({ action: "change-gaming-failed" });
	}
});

app.post("/remove-gaming", jsonParser, async (req : any, res : any) => {
	try {
		await DatabaseConnection.RemoveFromTable(Tables.GAMING, req.body.id);
		res.send({ action: "gaming-removed", word: { id: req.body.id } });
	}
	catch (error) {
		console.error("Error removing country:", error);
		res.send({ action: "remove-gaming-failed" });
	}
});
*/


app.post("/register", jsonParser, async (req : any, res : any) => {
	try {
		var result = await UserManager.createUser(req.body.username, req.body.first_name, req.body.last_name, req.body.password_hash);
		if (result.success) res.send({ action: "login-success", user_uuid: result.uuid });
		else res.send({ action: "login-failed" });
	}
	catch (error) {
		console.error("Error registering user:", error);
		res.send({ action: "login-failed" });
	}
});

app.post("/login", jsonParser, async (req : any, res : any) => {
	try {
		console.log(req.body);
		var result = await UserManager.login(req.body.username, req.body.password_hash);
		if (result.success) res.send({ action: "login-success", user_uuid: result.uuid });
		else res.send({ action: "login-failed" });
	}
	catch (error) {
		console.error("Error logging in user:", error);
		res.send({ action: "login-failed" });
	}
});

app.get("/users", jsonParser, async (req : any, res : any) => {
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

app.post("/update-score", jsonParser, async (req : any, res : any) => {
	try 
	{
		//console.log("Updating score for user " + req.body.player_id + " to " + req.body.new_score);
		var result = await UserManager.updateUserScore(req.body.player_id, req.body.new_score);
		if (result.success) res.send({ action: "score-updated", player_id: req.body.player_id, new_score: result.new_score });
		else res.send({ action: "score-update-failed" });
	}
	catch (error) {
		console.error("Error updating user score:", error);
		res.send({ action: "score-update-failed" });
	}
});

app.get("/leaderboard", async (req : any, res : any) => {
	try {
		var result : any = await DatabaseConnection.GetLeaderboard();
		if (result.success) res.send({ action: "leaderboard", leaderboard: result.leaderboard });
		else res.send({ action: "leaderboard-failed" });
	}
	catch (error) {
		console.error("Error fetching leaderboard:", error);
		res.send({ action: "leaderboard-failed" });
	}
});

// SERVER-ADDRESS/user/<user_id>
app.get("/user/:user_id", async (req : any, res : any) => {
	try {
		var result : any = await UserManager.getUserInfo(req.params.user_id);
		if (result.success) res.send({ action: "user-info", user_info: result.user_info });
		else res.send({ action: "user-info-failed" });
	}
	catch (error) {
		console.error("Error fetching user info:", error);
		res.send({ action: "user-info-failed" });
	}
});

app.get("/lobbies", async (req : any, res : any) => {
	//console.log(lobbies);
	try {
		let lobbies : any = await GameManager.getLobbies();
		res.send({ action: "set-lobbies", lobbies: lobbies });
	}
	catch (error) {
		console.error("Error fetching lobbies:", error);
		res.send({ action: "set-lobbies", lobbies: [] });
	}
});

// SERVER/owner/<lobby_id>?player_id=<player_id>
app.get("/owner/:lobby_id", jsonParser, async (req : any, res : any) => {
	try {
		let result : boolean = await GameManager.testOwnership(req.params.lobby_id, req.query.player_id);
		res.send({
			action: "test-ownership",
			result: result,
		});
	}
	catch (error) {
		console.error("Error testing lobby ownership:", error);
		res.send({ action: "test-ownership", result: false });
	}
});

app.get("/me", jsonParser, async (req : any, res : any) => {
	try{
		const user_id = req.body.user_id;
		let user = await UserManager.getUserInfo(user_id);
		res.send({ user : user });
	}
	catch (error) {
		console.error("Error /me :", req.body.user_id);
	}
});

//app.listen(app.get("port"));
httpServer.listen(Constants.SERVER_PORT, () => {
	console.log(`HTTP Server running on port ${Constants.SERVER_PORT}`);
});



console.log("Server running !");
